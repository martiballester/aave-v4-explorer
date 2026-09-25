// On-chain crawler for V4 deployments AaveKit doesn't index (source: 'rpc' in
// chains.ts — e.g. the EtherFi white-label on OP Mainnet).
//
// Starting from the registry's hub addresses it walks
//   hub → assets → connected spokes → reserves → oracle prices
// in six Multicall3 rounds and emits the SAME shapes the AaveKit adapter
// produces (GqlHub / GqlHubAsset / GqlSpoke / GqlReserve / per-pair configs),
// so transform.ts treats both sources identically.
//
// Derived figures use the formulas the V4 contracts use, and were checked
// against AaveKit on Ethereum Core (EURC, frxUSD, GHO — borrow/supply APY
// and utilization agree to 4 decimals):
//   utilization = totalOwed / addedAssets
//   borrow APR  = drawnRate / 1e27            (ray, per year)
//   supply APR  = borrow APR × utilization × (1 − liquidityFee)
//   APY         = (1 + APR / secondsPerYear) ^ secondsPerYear − 1

import type { Abi, ContractFunctionParameters, PublicClient } from 'viem';
import type { ChainInfo, RpcHubSeed } from '../chains';
import type {
  GqlHub,
  GqlHubAsset,
  GqlHubSpokeConfig,
  GqlReserve,
  GqlSpoke,
  HubSpokeConfigForPair,
} from '../graphql/types';
import type { Address } from '../types';
import { ERC20_ABI, HUB_ABI, IR_STRATEGY_ABI, ORACLE_ABI, SPOKE_ABI } from './abis';
import { emptyRpcReads, reserveKey, spokeKey, ZERO_ADDRESS, type RpcReads } from './reads';

export interface ChainRawData {
  hubs: GqlHub[];
  hubAssetsByHubId: Record<string, GqlHubAsset[]>;
  spokes: GqlSpoke[];
  reservesBySpokeId: Record<string, GqlReserve[]>;
  hubSpokeConfigsByPair: HubSpokeConfigForPair[];
  rpc: RpcReads;
}

type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

/** Multicall with per-call failure tolerance; failed calls come back
 *  undefined. With allowFailure, viem reports a dead RPC as every call
 *  failing rather than throwing, so a round where NOTHING succeeds is treated
 *  as an outage and thrown: the chain is then flagged as failed instead of
 *  rendering as an empty $0 deployment. (Single reverts are expected: the
 *  treasury spoke reverts on lending-spoke views.) */
async function mc(client: PublicClient, calls: Call[]): Promise<unknown[]> {
  if (calls.length === 0) return [];
  const res = await client.multicall({
    allowFailure: true,
    contracts: calls as unknown as ContractFunctionParameters[],
  });
  if (res.every((r) => r.status === 'failure')) {
    const first = res[0];
    throw first.status === 'failure' ? first.error : new Error('multicall returned no results');
  }
  return res.map((r) => (r.status === 'success' ? r.result : undefined));
}

const lc = (a: string) => a.toLowerCase();
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const units = (x: unknown, decimals: number) => Number((x as bigint | undefined) ?? 0n) / 10 ** decimals;
const SECONDS_PER_YEAR = 31_536_000;
const toApy = (apr: number) => Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1;

// Gql value helpers — AaveKit ships numbers as strings, percents as "12.5".
const v = (n: number) => ({ value: String(n) });
const pctStr = (fraction: number) => ({ normalized: String(fraction * 100) });
const amt = (tokens: number, usd: number) => ({ amount: v(tokens), exchange: v(usd) });

