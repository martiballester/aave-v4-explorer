// Phase 1 fixture: builds AaveParams from the topology + invented asset/hub state.
// Ported from handoff/prototype/params-data.js. Replace with live adapter in Phase 2;
// the export shape must remain identical (DATA-CONTRACT.md).

import { topology } from './topology';
import type {
  AaveParams,
  Address,
  CurvePoint,
  CreditLine,
  Hub,
  HubAsset,
  HubId,
  IRM,
  Reserve,
  Spoke,
} from '../types';

// Live hub addresses (PARAMS.md §1)
const HUB_ADDR: Record<HubId, Address> = {
  core: '0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9',
  plus: '0x06002e9c4412CB7814a791eA3666D905871E536A',
  prime: '0x943827DCA022D0F354a8a8c332dA1e5Eb9f9F931',
};
const HUB_ID_GQL: Record<HubId, string> = {
  core: 'MTo6MHhDY2E4NTJCYzQwZTU2MGFkQzNiMUNjNThDQTViNTU2MzhjZTgyNmM5',
  plus: 'MTo6MHgwNjAwMmU5YzQ0MTJDQjc4MTRhNzkxZUEzNjY2RDkwNTg3MUU1MzZB',
  prime: 'MTo6MHg5NDM4MjdEQ0EwMjJEMEYzNTRhOGE4YzMzMmRBMWU1RWI5ZjlGOTMx',
};

const FAKE = (seed: string): Address => ('0x' + seed.padEnd(40, '0')) as Address;

interface AssetParams {
  cf: number;
  maxLB: number;
  liqFee: number;
  risk: number;
  irm: IRM | null;
  isCredit?: boolean;
}

