// Live data for every network Aave V4 runs on.
//
//   AaveKit chains (chains.ts, source 'aavekit') — GraphQL at
//     https://api.v4.aave.com/graphql, plus a per-chain viem multicall for the
//     RPC-only fields (spoke oracle, per-reserve price feed).
//   RPC chains (source 'rpc', e.g. the EtherFi white-label on OP) — crawled
//     on-chain by rpc/crawl.ts into the same shapes.
//
// Each network loads independently: one failing source blanks only its own
// hubs (flagged in `chains[].status`), never the whole page.

import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gql } from './graphql/client';
import {
  QUERY_CHAINS,
  QUERY_HUBS,
  QUERY_HUB_ASSETS,
  QUERY_SPOKES,
  QUERY_RESERVES,
  QUERY_HUB_SPOKE_CONFIGS,
} from './graphql/queries';
import type {
  GqlHub,
  GqlHubAsset,
  GqlHubSpokeConfig,
  GqlReserve,
  GqlSpoke,
  HubSpokeConfigForPair,
} from './graphql/types';
import { FALLBACK_CHAINS, resolveChains, type ApiChain, type ChainInfo } from './chains';
import { scopeToChain, transform, type ChainLoadStatus, type RawData } from './transform';
import { clientFor } from './rpc/client';
import { fetchRpc, mergeRpcReads, type RpcReads } from './rpc/reads';
import { crawlRpcChain, type ChainRawData } from './rpc/crawl';
import type { AaveParams, Topology } from './types';

// Run `fn` across `items` with a max of `limit` in flight at any time.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// First two non-empty lines ("HTTP request failed. Status: 503"), never the
// request body viem appends.
const errMsg = (e: unknown) =>
  (e instanceof Error ? e.message : String(e))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .slice(0, 160);

async function fetchChainList(): Promise<ChainInfo[]> {
  try {
    const r = await gql.request<{ chains: ApiChain[] }>(QUERY_CHAINS);
    return resolveChains(r.chains);
  } catch (err) {
    console.warn('[aavekit] chains query failed, using the static registry:', err);
    return FALLBACK_CHAINS;
  }
}

/** Everything AaveKit serves, for all its chains in one pass. */
async function fetchAaveKit(chains: ChainInfo[]): Promise<ChainRawData> {
  const chainIds = chains.map((c) => c.chainId);
  // Round 1: hubs + spokes across every chain (2 queries).
  const [hubsRes, spokesRes] = await Promise.all([
    gql.request<{ hubs: GqlHub[] }>(QUERY_HUBS, { chainIds }),
    gql.request<{ spokes: GqlSpoke[] }>(QUERY_SPOKES, { chainIds }),
  ]);
  const hubs = hubsRes.hubs;
  const spokes = spokesRes.spokes;

  // Round 2: per-hub assets + per-spoke reserves + per-(hub,spoke) configs,
  // configs only for connected pairs (avoids an N×M cartesian).
  type Round2Item =
    | { kind: 'ha'; hubId: string }
    | { kind: 'res'; spokeId: string }
    | {
        kind: 'hsc';
        chainId: number;
        hubId: string;
        hubAddress: `0x${string}`;
        spokeId: string;
        spokeAddress: `0x${string}`;
      };
  const items: Round2Item[] = [
    ...hubs.map((h): Round2Item => ({ kind: 'ha', hubId: h.id })),
    ...spokes.map((s): Round2Item => ({ kind: 'res', spokeId: s.id })),
  ];
  for (const s of spokes) {
    for (const c of s.connectedHubs) {
      items.push({
        kind: 'hsc',
        chainId: s.chain.chainId,
        hubId: c.hub.id,
        hubAddress: c.hub.address,
        spokeId: s.id,
        spokeAddress: s.address,
      });
    }
  }

  const hubAssetsByHubId: Record<string, GqlHubAsset[]> = {};
  const reservesBySpokeId: Record<string, GqlReserve[]> = {};
  const hubSpokeConfigsByPair: HubSpokeConfigForPair[] = [];
  await mapWithConcurrency(items, 6, async (item) => {
    if (item.kind === 'ha') {
      const r = await gql.request<{ hubAssets: GqlHubAsset[] }>(QUERY_HUB_ASSETS, { hubId: item.hubId });
      hubAssetsByHubId[item.hubId] = r.hubAssets;
    } else if (item.kind === 'res') {
      const r = await gql.request<{ reserves: GqlReserve[] }>(QUERY_RESERVES, { spokeId: item.spokeId });
      reservesBySpokeId[item.spokeId] = r.reserves;
    } else {
      const r = await gql.request<{ hubSpokeConfigs: GqlHubSpokeConfig[] }>(QUERY_HUB_SPOKE_CONFIGS, {
        hubId: item.hubId,
        spokeId: item.spokeId,
      });
      hubSpokeConfigsByPair.push({
        chainId: item.chainId,
        hubAddress: item.hubAddress,
        spokeAddress: item.spokeAddress,
        entries: r.hubSpokeConfigs,
      });
    }
  });

  // Round 3: RPC-only fields, one multicall pair per chain, in parallel.
  // Failures fall back to placeholders inside fetchRpc.
  const rpcParts: RpcReads[] = await Promise.all(
    chains.map((chain) => {
      const chainSpokes = spokes.filter((s) => s.chain.chainId === chain.chainId);
      const reserveRefs = chainSpokes.flatMap((s) =>
        (reservesBySpokeId[s.id] ?? []).map((r) => ({
          spokeAddress: s.address,
          reserveId: Number(r.onChainId),
        })),
      );
      return fetchRpc(
        clientFor(chain),
        chain.chainId,
        chainSpokes.map((s) => s.address),
        reserveRefs,
      );
    }),
  );

  return {
    hubs,
    hubAssetsByHubId,
    spokes,
    reservesBySpokeId,
    hubSpokeConfigsByPair,
    rpc: mergeRpcReads(rpcParts),
  };
}

