// Minimal Aave V4 ABIs — only the view functions we call. Full ABIs live in
// the reference source at /AaveV4/code/src (IHub.sol, IHubBase.sol,
// ISpoke.sol, IAssetInterestRateStrategy.sol). Struct returns are declared as
// tuples in field order.

import { parseAbi } from 'viem';

export const SPOKE_ABI = parseAbi([
  'function ORACLE() view returns (address)',
  'function MAX_USER_RESERVES_LIMIT() view returns (uint16)',
  'function getReserveCount() view returns (uint256)',
  // LiquidationConfig { targetHealthFactor, healthFactorForMaxBonus, liquidationBonusFactor }
  'function getLiquidationConfig() view returns ((uint128, uint64, uint16))',
  // Reserve { underlying, hub, assetId, decimals, collateralRisk, flags, dynamicConfigKey }
  'function getReserve(uint256 reserveId) view returns ((address, address, uint16, uint8, uint24, uint8, uint32))',
  // DynamicReserveConfig { collateralFactor, maxLiquidationBonus, liquidationFee }
  'function getDynamicReserveConfig(uint256 reserveId, uint32 dynamicConfigKey) view returns ((uint16, uint32, uint16))',
  'function getReserveSuppliedAssets(uint256 reserveId) view returns (uint256)',
  'function getReserveTotalDebt(uint256 reserveId) view returns (uint256)',
]);

export const ORACLE_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function getReserveSource(uint256 reserveId) view returns (address)',
  'function getReservePrice(uint256 reserveId) view returns (uint256)',
]);

export const HUB_ABI = parseAbi([
  'function getAssetCount() view returns (uint256)',
  'function getAssetUnderlyingAndDecimals(uint256 assetId) view returns (address, uint8)',
  // AssetConfig { feeReceiver, liquidityFee, irStrategy, reinvestmentController }
  'function getAssetConfig(uint256 assetId) view returns ((address, uint16, address, address))',
  'function getAddedAssets(uint256 assetId) view returns (uint256)',
  'function getAssetTotalOwed(uint256 assetId) view returns (uint256)',
  'function getAssetLiquidity(uint256 assetId) view returns (uint256)',
  'function getAssetDrawnRate(uint256 assetId) view returns (uint256)',
  'function getSpokeCount(uint256 assetId) view returns (uint256)',
  'function getSpokeAddress(uint256 assetId, uint256 index) view returns (address)',
  // SpokeData { drawnShares, premiumShares, premiumOffsetRay, addedShares,
  //             addCap, drawCap, riskPremiumThreshold, active, halted, deficitRay }
  'function getSpoke(uint256 assetId, address spoke) view returns ((uint120, uint120, int200, uint120, uint40, uint40, uint24, bool, bool, uint200))',
  'function getSpokeAddedAssets(uint256 assetId, address spoke) view returns (uint256)',
  'function getSpokeTotalOwed(uint256 assetId, address spoke) view returns (uint256)',
  'function MAX_ALLOWED_SPOKE_CAP() view returns (uint40)',
]);

export const IR_STRATEGY_ABI = parseAbi([
  // InterestRateData { optimalUsageRatio, baseDrawnRate, rateGrowthBeforeOptimal, rateGrowthAfterOptimal } — all BPS
  'function getInterestRateData(uint256 assetId) view returns ((uint16, uint32, uint32, uint32))',
]);

export const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);
