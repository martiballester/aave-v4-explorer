// Merge AaveKit GraphQL responses (and RPC-crawled chains, emitted in the same
// shapes) + editorial overrides into the AaveParams shape the UI consumes
// (DATA-CONTRACT.md). The UI never sees raw GraphQL.
//
// Everything is chain-scoped: hubs are resolved by (chainId, address), since
// V4 contracts can share an address across chains and several chains run a
// hub called "Core" with a spoke called "Main".

import type {
  AaveParams,
  AssetMetadata,
  ChainSummary,
  CreditLine,
  CurvePoint,
  Hub,
  HubAsset,
  HubId,
  HubSpokeRef,
  IRM,
  Reserve,
  Spoke,
} from './types';
import type {
  GqlHub,
  GqlHubAsset,
  GqlReserve,
  GqlSpoke,
  HubSpokeConfigForPair,
} from './graphql/types';
import type { ChainInfo } from './chains';
import { reserveKey, spokeKey, ZERO_ADDRESS, type RpcReads } from './rpc/reads';
import {
  buildAssetMeta,
  deriveHubId,
  deriveSpokeSlug,
  hubEditorialFor,
  spokeTypeFor,
  type TokenSeen,
} from './editorial';

const num = (s: string | null | undefined): number => {
  if (s == null) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const pct = (s: string | null | undefined): number => num(s) / 100; // .normalized is already %
const lc = (a: string) => a.toLowerCase();

function buildIrm(settings: GqlHubAsset['settings']): IRM | null {
  // V4 wraps assets without an IRM (credit lines, etc.). Treat zero-optimal as
  // "no curve" — the rest of the UI handles `irm: null` gracefully.
  const optimal = pct(settings.optimalUtilizationRate.normalized);
  if (!optimal) return null;
  return {
    base: pct(settings.baseBorrowRate.normalized),
    slope1: pct(settings.slopeBelowOptimal.normalized),
    slope2: pct(settings.slopeAboveOptimal.normalized),
    optimal,
  };
}

function evalBorrowRate(irm: IRM | null, utilization: number): number | null {
  if (!irm) return null;
  if (utilization <= irm.optimal) {
    return irm.base + (utilization / irm.optimal) * irm.slope1;
  }
  const u = utilization - irm.optimal;
  const range = 1 - irm.optimal;
  return irm.base + irm.slope1 + (u / range) * irm.slope2;
}

function sampleIrmCurve(irm: IRM | null, n = 40): CurvePoint[] {
  if (!irm) return [];
  const out: CurvePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const borrow = evalBorrowRate(irm, u) ?? 0;
    out.push({ u, borrow, supply: borrow * u });
  }
  return out;
}

export interface ChainLoadStatus {
  chainId: number;
  status: 'ok' | 'error';
  error?: string;
}

export interface RawData {
  chains: ChainInfo[];
  chainStatus: ChainLoadStatus[];
  hubs: GqlHub[];
  hubAssetsByHubId: Record<string, GqlHubAsset[]>;
  spokes: GqlSpoke[];
  reservesBySpokeId: Record<string, GqlReserve[]>;
  hubSpokeConfigsByPair: HubSpokeConfigForPair[];
  rpc: RpcReads;
}

