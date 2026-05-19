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
  HubSpokeConfigForPair,
} from './graphql/types';
import { transform } from './transform';
import { fetchRpc } from './rpc/reads';
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
  // Round 1: hubs + spokes only (2 queries). hubSpokeConfigs moved to round 2
  // because it now requires per-(hub, spoke) querying — needs spoke IDs first.
  const [hubsRes, spokesRes] = await Promise.all([
    gql.request<{ hubs: GqlHub[] }>(QUERY_HUBS),
    gql.request<{ spokes: GqlSpoke[] }>(QUERY_SPOKES),
  ]);

  const hubs = hubsRes.hubs;
  const spokes = spokesRes.spokes;

  // Round 2: per-hub assets + per-spoke reserves + per-(hub,spoke) configs.
  // For configs, only query connected pairs (avoids N*M cartesian).
  type Round2Item =
    | { kind: 'ha'; hubId: string }
    | { kind: 'res'; spokeId: string }
    | { kind: 'hsc'; hubId: string; hubAddress: `0x${string}`; spokeId: string; spokeAddress: `0x${string}` };

  const items: Round2Item[] = [
    ...hubs.map((h): Round2Item => ({ kind: 'ha', hubId: h.id })),
    ...spokes.map((s): Round2Item => ({ kind: 'res', spokeId: s.id })),
  ];

  // Add one config query per connected (hub, spoke) pair
  for (const s of spokes) {
    for (const c of s.connectedHubs) {
      items.push({
        kind: 'hsc',
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

  await mapWithConcurrency(items, 4, async (item) => {
    if (item.kind === 'ha') {
      const r = await gql.request<{ hubAssets: GqlHubAsset[] }>(QUERY_HUB_ASSETS, {
        hubId: item.hubId,
      });
      hubAssetsByHubId[item.hubId] = r.hubAssets;
    } else if (item.kind === 'res') {
      const r = await gql.request<{ reserves: GqlReserve[] }>(QUERY_RESERVES, {
        spokeId: item.spokeId,
      });
      reservesBySpokeId[item.spokeId] = r.reserves;
    } else {
      const r = await gql.request<{ hubSpokeConfigs: GqlHubSpokeConfig[] }>(
        QUERY_HUB_SPOKE_CONFIGS,
        { hubId: item.hubId, spokeId: item.spokeId },
      );
      hubSpokeConfigsByPair.push({
        hubAddress: item.hubAddress,
        spokeAddress: item.spokeAddress,
        entries: r.hubSpokeConfigs,
      });
    }
  });

  // Round 3 (phase 2.1): RPC reads for fields AaveKit doesn't expose —
  // per-spoke ORACLE() + MAX_USER_RESERVES_LIMIT, per-reserve oracle source
  // address. One viem multicall against drpc public RPC (no key). Falls back
  // to placeholders on any error so the page still renders.
  const reserveRefs = Object.entries(reservesBySpokeId).flatMap(([spokeId, reserves]) => {
    const spoke = spokes.find((s) => s.id === spokeId);
    if (!spoke) return [];
    return reserves.map((r) => ({
      spokeAddress: spoke.address,
      reserveId: Number(r.onChainId),
    }));
  });
  const rpc = await fetchRpc(
    spokes.map((s) => s.address),
    reserveRefs,
  );

  return transform({
    hubs,
    hubAssetsByHubId,
    spokes,
    reservesBySpokeId,
    hubSpokeConfigsByPair,
    rpc,
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