const ASSET_PARAMS: Record<string, AssetParams> = {
  USDC: { cf: 0.82, maxLB: 0.04, liqFee: 0.10, risk: 0.005, irm: { base: 0, slope1: 0.045, slope2: 0.60, optimal: 0.92 } },
  USDT: { cf: 0.81, maxLB: 0.04, liqFee: 0.10, risk: 0.008, irm: { base: 0, slope1: 0.050, slope2: 0.60, optimal: 0.90 } },
  GHO: { cf: 0.80, maxLB: 0.05, liqFee: 0.10, risk: 0.012, irm: { base: 0, slope1: 0.055, slope2: 0.45, optimal: 0.90 } },
  USDG: { cf: 0.78, maxLB: 0.05, liqFee: 0.10, risk: 0.015, irm: { base: 0, slope1: 0.060, slope2: 0.60, optimal: 0.88 } },
  RLUSD: { cf: 0.78, maxLB: 0.05, liqFee: 0.10, risk: 0.015, irm: { base: 0, slope1: 0.060, slope2: 0.60, optimal: 0.88 } },
  frxUSD: { cf: 0.75, maxLB: 0.05, liqFee: 0.10, risk: 0.020, irm: { base: 0, slope1: 0.070, slope2: 0.60, optimal: 0.85 } },
  USDe: { cf: 0.73, maxLB: 0.07, liqFee: 0.12, risk: 0.030, irm: { base: 0, slope1: 0.080, slope2: 0.80, optimal: 0.85 } },
  sUSDe: { cf: 0.72, maxLB: 0.07, liqFee: 0.12, risk: 0.035, irm: { base: 0, slope1: 0.090, slope2: 0.80, optimal: 0.80 } },
  EURC: { cf: 0.78, maxLB: 0.05, liqFee: 0.10, risk: 0.020, irm: { base: 0, slope1: 0.070, slope2: 0.70, optimal: 0.85 } },
  wETH: { cf: 0.80, maxLB: 0.06, liqFee: 0.10, risk: 0.025, irm: { base: 0, slope1: 0.030, slope2: 0.80, optimal: 0.80 } },
  wBTC: { cf: 0.73, maxLB: 0.07, liqFee: 0.10, risk: 0.030, irm: { base: 0, slope1: 0.020, slope2: 0.80, optimal: 0.65 } },
  cbBTC: { cf: 0.73, maxLB: 0.07, liqFee: 0.10, risk: 0.030, irm: { base: 0, slope1: 0.022, slope2: 0.80, optimal: 0.65 } },
  wstETH: { cf: 0.78, maxLB: 0.06, liqFee: 0.10, risk: 0.040, irm: { base: 0, slope1: 0.010, slope2: 3.00, optimal: 0.45 } },
  weETH: { cf: 0.75, maxLB: 0.07, liqFee: 0.10, risk: 0.050, irm: { base: 0, slope1: 0.010, slope2: 3.00, optimal: 0.45 } },
  rsETH: { cf: 0.72, maxLB: 0.07, liqFee: 0.12, risk: 0.060, irm: { base: 0, slope1: 0.010, slope2: 3.00, optimal: 0.40 } },
  LBTC: { cf: 0.70, maxLB: 0.08, liqFee: 0.12, risk: 0.065, irm: { base: 0, slope1: 0.012, slope2: 3.00, optimal: 0.40 } },
  LINK: { cf: 0.55, maxLB: 0.09, liqFee: 0.15, risk: 0.080, irm: { base: 0, slope1: 0.040, slope2: 1.00, optimal: 0.65 } },
  AAVE: { cf: 0.55, maxLB: 0.09, liqFee: 0.15, risk: 0.090, irm: { base: 0, slope1: 0.040, slope2: 1.00, optimal: 0.50 } },
  XAUt: { cf: 0.60, maxLB: 0.09, liqFee: 0.15, risk: 0.060, irm: { base: 0, slope1: 0.030, slope2: 0.80, optimal: 0.60 } },
  'PT-sUSDe': { cf: 0.68, maxLB: 0.08, liqFee: 0.12, risk: 0.055, irm: { base: 0, slope1: 0.080, slope2: 1.20, optimal: 0.75 } },
  'PT-USDe': { cf: 0.65, maxLB: 0.08, liqFee: 0.12, risk: 0.060, irm: { base: 0, slope1: 0.080, slope2: 1.20, optimal: 0.75 } },
  'PT-USDG': { cf: 0.65, maxLB: 0.09, liqFee: 0.12, risk: 0.060, irm: { base: 0, slope1: 0.080, slope2: 1.20, optimal: 0.75 } },
  cUSDT: { cf: 0.81, maxLB: 0.04, liqFee: 0.10, risk: 0.010, irm: null, isCredit: true },
  cUSDC: { cf: 0.82, maxLB: 0.04, liqFee: 0.10, risk: 0.010, irm: null, isCredit: true },
  cUSDG: { cf: 0.78, maxLB: 0.05, liqFee: 0.10, risk: 0.015, irm: null, isCredit: true },
  cRLUSD: { cf: 0.78, maxLB: 0.05, liqFee: 0.10, risk: 0.015, irm: null, isCredit: true },
  cEURC: { cf: 0.78, maxLB: 0.05, liqFee: 0.10, risk: 0.020, irm: null, isCredit: true },
  cfrxUSD: { cf: 0.75, maxLB: 0.05, liqFee: 0.10, risk: 0.020, irm: null, isCredit: true },
  cUSDe: { cf: 0.73, maxLB: 0.07, liqFee: 0.12, risk: 0.030, irm: null, isCredit: true },
};

interface HubAssetState {
  supplied: number;
  borrowed: number;
  addCap: number;
  drawCap: number;
}