async function fetchAaveParams(): Promise<AaveParams> {
  const chains = await fetchChainList();
  const kitChains = chains.filter((c) => c.source === 'aavekit');
  const rpcChains = chains.filter((c) => c.source === 'rpc');

  const settled = await Promise.allSettled([
    kitChains.length ? fetchAaveKit(kitChains) : Promise.resolve(null),
    ...rpcChains.map(async (c) => {
      const client = clientFor(c);
      if (!client) throw new Error('no RPC endpoint configured');
      return crawlRpcChain(c, client);
    }),
  ]);

  const parts: ChainRawData[] = [];
  const chainStatus: ChainLoadStatus[] = [];
  const [kitRes, ...rpcRes] = settled;
  if (kitRes.status === 'fulfilled') {
    if (kitRes.value) parts.push(kitRes.value);
    kitChains.forEach((c) => chainStatus.push({ chainId: c.chainId, status: 'ok' }));
  } else {
    console.warn('[aavekit] load failed:', kitRes.reason);
    kitChains.forEach((c) =>
      chainStatus.push({ chainId: c.chainId, status: 'error', error: errMsg(kitRes.reason) }),
    );
  }
  rpcRes.forEach((res, i) => {
    const c = rpcChains[i];
    if (res.status === 'fulfilled' && res.value) {
      parts.push(res.value);
      chainStatus.push({ chainId: c.chainId, status: 'ok' });
    } else {
      const reason = res.status === 'rejected' ? res.reason : 'empty';
      console.warn(`[rpc crawl] ${c.label} failed:`, reason);
      chainStatus.push({ chainId: c.chainId, status: 'error', error: errMsg(reason) });
    }
  });

  // Nothing loaded anywhere → throw so React Query retries and the views show
  // their error state, instead of rendering an empty protocol.
  if (parts.length === 0) {
    throw new Error('No network loaded: ' + chainStatus.map((s) => s.error).join('; '));
  }

  const raw: RawData = {
    chains,
    chainStatus,
    hubs: parts.flatMap((p) => p.hubs),
    hubAssetsByHubId: Object.assign({}, ...parts.map((p) => p.hubAssetsByHubId)),
    spokes: parts.flatMap((p) => p.spokes),
    reservesBySpokeId: Object.assign({}, ...parts.map((p) => p.reservesBySpokeId)),
    hubSpokeConfigsByPair: parts.flatMap((p) => p.hubSpokeConfigsByPair),
    rpc: mergeRpcReads(parts.map((p) => p.rpc)),
  };
  return transform(raw);
}

export function useAaveParams() {
  return useQuery<AaveParams>({
    queryKey: ['aave-v4-params', 'live', 'multichain'],
    queryFn: fetchAaveParams,
  });
}

// ---------------------------------------------------------------------------
// Chain scope — the header's network switcher. Every view reads data through
// `useScopedParams` / `useTopology`, so they all agree on the same slice.
// ---------------------------------------------------------------------------
export type ChainScope = number | 'all';

export const ChainScopeContext = createContext<{
  scope: ChainScope;
  setScope: (s: ChainScope) => void;
}>({ scope: 'all', setScope: () => {} });

export function useChainScope() {
  return useContext(ChainScopeContext);
}

export function useScopedParams() {
  const q = useAaveParams();
  const { scope } = useChainScope();
  const data = useMemo(() => (q.data ? scopeToChain(q.data, scope) : undefined), [q.data, scope]);
  return { ...q, data };
}

// Topology view for the matrix tab — derived synchronously from the same
// scoped cache. Empty hub list during load.
export function useTopology(): Topology {
  const { data } = useScopedParams();
  return useMemo(() => {
    if (!data) return { hubs: [], creditLines: [], HUB_NAMES: {}, assetMeta: {} };
    const hubNames: Record<string, string> = {};
    for (const h of data.hubs) hubNames[h.id] = h.label;
    return {
      hubs: data.hubs.map((h) => ({
        id: h.id,
        chainId: h.chain.chainId,
        label: h.label,
        tag: h.tag,
        color: h.color,
        spokes: h.spokes,
      })),
      creditLines: data.creditLines.map((cl) => ({
        from: cl.from,
        to: cl.to,
        toSpoke: cl.toSpoke,
        assets: cl.assets,
      })),
      HUB_NAMES: hubNames,
      assetMeta: data.assetMeta,
    };
  }, [data]);
}

export type { AaveParams, Topology } from './types';
