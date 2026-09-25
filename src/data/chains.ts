// Network registry — the ONE place to touch when Aave V4 lands on a new chain.
//
// Two kinds of network:
//
//  • source: 'aavekit' (default) — indexed by the AaveKit GraphQL API. Nothing
//    is required here: every mainnet chain AaveKit's `chains` query returns is
//    picked up automatically, with its name, icon, explorer and RPC coming from
//    the API. An entry below only adds polish (a short label, a URL slug,
//    browser-friendly RPCs for the oracle multicall, a display order).
//
//  • source: 'rpc' — a V4 deployment AaveKit does NOT index (white-label
//    instances). List its hub addresses and the explorer crawls each hub
//    on-chain: assets → connected spokes → reserves → oracle prices. Spokes are
//    discovered from the hubs, so only hub addresses are needed.
//
// To add a network: append an entry. Order in this array = display order;
// chains the API returns that aren't listed here are appended after.

import type { Address } from './types';

export type ChainSource = 'aavekit' | 'rpc';

export interface RpcHubSeed {
  address: Address;
  /** Display name (hubs carry no on-chain name). */
  label: string;
  tag?: string;
  color?: string;
  /** Optional display names for the hub's spokes, keyed by address. */
  spokeLabels?: Record<string, string>;
}

export interface ChainProfile {
  chainId: number;
  /** Lowercase, URL/id-safe. Prefixes every hub and spoke id on this chain. */
  slug: string;
  label: string;
  /** Browser-CORS-friendly public RPCs, tried in order. The API's own rpcUrl
   *  is appended as a last resort for AaveKit chains. */
  rpcUrls: string[];
  explorer?: string;
  icon?: string;
  source?: ChainSource;
  /** Operator of a white-label deployment, shown as a badge. */
  operator?: string;
  /** source: 'rpc' only — hubs to crawl. */
  hubs?: RpcHubSeed[];
}

const AAVE_STATICS = 'https://statics.aave.com/';

export const CHAIN_PROFILES: ChainProfile[] = [
  {
    chainId: 1,
    slug: 'ethereum',
    label: 'Ethereum',
    icon: AAVE_STATICS + 'ethereum.svg',
    explorer: 'https://etherscan.io',
    rpcUrls: [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.drpc.org',
      'https://eth.llamarpc.com',
    ],
  },
  {
    chainId: 43114,
    slug: 'avalanche',
    label: 'Avalanche',
    icon: AAVE_STATICS + 'avalanche.svg',
    explorer: 'https://snowtrace.io',
    rpcUrls: ['https://avalanche-c-chain-rpc.publicnode.com', 'https://1rpc.io/avax/c'],
  },
  {
    chainId: 5042,
    slug: 'arc',
    label: 'Arc',
    icon: AAVE_STATICS + 'arc.svg',
    explorer: 'https://www.arcexplorer.org',
    rpcUrls: ['https://arc.drpc.org', 'https://rpc.quicknode.mainnet.arc.io'],
  },
  {
    chainId: 8453,
    slug: 'base',
    label: 'Base',
    icon: AAVE_STATICS + 'base.svg',
    explorer: 'https://basescan.org',
    rpcUrls: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'],
  },
  {
    // EtherFi white-label instance. Listed by AaveKit's `chains` query but
    // it serves no hubs/spokes for it, so the explorer reads it on-chain.
    // Contracts verified on Optimistic Etherscan: HubInstance +
    // EtherFiSpokeInstance (+ a TreasurySpokeInstance fee receiver, which
    // the crawler skips because it isn't a lending spoke).
    chainId: 10,
    slug: 'optimism',
    label: 'OP Mainnet',
    icon: AAVE_STATICS + 'optimism.svg',
    explorer: 'https://optimistic.etherscan.io',
    rpcUrls: [
      'https://optimism-rpc.publicnode.com',
      'https://mainnet.optimism.io',
      'https://optimism.drpc.org',
    ],
    source: 'rpc',
    operator: 'EtherFi',
    hubs: [
      {
        address: '0x66753c4e3fC84f1eD0e3C267C927284E9d90C572',
        label: 'EtherFi',
        tag: 'White-label',
        spokeLabels: { '0xdffcc3536d932eb51df51a7f5fa407c4270d5308': 'Main' },
      },
      {
        address: '0x03641abDa8BF0d9196CE44EbEd9f85ccCe3c5e1f',
        label: 'EtherFi II',
        tag: 'White-label',
        spokeLabels: { '0x7e99c7846df8527ffe510a2ca0215874052102ed': 'Main' },
      },
    ],
  },
];

/** Chain as the rest of the app sees it: registry profile merged with the
 *  AaveKit `chains` row (when there is one). */
export interface ChainInfo {
  chainId: number;
  slug: string;
  label: string;
  icon: string;
  explorer: string;
  rpcUrls: string[];
  source: ChainSource;
  operator?: string;
  hubs?: RpcHubSeed[];
}

export interface ApiChain {
  chainId: number;
  name: string;
  icon: string;
  explorerUrl: string;
  rpcUrl: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fromProfile(p: ChainProfile, api?: ApiChain): ChainInfo {
  const rpcUrls = [...p.rpcUrls];
  if (api?.rpcUrl && !rpcUrls.includes(api.rpcUrl)) rpcUrls.push(api.rpcUrl);
  return {
    chainId: p.chainId,
    slug: p.slug,
    label: p.label,
    icon: p.icon ?? api?.icon ?? '',
    explorer: p.explorer ?? api?.explorerUrl ?? '',
    rpcUrls,
    source: p.source ?? 'aavekit',
    operator: p.operator,
    hubs: p.hubs,
  };
}

/** Merge the registry with the API's chain list. Registry order first, then
 *  any API chain the registry doesn't know (auto-discovered, zero config). */
export function resolveChains(apiChains: ApiChain[]): ChainInfo[] {
  const apiById = new Map(apiChains.map((c) => [c.chainId, c]));
  const out = CHAIN_PROFILES.map((p) => fromProfile(p, apiById.get(p.chainId)));
  const known = new Set(out.map((c) => c.chainId));
  for (const c of apiChains) {
    if (known.has(c.chainId)) continue;
    out.push({
      chainId: c.chainId,
      slug: slugify(c.name) || String(c.chainId),
      label: c.name,
      icon: c.icon,
      explorer: c.explorerUrl,
      rpcUrls: c.rpcUrl ? [c.rpcUrl] : [],
      source: 'aavekit',
    });
  }
  return out;
}

/** Registry-only fallback, used if the `chains` query itself fails. */
export const FALLBACK_CHAINS: ChainInfo[] = CHAIN_PROFILES.map((p) => fromProfile(p));