const HUB_ASSET_STATE: Record<HubId, Record<string, HubAssetState>> = {
  core: {
    USDC: { supplied: 4_200_000_000, borrowed: 2_900_000_000, addCap: 5_000_000_000, drawCap: 4_500_000_000 },
    USDT: { supplied: 3_100_000_000, borrowed: 2_200_000_000, addCap: 4_000_000_000, drawCap: 3_800_000_000 },
    GHO: { supplied: 480_000_000, borrowed: 220_000_000, addCap: 800_000_000, drawCap: 700_000_000 },
    USDG: { supplied: 120_000_000, borrowed: 65_000_000, addCap: 500_000_000, drawCap: 400_000_000 },
    RLUSD: { supplied: 80_000_000, borrowed: 32_000_000, addCap: 300_000_000, drawCap: 200_000_000 },
    frxUSD: { supplied: 55_000_000, borrowed: 24_000_000, addCap: 250_000_000, drawCap: 180_000_000 },
    EURC: { supplied: 65_000_000, borrowed: 28_000_000, addCap: 300_000_000, drawCap: 200_000_000 },
    wETH: { supplied: 2_900_000_000, borrowed: 1_100_000_000, addCap: 4_500_000_000, drawCap: 3_500_000_000 },
    wstETH: { supplied: 1_800_000_000, borrowed: 62_000_000, addCap: 2_500_000_000, drawCap: 150_000_000 },
    weETH: { supplied: 720_000_000, borrowed: 18_000_000, addCap: 1_200_000_000, drawCap: 50_000_000 },
    rsETH: { supplied: 180_000_000, borrowed: 5_000_000, addCap: 400_000_000, drawCap: 20_000_000 },
    wBTC: { supplied: 1_400_000_000, borrowed: 120_000_000, addCap: 2_000_000_000, drawCap: 600_000_000 },
    cbBTC: { supplied: 420_000_000, borrowed: 44_000_000, addCap: 800_000_000, drawCap: 250_000_000 },
    LBTC: { supplied: 95_000_000, borrowed: 14_000_000, addCap: 250_000_000, drawCap: 50_000_000 },
    LINK: { supplied: 142_000_000, borrowed: 18_000_000, addCap: 300_000_000, drawCap: 60_000_000 },
    AAVE: { supplied: 98_000_000, borrowed: 0, addCap: 200_000_000, drawCap: 0 },
    XAUt: { supplied: 42_000_000, borrowed: 6_500_000, addCap: 150_000_000, drawCap: 20_000_000 },
    cUSDe: { supplied: 18_000_000, borrowed: 7_000_000, addCap: 50_000_000, drawCap: 25_000_000 },
  },
  plus: {
    USDC: { supplied: 420_000_000, borrowed: 215_000_000, addCap: 1_000_000_000, drawCap: 600_000_000 },
    USDT: { supplied: 280_000_000, borrowed: 145_000_000, addCap: 800_000_000, drawCap: 500_000_000 },
    GHO: { supplied: 180_000_000, borrowed: 115_000_000, addCap: 400_000_000, drawCap: 300_000_000 },
    USDe: { supplied: 210_000_000, borrowed: 118_000_000, addCap: 600_000_000, drawCap: 350_000_000 },
    sUSDe: { supplied: 320_000_000, borrowed: 0, addCap: 500_000_000, drawCap: 0 },
    'PT-sUSDe': { supplied: 95_000_000, borrowed: 0, addCap: 200_000_000, drawCap: 0 },
    'PT-USDe': { supplied: 72_000_000, borrowed: 0, addCap: 200_000_000, drawCap: 0 },
    'PT-USDG': { supplied: 14_000_000, borrowed: 0, addCap: 50_000_000, drawCap: 0 },
    cUSDT: { supplied: 0, borrowed: 0, addCap: 300_000_000, drawCap: 300_000_000 },
    cUSDC: { supplied: 0, borrowed: 0, addCap: 300_000_000, drawCap: 300_000_000 },
    cfrxUSD: { supplied: 0, borrowed: 0, addCap: 100_000_000, drawCap: 100_000_000 },
    cRLUSD: { supplied: 0, borrowed: 0, addCap: 100_000_000, drawCap: 100_000_000 },
    cUSDG: { supplied: 0, borrowed: 0, addCap: 50_000_000, drawCap: 50_000_000 },
  },
  prime: {
    USDC: { supplied: 1_500_000_000, borrowed: 980_000_000, addCap: 2_000_000_000, drawCap: 1_500_000_000 },
    USDT: { supplied: 1_200_000_000, borrowed: 780_000_000, addCap: 1_500_000_000, drawCap: 1_200_000_000 },
    GHO: { supplied: 140_000_000, borrowed: 62_000_000, addCap: 300_000_000, drawCap: 200_000_000 },
    wETH: { supplied: 1_800_000_000, borrowed: 720_000_000, addCap: 2_500_000_000, drawCap: 2_000_000_000 },
    wstETH: { supplied: 1_240_000_000, borrowed: 0, addCap: 1_800_000_000, drawCap: 0 },
    wBTC: { supplied: 910_000_000, borrowed: 0, addCap: 1_200_000_000, drawCap: 0 },
    cbBTC: { supplied: 380_000_000, borrowed: 0, addCap: 600_000_000, drawCap: 0 },
    cUSDT: { supplied: 0, borrowed: 0, addCap: 500_000_000, drawCap: 500_000_000 },
    cUSDC: { supplied: 0, borrowed: 0, addCap: 500_000_000, drawCap: 500_000_000 },
    cUSDG: { supplied: 0, borrowed: 0, addCap: 200_000_000, drawCap: 200_000_000 },
    cRLUSD: { supplied: 0, borrowed: 0, addCap: 200_000_000, drawCap: 200_000_000 },
    cEURC: { supplied: 0, borrowed: 0, addCap: 150_000_000, drawCap: 150_000_000 },
  },
};

