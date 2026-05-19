// Phase 1: returns the fixture-built AaveParams synchronously via a resolved promise.
// Phase 2: replace fetchAaveParams() with the live GraphQL + RPC adapter.
// The hook signature must stay identical (DATA-CONTRACT.md is the boundary).

import { useQuery } from '@tanstack/react-query';
import { aaveParams } from './fixtures/params';
import { topology } from './fixtures/topology';
import type { AaveParams, Topology } from './types';

async function fetchAaveParams(): Promise<AaveParams> {
  return aaveParams;
}

export function useAaveParams() {
  return useQuery<AaveParams>({
    queryKey: ['aave-v4-params'],
    queryFn: fetchAaveParams,
  });
}

// The matrix view needs the topology + asset metadata. These are editorial /
// static — they don't change with on-chain state, so we expose them directly.
export function useTopology(): Topology {
  return topology;
}

export type { AaveParams, Topology } from './types';
