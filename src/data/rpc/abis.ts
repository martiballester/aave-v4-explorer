// Minimal Aave V4 ABIs — only the view functions we call. Full ABIs live in
// the reference source at /AaveV4/code/src.

import { parseAbi } from 'viem';

export const SPOKE_ABI = parseAbi([
  'function ORACLE() view returns (address)',
  'function MAX_USER_RESERVES_LIMIT() view returns (uint16)',
]);

export const ORACLE_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function getReserveSource(uint256 reserveId) view returns (address)',
  'function getReservePrice(uint256 reserveId) view returns (uint256)',
]);

export const PRICE_FEED_ABI = parseAbi(['function description() view returns (string)']);