const SPOKE_LIQ_CONFIG: Record<string, { targetHF: number; hfForMaxBonus: number; liqBonusFactor: number }> = {
  'core-main': { targetHF: 1.05, hfForMaxBonus: 0.93, liqBonusFactor: 0.30 },
  'core-lido': { targetHF: 1.02, hfForMaxBonus: 0.97, liqBonusFactor: 0.50 },
  'core-etherfi': { targetHF: 1.02, hfForMaxBonus: 0.97, liqBonusFactor: 0.50 },
  'core-kelp': { targetHF: 1.02, hfForMaxBonus: 0.96, liqBonusFactor: 0.50 },
  'core-lombard': { targetHF: 1.03, hfForMaxBonus: 0.95, liqBonusFactor: 0.40 },
  'core-gold': { targetHF: 1.10, hfForMaxBonus: 0.90, liqBonusFactor: 0.20 },
  'core-forex': { targetHF: 1.04, hfForMaxBonus: 0.94, liqBonusFactor: 0.30 },
  'prime-bluechip': { targetHF: 1.05, hfForMaxBonus: 0.93, liqBonusFactor: 0.30 },
  'plus-ethena': { targetHF: 1.06, hfForMaxBonus: 0.92, liqBonusFactor: 0.25 },
  'plus-correlated': { targetHF: 1.02, hfForMaxBonus: 0.97, liqBonusFactor: 0.55 },
  'plus-usdg-correlated': { targetHF: 1.02, hfForMaxBonus: 0.97, liqBonusFactor: 0.55 },
};

interface ReserveOverride {
  paused?: boolean;
  frozen?: boolean;
  borrowable?: boolean;
}
const SPOKE_ASSET_OVERRIDES: Record<string, Record<string, ReserveOverride>> = {
  'plus-correlated': { USDe: { frozen: false } },
  'core-main': { AAVE: { borrowable: false } },
};

// ----- IRM helpers (PARAMS.md §A.3) -----
function evalBorrowRate(irm: IRM | null, utilization: number): number | null {
  if (!irm) return null;
  if (utilization <= irm.optimal) {
    return irm.base + (utilization / irm.optimal) * irm.slope1;
  }
  const u = utilization - irm.optimal;
  const range = 1 - irm.optimal;
  return irm.base + irm.slope1 + (u / range) * irm.slope2;
}

function estimateBorrowApy(irm: IRM | null, st: { supplied: number; borrowed: number }) {
  const u = st.supplied > 0 ? st.borrowed / st.supplied : 0;
  return evalBorrowRate(irm, u);
}
function estimateSupplyApy(irm: IRM | null, st: { supplied: number; borrowed: number }) {
  const u = st.supplied > 0 ? st.borrowed / st.supplied : 0;
  const br = evalBorrowRate(irm, u);
  return br == null ? null : br * u;
}

function sampleIrmCurve(irm: IRM | null, n = 40): CurvePoint[] {
  if (!irm) return [];
  const out: CurvePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const borrow = evalBorrowRate(irm, u) || 0;
    const supply = borrow * u;
    out.push({ u, borrow, supply });
  }
  return out;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 1000;
}

