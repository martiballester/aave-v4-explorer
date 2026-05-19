import { createPublicClient, http, fallback } from 'viem';
import { mainnet } from 'viem/chains';

// Public Ethereum mainnet RPCs — no API keys, no signup, browser-CORS-friendly.
// drpc.org is the primary (rate-limit-friendly, sub-200ms typical). The rest
// are fallbacks so a single endpoint outage doesn't blank the dashboard.
const RPCS = [
  import.meta.env.VITE_RPC_URL as string | undefined,
  'https://eth.drpc.org',
  'https://eth.llamarpc.com',
  'https://eth.merkle.io',
  'https://rpc.ankr.com/eth',
].filter((u): u is string => !!u);

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: fallback(
    RPCS.map((url) => http(url, { batch: { wait: 10 } })),
    { rank: false, retryCount: 1 },
  ),
  // Enable Multicall3 for batched view reads — viem auto-aggregates the calls
  // inside one `client.multicall(...)` invocation.
  batch: { multicall: true },
});
