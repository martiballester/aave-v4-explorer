// Merge AaveKit GraphQL responses + editorial overrides into the AaveParams
// shape the UI consumes (DATA-CONTRACT.md). The UI never sees raw GraphQL.

import type {
  AaveParams,
  Address,
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
  GqlHubSpokeConfig,
  GqlReserve,
  GqlSpoke,
} from './graphql/types';
import { HUB_ADDRESS_TO_ID, HUB_EDITORIAL, deriveSpokeSlug, spokeTypeFor } from './editorial';

const num = (s: string | null | undefined): number => {
  if (s == null) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const pct = (s: string | null | undefined): number => num(s) / 100; // .normalized is already %

function ZERO_ADDR(): Address {
  return '0x0000000000000000000000000000000000000000' as Address;
}

function hubIdFromAddress(addr: string): HubId | null {
  return HUB_ADDRESS_TO_ID[addr] ?? null;
}

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

export interface RawData {
  hubs: GqlHub[];
  hubAssetsByHubId: Record<string, GqlHubAsset[]>;
  spokes: GqlSpoke[];
  reservesBySpokeId: Record<string, GqlReserve[]>;
  hubSpokeConfigs: GqlHubSpokeConfig[];
}

export function transform(raw: RawData): AaveParams {
  // ---------- 1. Hubs (without assets yet) ----------
  const hubsById = new Map<HubId, Hub>();
  for (const h of raw.hubs) {
    const id = hubIdFromAddress(h.address);
    if (!id) continue;
    const ed = HUB_EDITORIAL[id];
    hubsById.set(id, {
      id,
      label: ed.label,
      tag: ed.tag,
      color: ed.color,
      address: h.address,
      gqlId: h.id,
      chain: {
        chainId: h.chain.chainId,
        name: h.chain.name ?? 'Ethereum',
        explorer: h.chain.explorerUrl ?? 'https://etherscan.io',
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
  // Need cap aggregates from hubSpokeConfigs per (hub, asset symbol)
  const capAggByHubAsset = new Map<string, { addCap: number; drawCap: number }>();
  for (const c of raw.hubSpokeConfigs) {
    const hid = hubIdFromAddress(c.hub.address);
    if (!hid) continue;
    const sym = c.asset.underlying.info.symbol;
    const key = `${hid}|${sym}`;
    const cur = capAggByHubAsset.get(key) ?? { addCap: 0, drawCap: 0 };
    cur.addCap += num(c.supplyCap.exchange.value);
    cur.drawCap += num(c.borrowCap.exchange.value);
    capAggByHubAsset.set(key, cur);
  }

  for (const [hubId, hub] of hubsById) {
    const gqlId = hub.gqlId;
    const list = raw.hubAssetsByHubId[gqlId] ?? [];
    const assets: HubAsset[] = list.map((a) => {
      const sym = a.underlying.info.symbol;
      const irm = buildIrm(a.settings);
      const capAgg = capAggByHubAsset.get(`${hubId}|${sym}`) ?? { addCap: 0, drawCap: 0 };
      return {
        symbol: sym,
        underlying: a.underlying.address,
        decimals: a.underlying.info.decimals,
        feeReceiver: a.settings.feeReceiver,
        liquidityFee: pct(a.settings.liquidityFee.normalized),
        irStrategy: a.settings.irStrategy,
        reinvestmentController: a.settings.reinvestmentController,
        irm,
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
      };
    });
    hub.assets = assets;
    hub.summary.assetCount = assets.length;
  }

  // ---------- 3. Spokes (without reserves yet) ----------
  const spokeBySlug = new Map<string, Spoke>();
  const slugByGqlSpokeId = new Map<string, string>();
  const slugByAddress = new Map<string, string>();
  for (const s of raw.spokes) {
    // primary hub = first connectedHubs entry that maps to a known hub id.
    const primary = s.connectedHubs
      .map((c) => hubIdFromAddress(c.hub.address))
      .find((id): id is HubId => id !== null);
    if (!primary) continue;
    const slug = deriveSpokeSlug(s.address, primary, s.name);
    slugByGqlSpokeId.set(s.id, slug);
    slugByAddress.set(s.address, slug);

    // If the slug encodes a different hub (e.g. plus-ethena even though
    // connectedHubs[0] is Core), honor the slug's hub. This keeps the
    // editorial assignment stable across runs.
    const hubFromSlug = slug.split('-')[0] as HubId;
    const finalHub = HUB_EDITORIAL[hubFromSlug] ? hubFromSlug : primary;

    const lc = s.liquidationConfig;
    const liq = lc
      ? {
          targetHF: num(lc.targetHealthFactor) / 1e18,
          hfForMaxBonus: num(lc.healthFactorForMaxBonus) / 1e18,
          liqBonusFactor: pct(lc.liquidationBonusFactor.normalized),
        }
      : { targetHF: 1.05, hfForMaxBonus: 0.93, liqBonusFactor: 0.3 };

    spokeBySlug.set(slug, {
      id: slug,
      name: s.name,
      type: spokeTypeFor(slug),
      address: s.address,
      hubId: finalHub,
      connectedHubs: s.connectedHubs
        .map((c) => hubIdFromAddress(c.hub.address))
        .filter((id): id is HubId => id !== null),
      summary: {
        totalSupplied: num(s.summary.totalSupplied.value),
        totalBorrowed: num(s.summary.totalBorrowed.value),
        utilizationRate: 0,
        uniqueAssets: s.summary.uniqueAssets,
        connectedHubs: s.summary.connectedHubs,
        oracle: ZERO_ADDR(), // RPC-only; deferred to Phase 2.1
        maxUserReservesLimit: 0,
      },
      liquidationConfig: liq,
      reserves: [],
    });
  }

  // ---------- 4. Reserves per spoke ----------
  for (const [, spoke] of spokeBySlug) {
    // The GraphQL spokeId we used to query is the original (base64) id.
    // We stored slug → gqlId via slugByGqlSpokeId, so reverse-lookup.
    const gqlId = [...slugByGqlSpokeId.entries()].find(([, slug]) => slug === spoke.id)?.[0];
    const list = gqlId ? raw.reservesBySpokeId[gqlId] ?? [] : [];

    const reserves: Reserve[] = list.map((r) => {
      const hubId = hubIdFromAddress(r.asset.hub.address);
      const sym = r.asset.underlying.info.symbol;
      // status comes back as a string like "ACTIVE" / "PAUSED" / "FROZEN".
      const status = (r.status || '').toUpperCase();
      const paused = status === 'PAUSED';
      const frozen = status === 'FROZEN';
      const supplied = num(r.summary.supplied.exchange.value);
      const borrowed = num(r.summary.borrowed.exchange.value);
      return {
        symbol: sym,
        underlying: r.asset.underlying.address,
        hub: hubId ?? spoke.hubId,
        hubAddress: r.asset.hub.address,
        assetId: Number(r.onChainId),
        decimals: r.asset.underlying.info.decimals,
        collateralRisk: pct(r.settings.collateralRisk.normalized),
        paused,
        frozen,
        borrowable: r.settings.borrowable,
        collateral: r.settings.collateral,
        receiveSharesEnabled: r.settings.receiveSharesEnabled,
        dynamicConfigKey: Number(r.settings.latestDynamicConfigKey),
        collateralFactor: pct(r.settings.collateralFactor.normalized),
        maxLiquidationBonus: pct(r.settings.maxLiquidationBonus.normalized),
        liquidationFee: pct(r.settings.liquidationFee.normalized),
        suppliedAmount: supplied,
        borrowedAmount: borrowed,
        supplyCap: num(r.settings.supplyCap.exchange.value),
        borrowCap: num(r.settings.borrowCap.exchange.value),
        supplyApy: pct(r.summary.supplyApy.normalized),
        borrowApy: pct(r.summary.borrowApy.normalized),
        oracle: {
          source: ZERO_ADDR(), // RPC-only; deferred to Phase 2.1
          description: `${sym} / USD`,
          price: supplied > 0 && Number(r.summary.supplied.amount.value) > 0
            ? supplied / Number(r.summary.supplied.amount.value)
            : 1,
          decimals: 8,
        },
      };
    });

    spoke.reserves = reserves;
    spoke.summary.utilizationRate =
      spoke.summary.totalSupplied > 0
        ? spoke.summary.totalBorrowed / spoke.summary.totalSupplied
        : 0;
  }

  const spokes = [...spokeBySlug.values()];

  // ---------- 5. Hub spoke ref list (for the matrix tab) ----------
  for (const [, hub] of hubsById) {
    const hubSpokes: HubSpokeRef[] = spokes
      .filter((sp) => sp.hubId === hub.id || sp.connectedHubs.includes(hub.id))
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

  // ---------- 6. Credit lines (derived from hubSpokeConfigs) ----------
  // A "credit line" entry is a (hub, spoke, asset) where the spoke's editorial
  // parent hub differs from the hub providing the cap. Group these to form
  // CreditLine objects per (sourceHub, destinationSpoke).
  const linesByKey = new Map<string, CreditLine>();
  for (const c of raw.hubSpokeConfigs) {
    const sourceHub = hubIdFromAddress(c.hub.address);
    const spokeSlug = slugByAddress.get(c.spoke.address);
    if (!sourceHub || !spokeSlug) continue;
    const spoke = spokeBySlug.get(spokeSlug);
    if (!spoke) continue;
    if (spoke.hubId === sourceHub) continue; // same-hub draws aren't credit lines
    const addCap = num(c.supplyCap.exchange.value);
    const drawCap = num(c.borrowCap.exchange.value);
    if (addCap === 0 && drawCap === 0) continue;
    const sym = c.asset.underlying.info.symbol;
    const key = `${sourceHub}|${spoke.hubId}|${spokeSlug}`;
    let line = linesByKey.get(key);
    if (!line) {
      line = {
        from: sourceHub,
        to: spoke.hubId,
        toSpoke: spokeSlug,
        assets: [],
        index: linesByKey.size,
        riskPremiumThreshold: pct(c.riskPremiumThreshold.normalized),
        capByAsset: {},
      };
      linesByKey.set(key, line);
    }
    if (!line.assets.includes(sym)) line.assets.push(sym);
    line.capByAsset[sym] = {
      addCap,
      drawCap,
      // GraphQL doesn't expose per-(hub,spoke,asset) live supplied/borrowed
      // independently of the spoke total. Use 0 here — the per-reserve view
      // shows usage via the reserve table.
      supplied: 0,
      borrowed: 0,
    };
  }

  // ---------- 7. Final API ----------
  const hubs = [...hubsById.values()];
  const creditLines = [...linesByKey.values()];

  return {
    hubs,
    spokes,
    creditLines,
    helpers: { sampleIrmCurve, evalBorrowRate },
    getHub: (id) => hubs.find((h) => h.id === id),
    getSpoke: (id) => spokes.find((s) => s.id === id),
    getReserve: (spokeId, sym) =>
      spokes.find((s) => s.id === spokeId)?.reserves.find((r) => r.symbol === sym),
    creditLinesForSpoke: (spokeId) => creditLines.filter((c) => c.toSpoke === spokeId),
  };
}
