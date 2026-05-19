// Types per handoff/DATA-CONTRACT.md. Field-for-field with the spec — do not
// reshape these without updating the contract.

export type HubId = 'core' | 'plus' | 'prime';
export type Address = `0x${string}`;

export interface IRM {
  base: number;     // base borrow rate, fraction/year
  slope1: number;   // slope from 0 -> optimal
  slope2: number;   // slope from optimal -> 1.0
  optimal: number;  // kink utilization (fraction)
}

export interface CurvePoint {
  u: number;      // utilization
  borrow: number; // borrow rate
  supply: number; // supply rate (borrow * u, ignoring fee — fee applied per-asset)
}

export interface HubAsset {
  symbol: string;
  underlying: Address;
  decimals: number;
  feeReceiver: Address;
  liquidityFee: number; // 0..1
  irStrategy: Address;
  reinvestmentController: Address | null;
  irm: IRM | null;
  summary: {
    supplied: number;
    borrowed: number;
    availableLiquidity: number;
    utilizationRate: number;
    supplyApy: number | null;
    borrowApy: number | null;
    netApy: number | null;
    addCap: number;
    drawCap: number;
    reservesCount: number;
    activeReservesCount: number;
  };
}

export interface HubSpokeRef {
  id: string;
  label: string;
  type: string;
  collateral: string[];
  borrowable: string[];
}

export interface Hub {
  id: HubId;
  label: string;
  tag: string;
  color: string;
  address: Address;
  gqlId: string;
  chain: { chainId: number; name: string; explorer: string };
  summary: {
    totalSupplied: number;
    totalBorrowed: number;
    totalSupplyCap: number;
    totalBorrowCap: number;
    utilizationRate: number;
    assetCount: number;
    spokeCount: number;
  };
  assets: HubAsset[];
  spokes: HubSpokeRef[];
}

export interface Reserve {
  symbol: string;
  underlying: Address;
  hub: HubId;
  hubAddress: Address;
  assetId: number;
  decimals: number;
  collateralRisk: number;
  paused: boolean;
  frozen: boolean;
  borrowable: boolean;
  collateral: boolean;
  receiveSharesEnabled: boolean;
  dynamicConfigKey: number;
  collateralFactor: number;
  maxLiquidationBonus: number;
  liquidationFee: number;
  suppliedAmount: number;
  borrowedAmount: number;
  supplyCap: number;
  borrowCap: number;
  supplyApy: number | null;
  borrowApy: number | null;
  oracle: {
    source: Address;
    description: string;
    price: number;
    decimals: number;
  };
}

export interface Spoke {
  id: string;
  name: string;
  type: string;
  address: Address;
  hubId: HubId;
  connectedHubs: HubId[];
  summary: {
    totalSupplied: number;
    totalBorrowed: number;
    utilizationRate: number;
    uniqueAssets: number;
    connectedHubs: number;
    oracle: Address;
    maxUserReservesLimit: number;
  };
  liquidationConfig: {
    targetHF: number;
    hfForMaxBonus: number;
    liqBonusFactor: number;
  };
  reserves: Reserve[];
}

export interface CreditLine {
  from: HubId;
  to: HubId;
  toSpoke: string;
  assets: string[];
  index: number;
  riskPremiumThreshold: number;
  capByAsset: {
    [symbol: string]: {
      addCap: number;
      drawCap: number;
      supplied: number;
      borrowed: number;
    };
  };
}

export interface AssetMetadata {
  type: 'stable' | 'eth' | 'btc' | 'lst' | 'lrt' | 'pt' | 'credit' | 'eur' | 'gold' | 'other';
  color: string;
  name: string;
  icon: string;
}

export interface AaveParams {
  hubs: Hub[];
  spokes: Spoke[];
  creditLines: CreditLine[];
  helpers: {
    sampleIrmCurve: (irm: IRM | null, n?: number) => CurvePoint[];
    evalBorrowRate: (irm: IRM | null, utilization: number) => number | null;
  };
  getHub: (id: HubId) => Hub | undefined;
  getSpoke: (id: string) => Spoke | undefined;
  getReserve: (spokeId: string, symbol: string) => Reserve | undefined;
  creditLinesForSpoke: (spokeId: string) => CreditLine[];
}

// Topology data — the matrix tab's primary input.
export interface Topology {
  hubs: Array<{
    id: HubId;
    label: string;
    tag: string;
    color: string;
    spokes: HubSpokeRef[];
  }>;
  creditLines: Array<{ from: HubId; to: HubId; toSpoke: string; assets: string[] }>;
  HUB_NAMES: Record<HubId, string>;
  assetMeta: Record<string, AssetMetadata>;
}
