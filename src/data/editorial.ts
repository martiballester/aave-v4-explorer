// Editorial overrides — fields that don't exist on-chain. Everything here is
// OPTIONAL polish: hubs, spokes and assets the tables don't know render with a
// neutral default instead of being dropped.

import type { AssetMetadata, HubId } from './types';

export interface HubEditorial {
  tag: string;
  color: string;
  label: string;
}

// Keyed by the hub's on-chain / API name, so every chain's "Core" hub shares
// the Core look (same role, different deployment).
const HUB_EDITORIAL_BY_NAME: Record<string, Omit<HubEditorial, 'label'>> = {
  core: { tag: 'Risk-adjusted', color: '#C9B68C' },
  plus: { tag: 'Risk-return', color: '#D88E5A' },
  prime: { tag: 'Low risk', color: '#6FB7AE' },
};

// Neutral fallback — matches the `--general` token.
const DEFAULT_HUB_COLOR = '#8C969A';

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Stable, chain-scoped hub id: `<chain>-<hub name>`, e.g. `avalanche-core`. */
export function deriveHubId(chainSlug: string, address: string, name: string): HubId {
  return `${chainSlug}-${slugify(name) || address.toLowerCase()}`;
}

/** Curated profile by name, else neutral grey with the on-chain name. An
 *  explicit seed (from chains.ts, for RPC-crawled hubs) wins over both. */
export function hubEditorialFor(
  name: string,
  seed?: { label?: string; tag?: string; color?: string },
): HubEditorial {
  const byName = HUB_EDITORIAL_BY_NAME[name.trim().toLowerCase()];
  return {
    label: seed?.label ?? name.trim(),
    tag: seed?.tag ?? byName?.tag ?? '—',
    color: seed?.color ?? byName?.color ?? DEFAULT_HUB_COLOR,
  };
}

/** Chain-scoped spoke id: `<hub id>-<spoke name>`, e.g. `ethereum-core-main`. */
export function deriveSpokeSlug(hubId: HubId, name: string, address: string): string {
  return `${hubId}-${slugify(name) || address.toLowerCase()}`;
}

// Editorial spoke type — drives the matrix tab's row grouping. Keyed by name
// so the same spoke family reads the same on every chain.
const SPOKE_TYPE_BY_NAME: Record<string, string> = {
  main: 'General',
  bluechip: 'General',
  'ethena ecosystem': 'General',
  lido: 'e-Mode',
  etherfi: 'e-Mode',
  kelp: 'e-Mode',
  lombard: 'e-Mode',
  'ethena correlated': 'e-Mode',
  gold: 'Specialty',
  forex: 'Specialty',
};

// Heuristic fallback: name-based inference for unknown spokes.
export function spokeTypeFor(name: string): string {
  const n = name.trim().toLowerCase();
  if (SPOKE_TYPE_BY_NAME[n]) return SPOKE_TYPE_BY_NAME[n];
  if (n.includes('correlated') || n.includes('emode') || n.includes('e-mode')) return 'e-Mode';
  if (n.includes('gold') || n.includes('forex') || n.includes('rwa') || n.includes('isolation'))
    return 'Specialty';
  return 'General';
}

// ---------------------------------------------------------------------------
// Asset metadata. Resolution order for a symbol:
//   1. ASSET_META (curated icons from app.aave.com)
//   2. the icon AaveKit serves for the token
//   3. a generated token logo keyed by chain + address (letter avatar if the
//      token is unknown) — covers RPC-crawled chains AaveKit doesn't index
// PTs take their underlying's icon (PT-sUSDE-7MAY2026 → sUSDe), ringed in the
// PT color by the UI; credit-line reserves (cUSDC) take the base token's icon.
// ---------------------------------------------------------------------------

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
};

const TYPE_COLOR: Record<AssetMetadata['type'], string> = {
  eth: '#627EEA',
  btc: '#F7931A',
  stable: '#26A17B',
  eur: '#0052B4',
  gold: '#FFD700',
  pt: '#B89BD9',
  credit: '#C76B58',
  lst: '#627EEA',
  lrt: '#627EEA',
  other: '#8C969A',
};

