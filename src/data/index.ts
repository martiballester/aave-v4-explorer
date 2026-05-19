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

async function fetchAaveParams(): Promise<AaveParams> {
  // Round 1: hubs + spokes + hubSpokeConfigs in parallel.
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

  // Round 2: per-hub assets + per-spoke reserves, all in parallel.
  const [hubAssetResults, reserveResults] = await Promise.all([
    Promise.all(
      hubs.map((h) =>
        gql
          .request<{ hubAssets: GqlHubAsset[] }>(QUERY_HUB_ASSETS, { hubId: h.id })
          .then((r) => [h.id, r.hubAssets] as const),
      ),
    ),
    Promise.all(
      spokes.map((s) =>
        gql
          .request<{ reserves: GqlReserve[] }>(QUERY_RESERVES, { spokeId: s.id })
          .then((r) => [s.id, r.reserves] as const),
      ),
    ),
  ]);

  const hubAssetsByHubId: Record<string, GqlHubAsset[]> = {};
  for (const [hubId, list] of hubAssetResults) hubAssetsByHubId[hubId] = list;

  const reservesBySpokeId: Record<string, GqlReserve[]> = {};
  for (const [spokeId, list] of reserveResults) reservesBySpokeId[spokeId] = list;

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