function mockPrice(sym: string): number {
  const M: Record<string, number> = {
    USDC: 1.0001, USDT: 0.9998, GHO: 1.0023, USDG: 1.0001, RLUSD: 1.0008, frxUSD: 1.0003,
    EURC: 1.082, USDe: 1.001, sUSDe: 1.062,
    wETH: 3450, wstETH: 4070, weETH: 3590, rsETH: 3520, wBTC: 103200, cbBTC: 103250, LBTC: 103180,
    LINK: 18.42, AAVE: 312.5, XAUt: 3210,
    'PT-sUSDe': 0.972, 'PT-USDe': 0.965, 'PT-USDG': 0.978,
    cUSDT: 0.9998, cUSDC: 1.0001, cUSDG: 1.0001, cRLUSD: 1.0008, cEURC: 1.082, cfrxUSD: 1.0003, cUSDe: 1.001,
  };
  return M[sym] ?? 1;
}

function getDecimals(sym: string): number {
  if (ASSET_PARAMS[sym]?.isCredit) return 18;
  if (['wBTC', 'cbBTC', 'LBTC'].includes(sym)) return 8;
  if (['USDC', 'USDT', 'USDG', 'RLUSD', 'EURC'].includes(sym)) return 6;
  return 18;
}

function countReservesFor(hubId: HubId, sym: string): number {
  const hub = topology.hubs.find((h) => h.id === hubId);
  if (!hub) return 0;
  return hub.spokes.filter((s) => s.collateral.includes(sym) || s.borrowable.includes(sym)).length;
}

// ----- build hubs -----
function buildHubs(): Hub[] {
  return topology.hubs.map((h) => {
    const stateMap = HUB_ASSET_STATE[h.id] || {};
    const assetSymbols = Object.keys(stateMap);
    const assets: HubAsset[] = assetSymbols.map((sym) => {
      const ap = ASSET_PARAMS[sym] || ({} as AssetParams);
      const st = stateMap[sym];
      const supplyApy = ap.irm ? estimateSupplyApy(ap.irm, st) : null;
      const borrowApy = ap.irm ? estimateBorrowApy(ap.irm, st) : null;
      const utilization = st.supplied > 0 ? st.borrowed / st.supplied : 0;
      return {
        symbol: sym,
        underlying: FAKE(sym),
        decimals: getDecimals(sym),
        feeReceiver: FAKE('fee' + h.id),
        liquidityFee: ap.liqFee ?? 0.10,
        irStrategy: FAKE('irs' + sym),
        reinvestmentController: ['USDC', 'USDT', 'wETH'].includes(sym) ? FAKE('rein' + sym) : null,
        irm: ap.irm,
        summary: {
          supplied: st.supplied,
          borrowed: st.borrowed,
          availableLiquidity: Math.max(0, st.supplied - st.borrowed),
          utilizationRate: utilization,
          supplyApy,
          borrowApy,
          netApy: supplyApy != null ? supplyApy * (1 - (ap.liqFee ?? 0.10)) : null,
          addCap: st.addCap,
          drawCap: st.drawCap,
          reservesCount: countReservesFor(h.id, sym),
          activeReservesCount: countReservesFor(h.id, sym),
        },
      };
    });

    const totalSupplied = assets.reduce((s, a) => s + a.summary.supplied, 0);
    const totalBorrowed = assets.reduce((s, a) => s + a.summary.borrowed, 0);
    const totalSupplyCap = assets.reduce((s, a) => s + a.summary.addCap, 0);
    const totalBorrowCap = assets.reduce((s, a) => s + a.summary.drawCap, 0);

    return {
      id: h.id,
      label: h.label,
      tag: h.tag,
      color: h.color,
      address: HUB_ADDR[h.id],
      gqlId: HUB_ID_GQL[h.id],
      chain: { chainId: 1, name: 'Ethereum', explorer: 'https://etherscan.io' },
      summary: {
        totalSupplied,
        totalBorrowed,
        totalSupplyCap,
        totalBorrowCap,
        utilizationRate: totalSupplied > 0 ? totalBorrowed / totalSupplied : 0,
        assetCount: assets.length,
        spokeCount: h.spokes.length,
      },
      assets,
      spokes: h.spokes,
    };
  });
}

