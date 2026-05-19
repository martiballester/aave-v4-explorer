// Phase 2: live data via AaveKit GraphQL. No private RPC; public endpoint
// `https://api.v4.aave.com/graphql`. RPC-only fields (oracle source addr,
// deficitRay, spoke immutables) deferred to Phase 2.1.

import { useQuery } from '@tanstack/react-query';
import { gql } from './graphql/client';
import {
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
} from './graphql/types';
import { transform } from './transform';
import { ASSET_META } from './editorial';
import type { AaveParams, Topology } from './types';

const HUB_NAMES = { core: 'Core', plus: 'Plus', prime: 'Prime' } as const;

const EMPTY_TOPOLOGY: Topology = {
  hubs: [],
  creditLines: [],
  HUB_NAMES,
  assetMeta: ASSET_META,
};

// Run `fn` across `items` with a max of `limit` in flight at any time.
// The public AaveKit endpoint appears to rate-limit aggressive fan-out (>6
// parallel requests per IP stall indefinitely without erroring), so we cap
// concurrency conservatively. With 250ms/request and limit=4, the full 13-call
// round-2 batch completes in ~1s.
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

async function fetchAaveParams(): Promise<AaveParams> {
  // Round 1: hubs + spokes + hubSpokeConfigs in parallel (only 3 queries).
  // hubSpokeConfigs gives us cap aggregates per (hub, asset) for the hub-level
  // addCap/drawCap totals; spokes feeds the per-spoke reserve queries.
  const [hubsRes, spokesRes, hsConfigsRes] = await Promise.all([
    gql.request<{ hubs: GqlHub[] }>(QUERY_HUBS),
    gql.request<{ spokes: GqlSpoke[] }>(QUERY_SPOKES),
    gql.request<{ hubSpokeConfigs: GqlHubSpokeConfig[] }>(QUERY_HUB_SPOKE_CONFIGS),
  ]);

  const hubs = hubsRes.hubs;
  const spokes = spokesRes.spokes;
  const hubSpokeConfigs = hsConfigsRes.hubSpokeConfigs;

  // Round 2: per-hub assets + per-spoke reserves with bounded concurrency.
  const allItems = [
    ...hubs.map((h) => ({ kind: 'hub' as const, id: h.id })),
    ...spokes.map((s) => ({ kind: 'spoke' as const, id: s.id })),
  ];

  const hubAssetsByHubId: Record<string, GqlHubAsset[]> = {};
  const reservesBySpokeId: Record<string, GqlReserve[]> = {};

  await mapWithConcurrency(allItems, 4, async (item) => {
    if (item.kind === 'hub') {
      const r = await gql.request<{ hubAssets: GqlHubAsset[] }>(QUERY_HUB_ASSETS, {
        hubId: item.id,
      });
      hubAssetsByHubId[item.id] = r.hubAssets;
    } else {
      const r = await gql.request<{ reserves: GqlReserve[] }>(QUERY_RESERVES, {
        spokeId: item.id,
      });
      reservesBySpokeId[item.id] = r.reserves;
    }
  });

  return transform({
    hubs,
    hubAssetsByHubId,
    spokes,
    reservesBySpokeId,
    hubSpokeConfigs,
  });
}

export function useAaveParams() {
  return useQuery<AaveParams>({
    queryKey: ['aave-v4-params', 'live'],
    queryFn: fetchAaveParams,
  });
}

// Topology view for the matrix tab — derived synchronously from the same
// `useAaveParams` cache. Empty hub list during load.
export function useTopology(): Topology {
  const { data } = useAaveParams();
  if (!data) return EMPTY_TOPOLOGY;
  return {
    hubs: data.hubs.map((h) => ({
      id: h.id,
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
    HUB_NAMES,
    assetMeta: ASSET_META,
  };
}

export type { AaveParams, Topology } from './types';
