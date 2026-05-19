// Minimal types for the AaveKit V4 GraphQL responses. Only the fields we use.

export interface GqlValue {
  value: string;
}
export interface GqlAmount {
  amount: GqlValue;
  exchange: GqlValue;
}
export interface GqlPct {
  normalized: string;
}
export interface GqlWithCurrent<T> {
  current: T;
}

export interface GqlChain {
  name?: string;
  chainId: number;
  explorerUrl?: string;
}

export interface GqlHub {
  id: string;
  name: string;
  address: `0x${string}`;
  chain: GqlChain;
  summary: {
    totalSupplied: GqlWithCurrent<GqlValue>;
    totalBorrowed: GqlWithCurrent<GqlValue>;
    totalSupplyCap: GqlValue;
    totalBorrowCap: GqlValue;
    utilizationRate: GqlPct;
  };
}

export interface GqlHubAsset {
  id: string;
  onchainAssetId: string;
  underlying: {
    address: `0x${string}`;
    info: {
      symbol: string;
      decimals: number;
      name: string;
    };
  };
  settings: {
    feeReceiver: `0x${string}`;
    liquidityFee: GqlPct;
    irStrategy: `0x${string}`;
    reinvestmentController: `0x${string}` | null;
    optimalUtilizationRate: GqlPct;
    baseBorrowRate: GqlPct;
    slopeBelowOptimal: GqlPct;
    slopeAboveOptimal: GqlPct;
  };
  summary: {
    supplied: GqlAmount;
    borrowed: GqlAmount;
    availableLiquidity: GqlAmount;
    utilizationRate: GqlPct;
    supplyApy: GqlPct;
    borrowApy: GqlPct;
    netApy: GqlPct;
    reservesCount: number;
    activeReservesCount: number;
  };
}

export interface GqlSpokeConnectedHub {
  hub: {
    id: string;
    name: string;
    address: `0x${string}`;
  };
}

export interface GqlSpoke {
  id: string;
  name: string;
  address: `0x${string}`;
  chain: { chainId: number };
  connectedHubs: GqlSpokeConnectedHub[];
  summary: {
    totalSupplied: GqlValue;
    totalBorrowed: GqlValue;
    uniqueAssets: number;
    connectedHubs: number;
  };
  liquidationConfig: {
    targetHealthFactor: string;
    healthFactorForMaxBonus: string;
    liquidationBonusFactor: GqlPct;
  } | null;
}

export interface GqlReserveStatus {
  frozen: boolean;
  paused: boolean;
  active: boolean;
}

export interface GqlReserve {
  id: string;
  onChainId: string;
  status: GqlReserveStatus;
  canBorrow: boolean;
  canSupply: boolean;
  canUseAsCollateral: boolean;
  asset: {
    onchainAssetId: string;
    underlying: {
      address: `0x${string}`;
      info: { symbol: string; decimals: number; name: string };
    };
    hub: { address: `0x${string}`; name: string };
  };
  settings: {
    collateralFactor: GqlPct;
    maxLiquidationBonus: GqlPct;
    liquidationFee: GqlPct;
    collateralRisk: GqlPct;
    borrowable: boolean;
    collateral: boolean;
    suppliable: boolean;
    receiveSharesEnabled: boolean;
    latestDynamicConfigKey: string;
    supplyCap: GqlAmount;
    borrowCap: GqlAmount;
  };
  summary: {
    supplied: GqlAmount;
    borrowed: GqlAmount;
    supplyApy: GqlPct;
    borrowApy: GqlPct;
  };
}

export interface GqlHubSpokeConfig {
  hub: { id: string; name: string; address: `0x${string}` };
  spoke: { id: string; name: string; address: `0x${string}` };
  asset: {
    onchainAssetId: string;
    underlying: { info: { symbol: string } };
  };
  supplyCap: GqlAmount;
  borrowCap: GqlAmount;
  active: boolean;
  halted: boolean;
  riskPremiumThreshold: GqlPct;
}