// ----- build spokes -----
function buildSpokes(): Spoke[] {
  return topology.hubs.flatMap((hub) =>
    hub.spokes.map((sp) => {
      const liq = SPOKE_LIQ_CONFIG[sp.id] || { targetHF: 1.05, hfForMaxBonus: 0.93, liqBonusFactor: 0.30 };
      const overrides = SPOKE_ASSET_OVERRIDES[sp.id] || {};
      const allAssets = new Set<string>([...sp.collateral, ...sp.borrowable]);

      const reserves: Reserve[] = [...allAssets].map((sym) => {
        const ap = ASSET_PARAMS[sym] || ({} as AssetParams);
        const hubState = (HUB_ASSET_STATE[hub.id] || {})[sym] || {
          supplied: 0,
          borrowed: 0,
          addCap: 0,
          drawCap: 0,
        };
        const ov = overrides[sym] || {};
        const reservesForAsset = countReservesFor(hub.id, sym) || 1;
        const myShareSupplied = hubState.supplied / reservesForAsset;
        const myShareBorrowed = hubState.borrowed / reservesForAsset;
        const myAddCap = hubState.addCap / reservesForAsset;
        const myDrawCap = hubState.drawCap / reservesForAsset;
        return {
          symbol: sym,
          underlying: FAKE(sym),
          hub: hub.id,
          hubAddress: HUB_ADDR[hub.id],
          assetId: hashCode(sym),
          decimals: getDecimals(sym),
          collateralRisk: ap.risk ?? 0,
          paused: ov.paused ?? false,
          frozen: ov.frozen ?? false,
          borrowable: sp.borrowable.includes(sym) && (ov.borrowable ?? true),
          collateral: sp.collateral.includes(sym),
          receiveSharesEnabled: true,
          dynamicConfigKey: 1,
          collateralFactor: ap.cf ?? 0,
          maxLiquidationBonus: ap.maxLB ?? 0,
          liquidationFee: ap.liqFee ?? 0.10,
          suppliedAmount: myShareSupplied,
          borrowedAmount: myShareBorrowed,
          supplyCap: myAddCap,
          borrowCap: myDrawCap,
          supplyApy: ap.irm
            ? estimateSupplyApy(ap.irm, { supplied: myShareSupplied, borrowed: myShareBorrowed })
            : null,
          borrowApy: ap.irm
            ? estimateBorrowApy(ap.irm, { supplied: myShareSupplied, borrowed: myShareBorrowed })
            : null,
          oracle: {
            source: FAKE('orac' + sym),
            description: sym + ' / USD',
            price: mockPrice(sym),
            decimals: 8,
          },
        };
      });

      const totalSupplied = reserves.reduce((s, r) => s + r.suppliedAmount, 0);
      const totalBorrowed = reserves.reduce((s, r) => s + r.borrowedAmount, 0);

      return {
        id: sp.id,
        name: sp.label,
        type: sp.type,
        address: FAKE('sp' + sp.id),
        hubId: hub.id,
        connectedHubs: [hub.id],
        summary: {
          totalSupplied,
          totalBorrowed,
          utilizationRate: totalSupplied > 0 ? totalBorrowed / totalSupplied : 0,
          uniqueAssets: allAssets.size,
          connectedHubs: 1,
          oracle: FAKE('orac' + sp.id),
          maxUserReservesLimit: 64,
        },
        liquidationConfig: liq,
        reserves,
      };
    }),
  );
}

function buildCreditLines(): CreditLine[] {
  return topology.creditLines.map((cl, i) => ({
    ...cl,
    index: i,
    riskPremiumThreshold: 0.50,
    capByAsset: cl.assets.reduce<CreditLine['capByAsset']>((m, a) => {
      const st = (HUB_ASSET_STATE[cl.to] || {})[a] || { supplied: 0, borrowed: 0, addCap: 0, drawCap: 0 };
      m[a] = {
        addCap: st.addCap,
        drawCap: st.drawCap,
        supplied: st.supplied,
        borrowed: st.borrowed,
      };
      return m;
    }, {}),
  }));
}

const hubs = buildHubs();
const spokes = buildSpokes();
const creditLines = buildCreditLines();

export const aaveParams: AaveParams = {
  hubs,
  spokes,
  creditLines,
  helpers: { sampleIrmCurve, evalBorrowRate },
  getHub: (id) => hubs.find((h) => h.id === id),
  getSpoke: (id) => spokes.find((s) => s.id === id),
  getReserve: (spokeId, sym) => spokes.find((s) => s.id === spokeId)?.reserves.find((r) => r.symbol === sym),
  creditLinesForSpoke: (spokeId) => creditLines.filter((c) => c.toSpoke === spokeId),
};