export function transform(raw: RawData): AaveParams {
  const chainById = new Map(raw.chains.map((c) => [c.chainId, c]));
  const chainOrder = new Map(raw.chains.map((c, i) => [c.chainId, i]));
  const hubKey = (chainId: number, addr: string) => `${chainId}|${lc(addr)}`;

  // ---------- 0. Hub ids ----------
  // `<chain slug>-<hub name>`; a same-name collision on one chain gets an
  // address suffix. Every later reference resolves a hub by (chain, address).
  const hubIdByKey = new Map<string, HubId>();
  const takenIds = new Set<string>();
  for (const h of raw.hubs) {
    const chain = chainById.get(h.chain.chainId);
    const slug = chain?.slug ?? String(h.chain.chainId);
    let id = deriveHubId(slug, h.address, h.name);
    if (takenIds.has(id)) id = `${id}-${h.address.slice(2, 6).toLowerCase()}`;
    takenIds.add(id);
    hubIdByKey.set(hubKey(h.chain.chainId, h.address), id);
  }
  const hubIdOf = (chainId: number, addr: string): HubId | null =>
    hubIdByKey.get(hubKey(chainId, addr)) ?? null;

  // ---------- 1. Hubs (without assets yet) ----------
  const hubsById = new Map<HubId, Hub>();
  for (const h of raw.hubs) {
    const id = hubIdOf(h.chain.chainId, h.address)!;
    const chain = chainById.get(h.chain.chainId);
    const seed = chain?.hubs?.find((s) => lc(s.address) === lc(h.address));
    const ed = hubEditorialFor(h.name, seed);
    hubsById.set(id, {
      id,
      label: ed.label,
      tag: ed.tag,
      color: ed.color,
      address: h.address,
      gqlId: h.id,
      chain: {
        chainId: h.chain.chainId,
        name: chain?.label ?? h.chain.name ?? String(h.chain.chainId),
        explorer: chain?.explorer ?? h.chain.explorerUrl ?? '',
        slug: chain?.slug ?? String(h.chain.chainId),
        icon: chain?.icon ?? '',
      },
      summary: {
        totalSupplied: num(h.summary.totalSupplied.current.value),
        totalBorrowed: num(h.summary.totalBorrowed.current.value),
        totalSupplyCap: num(h.summary.totalSupplyCap.value),
        totalBorrowCap: num(h.summary.totalBorrowCap.value),
        utilizationRate: pct(h.summary.utilizationRate.normalized),
        assetCount: 0,
        spokeCount: 0,
      },
      assets: [],
      spokes: [],
    });
  }

  // ---------- 2. Per-hub assets ----------
  // Display symbols: unique per hub. A hub can list two different tokens that
  // share a ticker (seen on OP); the later ones get a short address suffix.
  const tokens: TokenSeen[] = [];
  const aliases: Array<{ symbol: string; base: string; credit?: boolean }> = [];
  const displaySymbol = new Map<string, string>(); // `${hubKey}|${underlying}` → symbol

  const capAggByHubAsset = new Map<string, { addCap: number; drawCap: number }>();
  for (const pair of raw.hubSpokeConfigsByPair) {
    const hid = hubIdOf(pair.chainId, pair.hubAddress);
    if (!hid) continue;
    for (const c of pair.entries) {
      const key = `${hid}|${c.asset.onchainAssetId}`;
      const cur = capAggByHubAsset.get(key) ?? { addCap: 0, drawCap: 0 };
      cur.addCap += num(c.supplyCap.exchange.value);
      cur.drawCap += num(c.borrowCap.exchange.value);
      capAggByHubAsset.set(key, cur);
    }
  }

  for (const [hubId, hub] of hubsById) {
    const list = raw.hubAssetsByHubId[hub.gqlId] ?? [];
    const used = new Set<string>();
    hub.assets = list.map((a) => {
      const rawSym = a.underlying.info.symbol;
      let sym = rawSym;
      if (used.has(sym)) {
        sym = `${rawSym}·${a.underlying.address.slice(2, 6).toLowerCase()}`;
        aliases.push({ symbol: sym, base: rawSym });
      }
      used.add(sym);
      displaySymbol.set(`${hubKey(hub.chain.chainId, hub.address)}|${lc(a.underlying.address)}`, sym);
      tokens.push({
        symbol: rawSym,
        chainId: hub.chain.chainId,
        address: a.underlying.address,
        name: a.underlying.info.name,
        icon: a.underlying.info.icon,
        categories: a.underlying.info.categories,
      });
      const capAgg = capAggByHubAsset.get(`${hubId}|${a.onchainAssetId}`) ?? { addCap: 0, drawCap: 0 };
      return {
        symbol: sym,
        underlying: a.underlying.address,
        decimals: a.underlying.info.decimals,
        feeReceiver: a.settings.feeReceiver,
        liquidityFee: pct(a.settings.liquidityFee.normalized),
        irStrategy: a.settings.irStrategy,
        reinvestmentController: a.settings.reinvestmentController,
        irm: buildIrm(a.settings),
        summary: {
          supplied: num(a.summary.supplied.exchange.value),
          borrowed: num(a.summary.borrowed.exchange.value),
          availableLiquidity: num(a.summary.availableLiquidity.exchange.value),
          utilizationRate: pct(a.summary.utilizationRate.normalized),
          supplyApy: pct(a.summary.supplyApy.normalized),
          borrowApy: pct(a.summary.borrowApy.normalized),
          netApy: pct(a.summary.netApy.normalized),
          addCap: capAgg.addCap,
          drawCap: capAgg.drawCap,
          reservesCount: a.summary.reservesCount,
          activeReservesCount: a.summary.activeReservesCount,
        },
      } satisfies HubAsset;
    });
    hub.summary.assetCount = hub.assets.length;
  }

  // ---------- 3. Spokes ----------
  // Parent hub for each spoke is DATA-DERIVED: the hub holding most of the
  // spoke's collateral reserves (credit lines bring borrowables, not
  // collateral). Ties → first connected hub; zero collateral → connected[0].
  const spokeById = new Map<string, Spoke>();
  const gqlIdBySpoke = new Map<string, string>();
  const spokeIdByKey = new Map<string, string>(); // `${chainId}|${address}` → id
  for (const s of raw.spokes) {
    const chainId = s.chain.chainId;
    const connected = s.connectedHubs
      .map((c) => hubIdOf(chainId, c.hub.address))
      .filter((id): id is HubId => id !== null);
    if (connected.length === 0) continue;

    const reservesList = raw.reservesBySpokeId[s.id] ?? [];
    const collateralByHub = new Map<HubId, number>();
    for (const r of reservesList) {
      if (!r.settings.collateral) continue;
      const h = hubIdOf(chainId, r.asset.hub.address);
      if (h) collateralByHub.set(h, (collateralByHub.get(h) ?? 0) + 1);
    }
    let parentHub = connected[0];
    let maxCount = 0;
    for (const h of connected) {
      const count = collateralByHub.get(h) ?? 0;
      if (count > maxCount) {
        maxCount = count;
        parentHub = h;
      }
    }

    let id = deriveSpokeSlug(parentHub, s.name, s.address);
    if (spokeById.has(id)) id = `${id}-${s.address.slice(2, 6).toLowerCase()}`;
    gqlIdBySpoke.set(id, s.id);
    spokeIdByKey.set(`${chainId}|${lc(s.address)}`, id);

    const lcfg = s.liquidationConfig;
    // AaveKit pre-decodes targetHealthFactor / healthFactorForMaxBonus to a
    // decimal string (e.g. "1.174000000000000000"). No /1e18 needed here.
    const liq = lcfg
      ? {
          targetHF: num(lcfg.targetHealthFactor),
          hfForMaxBonus: num(lcfg.healthFactorForMaxBonus),
          liqBonusFactor: pct(lcfg.liquidationBonusFactor.normalized),
        }
      : { targetHF: 1.05, hfForMaxBonus: 0.93, liqBonusFactor: 0.3 };

    const imm = raw.rpc.spokeImmutables.get(spokeKey(chainId, s.address));
    spokeById.set(id, {
      id,
      chainId,
      name: s.name,
      type: spokeTypeFor(s.name),
      address: s.address,
      hubId: parentHub,
      connectedHubs: connected,
      summary: {
        totalSupplied: num(s.summary.totalSupplied.value),
        totalBorrowed: num(s.summary.totalBorrowed.value),
        utilizationRate: 0,
        uniqueAssets: s.summary.uniqueAssets,
        connectedHubs: s.summary.connectedHubs,
        oracle: imm?.oracle ?? ZERO_ADDRESS,
        maxUserReservesLimit: imm?.maxUserReservesLimit ?? 0,
      },
      liquidationConfig: liq,
      reserves: [],
    });
  }

  // ---------- 4. Reserves per spoke ----------
  for (const spoke of spokeById.values()) {
    const list = raw.reservesBySpokeId[gqlIdBySpoke.get(spoke.id)!] ?? [];
    spoke.reserves = list.map((r): Reserve => {
      const hubId = hubIdOf(spoke.chainId, r.asset.hub.address);
      const rawSym = r.asset.underlying.info.symbol;
      tokens.push({
        symbol: rawSym,
        chainId: spoke.chainId,
        address: r.asset.underlying.address,
        name: r.asset.underlying.info.name,
        icon: r.asset.underlying.info.icon,
        categories: r.asset.underlying.info.categories,
      });
      const baseSym =
        displaySymbol.get(
          `${hubKey(spoke.chainId, r.asset.hub.address)}|${lc(r.asset.underlying.address)}`,
        ) ?? rawSym;
      // Multi-hub spokes (Bluechip on Prime+Core, Ethena Ecosystem on
      // Plus+Core) can hold the same underlying twice — once from the parent
      // hub, once as a credit line. Prefix credit-line reserves with 'c' so
      // React keys stay unique AND the UI signals "this is a credit route".
      const isCreditLine = hubId != null && hubId !== spoke.hubId;
      const sym = isCreditLine ? `c${baseSym}` : baseSym;
      if (isCreditLine) aliases.push({ symbol: sym, base: rawSym, credit: true });
      const supplied = num(r.summary.supplied.exchange.value);
      const suppliedTokens = num(r.summary.supplied.amount.value);
      return {
        symbol: sym,
        underlying: r.asset.underlying.address,
        hub: hubId ?? spoke.hubId,
        hubAddress: r.asset.hub.address,
        assetId: Number(r.onChainId),
        decimals: r.asset.underlying.info.decimals,
        collateralRisk: pct(r.settings.collateralRisk.normalized),
        paused: !!r.status?.paused,
        frozen: !!r.status?.frozen,
        borrowable: r.settings.borrowable,
        collateral: r.settings.collateral,
        receiveSharesEnabled: r.settings.receiveSharesEnabled,
        dynamicConfigKey: Number(r.settings.latestDynamicConfigKey),
        collateralFactor: pct(r.settings.collateralFactor.normalized),
        maxLiquidationBonus: pct(r.settings.maxLiquidationBonus.normalized),
        liquidationFee: pct(r.settings.liquidationFee.normalized),
        suppliedAmount: supplied,
        borrowedAmount: num(r.summary.borrowed.exchange.value),
        supplyCap: num(r.settings.supplyCap.exchange.value),
        borrowCap: num(r.settings.borrowCap.exchange.value),
        supplyApy: pct(r.summary.supplyApy.normalized),
        borrowApy: pct(r.summary.borrowApy.normalized),
        oracle: {
          source:
            raw.rpc.reserveSources.get(reserveKey(spoke.chainId, spoke.address, Number(r.onChainId))) ??
            ZERO_ADDRESS,
          description: `${sym} / USD`,
          price: supplied > 0 && suppliedTokens > 0 ? supplied / suppliedTokens : 1,
          decimals: 8,
        },
      };
    });
    spoke.summary.utilizationRate =
      spoke.summary.totalSupplied > 0 ? spoke.summary.totalBorrowed / spoke.summary.totalSupplied : 0;
  }

  // Order: registry chain order, then TVL within a chain.
  const byChainThenTvl = <T extends { chainId: number; tvl: number }>(a: T, b: T) =>
    (chainOrder.get(a.chainId) ?? 99) - (chainOrder.get(b.chainId) ?? 99) || b.tvl - a.tvl;
  const hubs = [...hubsById.values()].sort((a, b) =>
    byChainThenTvl(
      { chainId: a.chain.chainId, tvl: a.summary.totalSupplied },
      { chainId: b.chain.chainId, tvl: b.summary.totalSupplied },
    ),
  );
  const spokes = [...spokeById.values()].sort((a, b) =>
    byChainThenTvl(
      { chainId: a.chainId, tvl: a.summary.totalSupplied },
      { chainId: b.chainId, tvl: b.summary.totalSupplied },
    ),
  );

  // ---------- 5. Hub spoke ref list (for the matrix tab) ----------
  for (const hub of hubs) {
    const hubSpokes: HubSpokeRef[] = spokes
      .filter((sp) => sp.hubId === hub.id)
      .map((sp) => ({
        id: sp.id,
        label: sp.name,
        type: sp.type,
        collateral: sp.reserves.filter((r) => r.collateral).map((r) => r.symbol),
        borrowable: sp.reserves.filter((r) => r.borrowable).map((r) => r.symbol),
      }));
    hub.spokes = hubSpokes;
    hub.summary.spokeCount = hubSpokes.length;
  }

  // ---------- 6. Credit lines (derived from hubSpokeConfigsByPair) ----------
  // A credit line is a (hub, spoke, asset) cap where the spoke's parent hub
  // differs from the hub providing the cap. Always intra-chain.
  const linesByKey = new Map<string, CreditLine>();
  for (const pair of raw.hubSpokeConfigsByPair) {
    const sourceHub = hubIdOf(pair.chainId, pair.hubAddress);
    const spokeId = spokeIdByKey.get(`${pair.chainId}|${lc(pair.spokeAddress)}`);
    if (!sourceHub || !spokeId) continue;
    const spoke = spokeById.get(spokeId)!;
    if (spoke.hubId === sourceHub) continue; // same-hub draws aren't credit lines
    for (const c of pair.entries) {
      const addCap = num(c.supplyCap.exchange.value);
      const drawCap = num(c.borrowCap.exchange.value);
      if (addCap === 0 && drawCap === 0) continue;
      const sym = c.asset.underlying.info.symbol;
      const key = `${sourceHub}|${spoke.hubId}|${spokeId}`;
      let line = linesByKey.get(key);
      if (!line) {
        line = {
          chainId: pair.chainId,
          from: sourceHub,
          to: spoke.hubId,
          toSpoke: spokeId,
          assets: [],
          index: linesByKey.size,
          riskPremiumThreshold: pct(c.riskPremiumThreshold.normalized),
          capByAsset: {},
        };
        linesByKey.set(key, line);
      }
      if (!line.assets.includes(sym)) line.assets.push(sym);
      // The matching credit-line reserve on the destination spoke carries the
      // live supplied/borrowed (c-prefixed in step 4, hub address = source).
      const matchingReserve = spoke.reserves.find(
        (r) =>
          (r.symbol === `c${sym}` || r.symbol === sym) &&
          lc(r.hubAddress) === lc(pair.hubAddress),
      );
      line.capByAsset[sym] = {
        addCap,
        drawCap,
        supplied: matchingReserve?.suppliedAmount ?? 0,
        borrowed: matchingReserve?.borrowedAmount ?? 0,
      };
    }
  }
  const creditLines = [...linesByKey.values()];

  // ---------- 7. Per-chain summaries ----------
  const statusById = new Map(raw.chainStatus.map((s) => [s.chainId, s]));
  const chains: ChainSummary[] = raw.chains.map((c) => {
    const ch = hubs.filter((h) => h.chain.chainId === c.chainId);
    const cs = spokes.filter((s) => s.chainId === c.chainId);
    const st = statusById.get(c.chainId);
    return {
      chainId: c.chainId,
      slug: c.slug,
      label: c.label,
      icon: c.icon,
      explorer: c.explorer,
      source: c.source,
      operator: c.operator,
      status: st?.status === 'error' ? 'error' : ch.length === 0 ? 'empty' : 'ok',
      error: st?.error,
      totals: {
        supplied: ch.reduce((t, h) => t + h.summary.totalSupplied, 0),
        borrowed: ch.reduce((t, h) => t + h.summary.totalBorrowed, 0),
        hubs: ch.length,
        spokes: cs.length,
        reserves: cs.reduce((t, s) => t + s.reserves.length, 0),
      },
    };
  });

  return buildApi({
    chains,
    hubs,
    spokes,
    creditLines,
    assetMeta: buildAssetMeta(tokens, aliases),
  });
}

