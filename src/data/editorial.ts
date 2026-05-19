// Editorial overrides — fields that don't exist on-chain.
//
// Hub colors and tags are LlamaRisk editorial choices. Spoke types
// ("General"/"e-Mode"/"Specialty") are derived from the spoke's role,
// and asset metadata (icon URL, display color) is curated.
//
// Mainnet spoke addresses pinned 2026-05-19. New spokes appear in
// `hubSpokeConfigs` automatically; they get a derived slug and a default
// editorial profile until added here.

import type { AssetMetadata, HubId } from './types';

export interface HubEditorial {
  tag: string;
  color: string;
  label: string;
}

export const HUB_EDITORIAL: Record<HubId, HubEditorial> = {
  core: { tag: 'Risk-adjusted', color: '#C9B68C', label: 'Core' },
  plus: { tag: 'Risk-return', color: '#D88E5A', label: 'Plus' },
  prime: { tag: 'Low risk', color: '#6FB7AE', label: 'Prime' },
};

export const HUB_ADDRESS_TO_ID: Record<string, HubId> = {
  '0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9': 'core',
  '0x06002e9c4412CB7814a791eA3666D905871E536A': 'plus',
  '0x943827DCA022D0F354a8a8c332dA1e5Eb9f9F931': 'prime',
};

// Optional slug OVERRIDE for known mainnet spokes. Parent-hub assignment is
// auto-derived from reserves (the hub holding most collateral = parent), so
// new spokes don't need any editorial change — they just get a derived slug
// like `core-newspoke` automatically. This override only exists to keep the
// old slug shape for the existing 10 spokes (and to let you rename if you
// don't like the auto-derived form).
export const SPOKE_SLUG_BY_ADDRESS: Record<string, string> = {
  '0x94e7A5dCbE816e498b89aB752661904E2F56c485': 'core-main',
  '0xe1900480ac69f0B296841Cd01cC37546d92F35Cd': 'core-lido',
  '0xbF10BDfE177dE0336aFD7fcCF80A904E15386219': 'core-etherfi',
  '0x3131FE68C4722e726fe6B2819ED68e514395B9a4': 'core-kelp',
  '0x7EC68b5695e803e98a21a9A05d744F28b0a7753D': 'core-lombard',
  '0x65407b940966954b23dfA3caA5C0702bB42984DC': 'core-gold',
  '0xD8B93635b8C6d0fF98CbE90b5988E3F2d1Cd9da1': 'core-forex',
  '0x973a023A77420ba610f06b3858aD991Df6d85A08': 'prime-bluechip',
  '0x58131E79531caB1d52301228d1f7b842F26B9649': 'plus-correlated',
  '0xba1B3D55D249692b669A164024A838309B7508AF': 'plus-ethena',
};

// Editorial spoke type — drives the matrix tab's row grouping. Purely
// aesthetic; new spokes default to 'General' until pinned here.
export const SPOKE_TYPE_BY_SLUG: Record<string, string> = {
  'core-main': 'General',
  'core-lido': 'e-Mode',
  'core-etherfi': 'e-Mode',
  'core-kelp': 'e-Mode',
  'core-lombard': 'e-Mode',
  'core-gold': 'Specialty',
  'core-forex': 'Specialty',
  'prime-bluechip': 'General',
  'plus-correlated': 'e-Mode',
  'plus-ethena': 'General',
};

// Heuristic fallback: name-based inference for unknown spokes.
export function inferSpokeTypeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('correlated') || n.includes('emode') || n.includes('e-mode')) return 'e-Mode';
  if (n.includes('lido') || n.includes('etherfi') || n.includes('kelp') || n.includes('lombard'))
    return 'e-Mode';
  if (n.includes('gold') || n.includes('forex') || n.includes('rwa') || n.includes('isolation'))
    return 'Specialty';
  return 'General';
}

const AV = 'https://app.aave.com/icons/tokens/';