export async function crawlRpcChain(chain: ChainInfo, client: PublicClient): Promise<ChainRawData> {
  const seeds = chain.hubs ?? [];
  const chainRef = { chainId: chain.chainId, name: chain.label, explorerUrl: chain.explorer };
  const hubGqlId = (h: Address) => `rpc:${chain.chainId}:${lc(h)}`;
  const spokeGqlId = (s: Address) => `rpc:${chain.chainId}:${lc(s)}`;

  // ---- Round 1: asset count + "uncapped" sentinel per hub ----
  const r1 = await mc(
    client,
    seeds.flatMap((h) => [
      { address: h.address, abi: HUB_ABI, functionName: 'getAssetCount' },
      { address: h.address, abi: HUB_ABI, functionName: 'MAX_ALLOWED_SPOKE_CAP' },
    ]),
  );
  const maxSpokeCap = new Map<string, number>();
  const assetRefs: Array<{ hub: RpcHubSeed; assetId: number }> = [];
  seeds.forEach((h, i) => {
    maxSpokeCap.set(lc(h.address), Number(r1[i * 2 + 1] ?? 0));
    range(Number(r1[i * 2] ?? 0)).forEach((assetId) => assetRefs.push({ hub: h, assetId }));
  });

  // ---- Round 2: per-asset hub state ----
  const PER_ASSET = [
    'getAssetUnderlyingAndDecimals',
    'getAssetConfig',
    'getAddedAssets',
    'getAssetTotalOwed',
    'getAssetLiquidity',
    'getAssetDrawnRate',
    'getSpokeCount',
  ] as const;
  const r2 = await mc(
    client,
    assetRefs.flatMap((a) =>
      PER_ASSET.map((fn) => ({
        address: a.hub.address,
        abi: HUB_ABI,
        functionName: fn,
        args: [BigInt(a.assetId)],
      })),
    ),
  );
  const assets = assetRefs.map((a, i) => {
    const g = (k: number) => r2[i * PER_ASSET.length + k];
    const ud = g(0) as readonly [Address, number] | undefined;
    const cfg = g(1) as readonly [Address, number, Address, Address] | undefined;
    const decimals = Number(ud?.[1] ?? 18);
    const added = units(g(2), decimals);
    const owed = units(g(3), decimals);
    const liquidityFee = Number(cfg?.[1] ?? 0) / 1e4;
    const borrowApr = Number((g(5) as bigint | undefined) ?? 0n) / 1e27;
    const util = added > 0 ? owed / added : 0;
    return {
      ...a,
      underlying: ud?.[0] ?? ZERO_ADDRESS,
      decimals,
      feeReceiver: cfg?.[0] ?? ZERO_ADDRESS,
      liquidityFee,
      irStrategy: cfg?.[2] ?? ZERO_ADDRESS,
      reinvestment: cfg?.[3] ?? ZERO_ADDRESS,
      added,
      owed,
      liquidity: units(g(4), decimals),
      util,
      borrowApy: toApy(borrowApr),
      supplyApy: toApy(borrowApr * util * (1 - liquidityFee)),
      spokeCount: Number(g(6) ?? 0),
    };
  });

  // ---- Round 3: spoke addresses per asset, IRM params, token metadata ----
  const spokeSlots = assets.flatMap((a, ai) => range(a.spokeCount).map((i) => ({ ai, i })));
  const underlyings = [...new Set(assets.map((a) => lc(a.underlying)))] as Address[];
  const r3 = await mc(client, [
    ...spokeSlots.map(({ ai, i }) => ({
      address: assets[ai].hub.address,
      abi: HUB_ABI,
      functionName: 'getSpokeAddress',
      args: [BigInt(assets[ai].assetId), BigInt(i)],
    })),
    ...assets.map((a) => ({
      address: a.irStrategy,
      abi: IR_STRATEGY_ABI,
      functionName: 'getInterestRateData',
      args: [BigInt(a.assetId)],
    })),
    ...underlyings.flatMap((u) => [
      { address: u, abi: ERC20_ABI, functionName: 'symbol' },
      { address: u, abi: ERC20_ABI, functionName: 'name' },
    ]),
  ]);
  const spokesOfAsset = assets.map(() => [] as Address[]);
  spokeSlots.forEach(({ ai }, k) => {
    const s = r3[k] as Address | undefined;
    if (s) spokesOfAsset[ai].push(s);
  });
  const irmOf = assets.map(
    (_, ai) => r3[spokeSlots.length + ai] as readonly [number, number, number, number] | undefined,
  );
  const tokenInfo = new Map<string, { symbol: string; name: string }>();
  underlyings.forEach((u, k) => {
    const base = spokeSlots.length + assets.length + k * 2;
    const symbol = (r3[base] as string | undefined) ?? u.slice(0, 8);
    tokenInfo.set(u, { symbol, name: (r3[base + 1] as string | undefined) ?? symbol });
  });

  // ---- Round 4: spoke-level reads. Non-lending spokes (the treasury spoke
  // that receives fees) revert on getReserveCount and are dropped here. ----
  const candidateSpokes = [...new Set(spokesOfAsset.flat().map(lc))] as Address[];
  const r4 = await mc(
    client,
    candidateSpokes.flatMap((s) => [
      { address: s, abi: SPOKE_ABI, functionName: 'getReserveCount' },
      { address: s, abi: SPOKE_ABI, functionName: 'getLiquidationConfig' },
      { address: s, abi: SPOKE_ABI, functionName: 'ORACLE' },
      { address: s, abi: SPOKE_ABI, functionName: 'MAX_USER_RESERVES_LIMIT' },
    ]),
  );
  const lendingSpokes = candidateSpokes
    .map((address, k) => ({
      address,
      reserveCount: r4[k * 4] as bigint | undefined,
      liq: r4[k * 4 + 1] as readonly [bigint, bigint, number] | undefined,
      oracle: (r4[k * 4 + 2] as Address | undefined) ?? ZERO_ADDRESS,
      maxUserReserves: Number(r4[k * 4 + 3] ?? 0),
    }))
    .filter((s) => s.reserveCount !== undefined)
    .map((s) => ({ ...s, reserveCount: Number(s.reserveCount) }));
  const oracles = [...new Set(lendingSpokes.map((s) => s.oracle).filter((o) => o !== ZERO_ADDRESS))];

  // ---- Round 5: per reserve + per (asset, spoke) caps + oracle decimals ----
  const reserveRefs = lendingSpokes.flatMap((s) =>
    range(s.reserveCount).map((id) => ({ spoke: s, id })),
  );
  const PER_RESERVE = 5;
  const capPairs = assets.flatMap((_, ai) =>
    spokesOfAsset[ai]
      .filter((s) => lendingSpokes.some((ls) => ls.address === lc(s)))
      .map((s) => ({ ai, spoke: lc(s) as Address })),
  );
  const r5 = await mc(client, [
    ...reserveRefs.flatMap(({ spoke, id }) => [
      { address: spoke.address, abi: SPOKE_ABI, functionName: 'getReserve', args: [BigInt(id)] },
      { address: spoke.address, abi: SPOKE_ABI, functionName: 'getReserveSuppliedAssets', args: [BigInt(id)] },
      { address: spoke.address, abi: SPOKE_ABI, functionName: 'getReserveTotalDebt', args: [BigInt(id)] },
      { address: spoke.oracle, abi: ORACLE_ABI, functionName: 'getReservePrice', args: [BigInt(id)] },
      { address: spoke.oracle, abi: ORACLE_ABI, functionName: 'getReserveSource', args: [BigInt(id)] },
    ]),
    ...capPairs.map(({ ai, spoke }) => ({
      address: assets[ai].hub.address,
      abi: HUB_ABI,
      functionName: 'getSpoke',
      args: [BigInt(assets[ai].assetId), spoke],
    })),
    ...oracles.map((o) => ({ address: o, abi: ORACLE_ABI, functionName: 'decimals' })),
  ]);
  const capBase = reserveRefs.length * PER_RESERVE;
  const oracleBase = capBase + capPairs.length;
  const oracleDecimals = new Map<string, number>();
  oracles.forEach((o, k) => oracleDecimals.set(lc(o), Number(r5[oracleBase + k] ?? 8)));

  type ReserveTuple = readonly [Address, Address, number, number, number, number, number];
  const reserves = reserveRefs.map(({ spoke, id }, k) => {
    const g = (j: number) => r5[k * PER_RESERVE + j];
    const t = g(0) as ReserveTuple | undefined;
    const decimals = Number(t?.[3] ?? 18);
    const price =
      Number((g(3) as bigint | undefined) ?? 0n) / 10 ** (oracleDecimals.get(lc(spoke.oracle)) ?? 8);
    return {
      spoke,
      id,
      underlying: t?.[0] ?? ZERO_ADDRESS,
      hub: t?.[1] ?? ZERO_ADDRESS,
      assetId: Number(t?.[2] ?? 0),
      decimals,
      collateralRiskBps: Number(t?.[4] ?? 0),
      flags: Number(t?.[5] ?? 0),
      dynamicConfigKey: Number(t?.[6] ?? 0),
      supplied: units(g(1), decimals),
      borrowed: units(g(2), decimals),
      price,
      source: (g(4) as Address | undefined) ?? ZERO_ADDRESS,
    };
  });

  // Hub assets carry no price; take it from any spoke reserve listing them.
  const priceOf = new Map<string, number>();
  for (const r of reserves) {
    const key = `${lc(r.hub)}|${r.assetId}`;
    if (r.price > 0 && !priceOf.has(key)) priceOf.set(key, r.price);
  }
  const assetPrice = (hub: Address, assetId: number) => priceOf.get(`${lc(hub)}|${assetId}`) ?? 0;

  // Caps are in whole tokens; MAX_ALLOWED_SPOKE_CAP means "no cap" → 0 here,
  // which the UI already renders as "—".
  const capOf = new Map<string, { addCap: number; drawCap: number; rpt: number; active: boolean; halted: boolean }>();
  capPairs.forEach(({ ai, spoke }, k) => {
    const d = r5[capBase + k] as
      | readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean, boolean, bigint]
      | undefined;
    if (!d) return;
    const a = assets[ai];
    const sentinel = maxSpokeCap.get(lc(a.hub.address)) ?? 0;
    const cap = (x: bigint) => (Number(x) === sentinel ? 0 : Number(x));
    capOf.set(`${lc(a.hub.address)}|${a.assetId}|${spoke}`, {
      addCap: cap(d[4]),
      drawCap: cap(d[5]),
      rpt: Number(d[6]) / 1e4,
      active: d[7],
      halted: d[8],
    });
  });

  // ---- Round 6: the dynamic config each reserve currently points at ----
  const r6 = await mc(
    client,
    reserves.map((r) => ({
      address: r.spoke.address,
      abi: SPOKE_ABI,
      functionName: 'getDynamicReserveConfig',
      args: [BigInt(r.id), r.dynamicConfigKey],
    })),
  );

  // ================= Emit AaveKit-shaped objects =================
  const rpc = emptyRpcReads();
  const hubSeedByAddr = new Map(seeds.map((h) => [lc(h.address), h]));
  const hubRef = (addr: Address) => ({
    id: hubGqlId(addr),
    name: hubSeedByAddr.get(lc(addr))?.label ?? addr,
    address: addr,
  });

  // Reserves, grouped per spoke
  const reservesBySpokeId: Record<string, GqlReserve[]> = {};
  const reserveCountByAsset = new Map<string, { all: number; active: number }>();
  reserves.forEach((r, k) => {
    const dyn = r6[k] as readonly [number, number, number] | undefined;
    const cf = Number(dyn?.[0] ?? 0) / 1e4;
    const maxLb = Math.max(0, Number(dyn?.[1] ?? 1e4) - 1e4) / 1e4;
    const liqFee = Number(dyn?.[2] ?? 0) / 1e4;
    const paused = (r.flags & 0x01) !== 0;
    const frozen = (r.flags & 0x02) !== 0;
    const borrowable = (r.flags & 0x04) !== 0;
    const receiveShares = (r.flags & 0x08) !== 0;
    const asset = assets.find((a) => lc(a.hub.address) === lc(r.hub) && a.assetId === r.assetId);
    const cap = capOf.get(`${lc(r.hub)}|${r.assetId}|${lc(r.spoke.address)}`);
    const info = tokenInfo.get(lc(r.underlying)) ?? { symbol: r.underlying.slice(0, 8), name: '' };

    const countKey = `${lc(r.hub)}|${r.assetId}`;
    const c = reserveCountByAsset.get(countKey) ?? { all: 0, active: 0 };
    c.all += 1;
    if (!paused && !frozen) c.active += 1;
    reserveCountByAsset.set(countKey, c);

    const sid = spokeGqlId(r.spoke.address);
    (reservesBySpokeId[sid] ??= []).push({
      id: `${sid}:${r.id}`,
      onChainId: String(r.id),
      status: { frozen, paused, active: true },
      canBorrow: borrowable && !paused && !frozen,
      canSupply: !paused && !frozen,
      canUseAsCollateral: cf > 0,
      asset: {
        onchainAssetId: String(r.assetId),
        underlying: {
          address: r.underlying,
          info: { symbol: info.symbol, decimals: r.decimals, name: info.name },
        },
        hub: { address: r.hub, name: hubRef(r.hub).name },
      },
      settings: {
        collateralFactor: pctStr(cf),
        maxLiquidationBonus: pctStr(maxLb),
        liquidationFee: pctStr(liqFee),
        collateralRisk: pctStr(r.collateralRiskBps / 1e4),
        borrowable,
        collateral: cf > 0,
        suppliable: !paused && !frozen,
        receiveSharesEnabled: receiveShares,
        latestDynamicConfigKey: String(r.dynamicConfigKey),
        supplyCap: amt(cap?.addCap ?? 0, (cap?.addCap ?? 0) * r.price),
        borrowCap: amt(cap?.drawCap ?? 0, (cap?.drawCap ?? 0) * r.price),
      },
      summary: {
        supplied: amt(r.supplied, r.supplied * r.price),
        borrowed: amt(r.borrowed, r.borrowed * r.price),
        supplyApy: pctStr(asset?.supplyApy ?? 0),
        borrowApy: pctStr(asset?.borrowApy ?? 0),
      },
    });
    rpc.reserveSources.set(reserveKey(chain.chainId, r.spoke.address, r.id), r.source);
  });

  // Spokes
  const spokes: GqlSpoke[] = lendingSpokes.map((s) => {
    const list = reservesBySpokeId[spokeGqlId(s.address)] ?? [];
    const connected = seeds.filter((h) =>
      assets.some(
        (a, ai) => a.hub === h && spokesOfAsset[ai].some((x) => lc(x) === s.address),
      ),
    );
    const label =
      connected.map((h) => h.spokeLabels?.[s.address]).find(Boolean) ??
      `Spoke ${s.address.slice(0, 6)}…${s.address.slice(-4)}`;
    rpc.spokeImmutables.set(spokeKey(chain.chainId, s.address), {
      oracle: s.oracle,
      maxUserReservesLimit: s.maxUserReserves,
    });
    return {
      id: spokeGqlId(s.address),
      name: label,
      address: s.address,
      chain: { chainId: chain.chainId },
      connectedHubs: connected.map((h) => ({ hub: hubRef(h.address) })),
      summary: {
        totalSupplied: v(list.reduce((t, r) => t + Number(r.summary.supplied.exchange.value), 0)),
        totalBorrowed: v(list.reduce((t, r) => t + Number(r.summary.borrowed.exchange.value), 0)),
        uniqueAssets: list.length,
        connectedHubs: connected.length,
      },
      liquidationConfig: s.liq
        ? {
            targetHealthFactor: String(Number(s.liq[0]) / 1e18),
            healthFactorForMaxBonus: String(Number(s.liq[1]) / 1e18),
            liquidationBonusFactor: pctStr(Number(s.liq[2]) / 1e4),
          }
        : null,
    };
  });

  // Hub assets + hub totals
  const hubAssetsByHubId: Record<string, GqlHubAsset[]> = {};
  const hubs: GqlHub[] = seeds.map((h) => {
    const list = assets.filter((a) => a.hub === h);
    let supplied = 0;
    let borrowed = 0;
    let supplyCap = 0;
    let borrowCap = 0;
    hubAssetsByHubId[hubGqlId(h.address)] = list.map((a) => {
      const px = assetPrice(h.address, a.assetId);
      const info = tokenInfo.get(lc(a.underlying)) ?? { symbol: a.underlying.slice(0, 8), name: '' };
      const irm = irmOf[assets.indexOf(a)];
      const counts = reserveCountByAsset.get(`${lc(h.address)}|${a.assetId}`) ?? { all: 0, active: 0 };
      supplied += a.added * px;
      borrowed += a.owed * px;
      for (const [key, c] of capOf) {
        if (!key.startsWith(`${lc(h.address)}|${a.assetId}|`)) continue;
        supplyCap += c.addCap * px;
        borrowCap += c.drawCap * px;
      }
      return {
        id: `${hubGqlId(h.address)}:${a.assetId}`,
        onchainAssetId: String(a.assetId),
        underlying: {
          address: a.underlying,
          info: { symbol: info.symbol, decimals: a.decimals, name: info.name },
        },
        settings: {
          feeReceiver: a.feeReceiver,
          liquidityFee: pctStr(a.liquidityFee),
          irStrategy: a.irStrategy,
          reinvestmentController: a.reinvestment === ZERO_ADDRESS ? null : a.reinvestment,
          optimalUtilizationRate: pctStr(Number(irm?.[0] ?? 0) / 1e4),
          baseBorrowRate: pctStr(Number(irm?.[1] ?? 0) / 1e4),
          slopeBelowOptimal: pctStr(Number(irm?.[2] ?? 0) / 1e4),
          slopeAboveOptimal: pctStr(Number(irm?.[3] ?? 0) / 1e4),
        },
        summary: {
          supplied: amt(a.added, a.added * px),
          borrowed: amt(a.owed, a.owed * px),
          availableLiquidity: amt(a.liquidity, a.liquidity * px),
          utilizationRate: pctStr(a.util),
          supplyApy: pctStr(a.supplyApy),
          borrowApy: pctStr(a.borrowApy),
          netApy: pctStr(a.supplyApy),
          reservesCount: counts.all,
          activeReservesCount: counts.active,
        },
      };
    });
    return {
      id: hubGqlId(h.address),
      name: h.label,
      address: h.address,
      chain: chainRef,
      summary: {
        totalSupplied: { current: v(supplied) },
        totalBorrowed: { current: v(borrowed) },
        totalSupplyCap: v(supplyCap),
        totalBorrowCap: v(borrowCap),
        utilizationRate: pctStr(supplied > 0 ? borrowed / supplied : 0),
      },
    };
  });

  // Per-(hub, spoke) cap entries — feeds hub cap aggregates + credit lines.
  const hubSpokeConfigsByPair: HubSpokeConfigForPair[] = [];
  for (const h of seeds) {
    for (const s of lendingSpokes) {
      const entries: GqlHubSpokeConfig[] = [];
      assets
        .filter((a) => a.hub === h)
        .forEach((a) => {
          const c = capOf.get(`${lc(h.address)}|${a.assetId}|${s.address}`);
          if (!c) return;
          const px = assetPrice(h.address, a.assetId);
          entries.push({
            asset: {
              onchainAssetId: String(a.assetId),
              underlying: { info: { symbol: tokenInfo.get(lc(a.underlying))?.symbol ?? '' } },
            },
            supplyCap: amt(c.addCap, c.addCap * px),
            borrowCap: amt(c.drawCap, c.drawCap * px),
            active: c.active,
            halted: c.halted,
            riskPremiumThreshold: pctStr(c.rpt),
          });
        });
      if (entries.length > 0) {
        hubSpokeConfigsByPair.push({
          chainId: chain.chainId,
          hubAddress: h.address,
          spokeAddress: s.address,
          entries,
        });
      }
    }
  }

  return { hubs, hubAssetsByHubId, spokes, reservesBySpokeId, hubSpokeConfigsByPair, rpc };
}