/** Wrap the plain collections with the lookup helpers the UI calls. */
export function buildApi(d: {
  chains: ChainSummary[];
  hubs: Hub[];
  spokes: Spoke[];
  creditLines: CreditLine[];
  assetMeta: Record<string, AssetMetadata>;
}): AaveParams {
  const { hubs, spokes, creditLines } = d;
  return {
    ...d,
    helpers: { sampleIrmCurve, evalBorrowRate },
    getHub: (id) => hubs.find((h) => h.id === id),
    getSpoke: (id) => spokes.find((s) => s.id === id),
    getReserve: (spokeId, sym) =>
      spokes.find((s) => s.id === spokeId)?.reserves.find((r) => r.symbol === sym),
    creditLinesForSpoke: (spokeId) => creditLines.filter((c) => c.toSpoke === spokeId),
  };
}

/** Narrow a full dataset to one chain. `chains` stays complete so the
 *  switcher can still list every network. */
export function scopeToChain(data: AaveParams, chainId: number | 'all'): AaveParams {
  if (chainId === 'all') return data;
  return buildApi({
    chains: data.chains,
    hubs: data.hubs.filter((h) => h.chain.chainId === chainId),
    spokes: data.spokes.filter((s) => s.chainId === chainId),
    creditLines: data.creditLines.filter((c) => c.chainId === chainId),
    assetMeta: data.assetMeta,
  });
}