export const ASSET_META: Record<string, AssetMetadata> = {
  wETH: { type: 'eth', color: '#627EEA', name: 'Wrapped Ether', icon: AV + 'weth.svg' },
  WETH: { type: 'eth', color: '#627EEA', name: 'Wrapped Ether', icon: AV + 'weth.svg' },
  wstETH: { type: 'eth', color: '#627EEA', name: 'Wrapped stETH', icon: AV + 'wsteth.svg' },
  weETH: { type: 'eth', color: '#627EEA', name: 'Wrapped eETH', icon: AV + 'weeth.svg' },
  rsETH: { type: 'eth', color: '#627EEA', name: 'rsETH', icon: AV + 'rseth.svg' },
  wBTC: { type: 'btc', color: '#F7931A', name: 'Wrapped BTC', icon: AV + 'wbtc.svg' },
  WBTC: { type: 'btc', color: '#F7931A', name: 'Wrapped BTC', icon: AV + 'wbtc.svg' },
  cbBTC: { type: 'btc', color: '#F7931A', name: 'Coinbase BTC', icon: AV + 'cbbtc.svg' },
  LBTC: { type: 'btc', color: '#F7931A', name: 'Lombard BTC', icon: AV + 'lbtc.svg' },
  USDT: { type: 'stable', color: '#26A17B', name: 'Tether', icon: AV + 'usdt.svg' },
  USDC: { type: 'stable', color: '#2775CA', name: 'USD Coin', icon: AV + 'usdc.svg' },
  USDG: { type: 'stable', color: '#26A17B', name: 'USDG', icon: AV + 'usdg.svg' },
  RLUSD: { type: 'stable', color: '#26A17B', name: 'RLUSD', icon: AV + 'rlusd.svg' },
  frxUSD: { type: 'stable', color: '#26A17B', name: 'frxUSD', icon: AV + 'frax.svg' },
  GHO: { type: 'stable', color: '#26A17B', name: 'GHO', icon: AV + 'gho.svg' },
  USDe: { type: 'stable', color: '#26A17B', name: 'USDe', icon: AV + 'usde.svg' },
  sUSDe: { type: 'stable', color: '#26A17B', name: 'sUSDe', icon: AV + 'susde.svg' },
  PYUSD: { type: 'stable', color: '#26A17B', name: 'PayPal USD', icon: AV + 'pyusd.svg' },
  EURC: { type: 'eur', color: '#0052B4', name: 'EURC', icon: AV + 'eurc.svg' },
  LINK: { type: 'other', color: '#335DD2', name: 'Chainlink', icon: AV + 'link.svg' },
  AAVE: { type: 'other', color: '#9CA3AF', name: 'Aave', icon: AV + 'aave.svg' },
  XAUt: { type: 'gold', color: '#FFD700', name: 'Tether Gold', icon: AV + 'xaut.svg' },
  'PT-sUSDe': { type: 'pt', color: '#B89BD9', name: 'PT sUSDe', icon: AV + 'ptsusde.svg' },
  'PT-USDe': { type: 'pt', color: '#B89BD9', name: 'PT USDe', icon: AV + 'ptusde.svg' },
  'PT-USDG': { type: 'pt', color: '#B89BD9', name: 'PT USDG', icon: AV + 'ptusdg.svg' },
  cUSDT: { type: 'credit', color: '#26A17B', name: 'Credit USDT', icon: AV + 'usdt.svg' },
  cUSDC: { type: 'credit', color: '#2775CA', name: 'Credit USDC', icon: AV + 'usdc.svg' },
  cUSDG: { type: 'credit', color: '#26A17B', name: 'Credit USDG', icon: AV + 'usdg.svg' },
  cRLUSD: { type: 'credit', color: '#26A17B', name: 'Credit RLUSD', icon: AV + 'rlusd.svg' },
  cEURC: { type: 'credit', color: '#0052B4', name: 'Credit EURC', icon: AV + 'eurc.svg' },
  cfrxUSD: { type: 'credit', color: '#26A17B', name: 'Credit frxUSD', icon: AV + 'frax.svg' },
  cUSDe: { type: 'credit', color: '#26A17B', name: 'Credit USDe', icon: AV + 'usde.svg' },
  cGHO: { type: 'credit', color: '#26A17B', name: 'Credit GHO', icon: AV + 'gho.svg' },
};

const DEFAULT_ASSET_META: AssetMetadata = {
  type: 'other',
  color: '#8C969A',
  name: '',
  icon: '',
};

export function assetMetaFor(symbol: string): AssetMetadata {
  return ASSET_META[symbol] ?? { ...DEFAULT_ASSET_META, name: symbol };
}

export function deriveSpokeSlug(address: string, hubId: HubId, name: string): string {
  const pinned = SPOKE_SLUG_BY_ADDRESS[address];
  if (pinned) return pinned;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${hubId}-${slug}`;
}

export function spokeTypeFor(slug: string, fallbackName?: string): string {
  return (
    SPOKE_TYPE_BY_SLUG[slug] ??
    (fallbackName ? inferSpokeTypeFromName(fallbackName) : 'General')
  );
}