const PT_RE = /^PT-(.+)-\d{1,2}[A-Z]{3}\d{2,4}$/i;

/** `PT-sUSDE-7MAY2026` → `sUSDE`; null for non-PT symbols. */
export function ptBaseSymbol(symbol: string): string | null {
  return PT_RE.exec(symbol)?.[1] ?? null;
}

function inferType(symbol: string, categories: string[]): AssetMetadata['type'] {
  const s = symbol.toUpperCase();
  if (ptBaseSymbol(symbol)) return 'pt';
  if (categories.includes('ETH_CORRELATED') || (/ETH$/.test(s) && !s.includes('ETHFI'))) return 'eth';
  if (s.includes('BTC')) return 'btc';
  if (s.includes('EUR')) return 'eur';
  if (/XAU|PAXG|GOLD/.test(s)) return 'gold';
  if (categories.includes('STABLECOIN') || /USD|GHO/.test(s)) return 'stable';
  return 'other';
}

export interface TokenSeen {
  symbol: string;
  chainId: number;
  address: string;
  name?: string;
  icon?: string | null;
  categories?: string[] | null;
}

const generatedIcon = (t: TokenSeen) =>
  `https://token-logos.family.co/asset?id=${t.chainId}:${t.address}&token=${encodeURIComponent(t.symbol)}`;

/** Build the symbol → metadata table for every token the data layer saw.
 *  `aliases` maps display symbols the transform invented (credit-line `cUSDC`,
 *  de-duplicated `iwSPYx·c833`) to the underlying token symbol. */
export function buildAssetMeta(
  tokens: TokenSeen[],
  aliases: Array<{ symbol: string; base: string; credit?: boolean }>,
): Record<string, AssetMetadata> {
  const meta: Record<string, AssetMetadata> = {};
  const byLower = new Map<string, AssetMetadata>();
  const put = (sym: string, m: AssetMetadata) => {
    meta[sym] = m;
    if (!byLower.has(sym.toLowerCase())) byLower.set(sym.toLowerCase(), m);
  };
  const lookup = (sym: string) =>
    meta[sym] ?? ASSET_META[sym] ?? byLower.get(sym.toLowerCase()) ??
    Object.entries(ASSET_META).find(([k]) => k.toLowerCase() === sym.toLowerCase())?.[1];

  // Pass 1: plain tokens (PTs need their base resolved first).
  for (const t of tokens) {
    if (meta[t.symbol] || ptBaseSymbol(t.symbol)) continue;
    const curated = ASSET_META[t.symbol];
    const type = curated?.type ?? inferType(t.symbol, t.categories ?? []);
    put(t.symbol, {
      type,
      color: curated?.color ?? TYPE_COLOR[type],
      name: curated?.name ?? t.name ?? t.symbol,
      icon: curated?.icon ?? t.icon ?? generatedIcon(t),
    });
  }
  // Pass 2: PTs borrow the underlying's icon (case-insensitive: the PT for
  // sUSDe is spelled PT-sUSDE-…).
  for (const t of tokens) {
    const base = ptBaseSymbol(t.symbol);
    if (!base || meta[t.symbol]) continue;
    const baseMeta = lookup(base);
    put(t.symbol, {
      type: 'pt',
      color: TYPE_COLOR.pt,
      name: t.name ?? t.symbol,
      icon: baseMeta?.icon ?? t.icon ?? generatedIcon(t),
    });
  }
  // Pass 3: display aliases.
  for (const a of aliases) {
    const baseMeta = lookup(a.base);
    if (!baseMeta) continue;
    meta[a.symbol] = a.credit
      ? { ...baseMeta, type: 'credit', name: `Credit ${a.base}` }
      : baseMeta;
  }
  return meta;
}

const DEFAULT_ASSET_META: AssetMetadata = { type: 'other', color: '#8C969A', name: '', icon: '' };

export function assetMetaFor(meta: Record<string, AssetMetadata>, symbol: string): AssetMetadata {
  return meta[symbol] ?? { ...DEFAULT_ASSET_META, name: symbol };
}
