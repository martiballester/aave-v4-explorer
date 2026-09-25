import { createPublicClient, defineChain, fallback, http, type PublicClient } from 'viem';
import type { ChainInfo } from '../chains';

// One viem client per chain, built from the registry's RPC list (public,
// keyless, browser-CORS-friendly). Multicall3 sits at the same canonical
// address on every chain V4 is on (checked: Ethereum, Avalanche, Arc, Base,
// OP), so each client batches its view reads into a handful of eth_calls.
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

const clients = new Map<number, PublicClient>();

export function clientFor(chain: ChainInfo): PublicClient | null {
  const cached = clients.get(chain.chainId);
  if (cached) return cached;

  // VITE_RPC_URL_<chainId> lets a local build point at a private endpoint.
  const override = (import.meta.env as Record<string, string | undefined>)[
    `VITE_RPC_URL_${chain.chainId}`
  ];
  const urls = [override, ...chain.rpcUrls].filter((u): u is string => !!u);
  if (urls.length === 0) return null;

  const client = createPublicClient({
    chain: defineChain({
      id: chain.chainId,
      name: chain.label,
      nativeCurrency: { name: 'Native', symbol: 'NATIVE', decimals: 18 },
      rpcUrls: { default: { http: urls } },
      contracts: { multicall3: { address: MULTICALL3 } },
    }),
    transport: fallback(
      urls.map((url) => http(url, { batch: { wait: 10 } })),
      { rank: false, retryCount: 1 },
    ),
    batch: { multicall: true },
  });
  clients.set(chain.chainId, client);
  return client;
}
