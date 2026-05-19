// Two-round multicall against the public RPC fallback chain to fill in the
// fields AaveKit GraphQL omits. Per page load:
//   round A: per spoke, ORACLE() + MAX_USER_RESERVES_LIMIT() — N×2 reads
//   round B: per (oracle, reserveId), getReserveSource(reserveId) — M reads
// Both bundled into Multicall3 via viem's `multicall()`.

import { publicClient } from './client';
import { SPOKE_ABI, ORACLE_ABI } from './abis';
import type { Address } from '../types';

export interface SpokeImmutables {
  oracle: Address;
  maxUserReservesLimit: number;
}

export interface ReserveOracleSource {
  spokeAddress: Address;
  reserveId: number;
  source: Address;
}

export interface RpcReads {
  spokeImmutables: Map<Address, SpokeImmutables>;
  reserveSources: Map<string, Address>; // key: `${spokeAddress}|${reserveId}`
}

const EMPTY_RPC: RpcReads = {
  spokeImmutables: new Map(),
  reserveSources: new Map(),
};

/** Fetch RPC-only fields for the given spokes and (spoke, reserveId) pairs.
 *  Returns empty maps on any error — UI falls back to placeholder values. */
export async function fetchRpc(
  spokeAddresses: Address[],
  reserveRefs: Array<{ spokeAddress: Address; reserveId: number }>,
): Promise<RpcReads> {
  if (spokeAddresses.length === 0) return EMPTY_RPC;

  try {
    // Round A: per spoke, ORACLE + MAX_USER_RESERVES_LIMIT
    const roundA = await publicClient.multicall({
      allowFailure: true,
      contracts: spokeAddresses.flatMap((addr) => [
        { address: addr, abi: SPOKE_ABI, functionName: 'ORACLE' } as const,
        { address: addr, abi: SPOKE_ABI, functionName: 'MAX_USER_RESERVES_LIMIT' } as const,
      ]),
    });

    const spokeImmutables = new Map<Address, SpokeImmutables>();
    const oracleByspoke = new Map<Address, Address>();
    for (let i = 0; i < spokeAddresses.length; i++) {
      const oracleRes = roundA[i * 2];
      const limitRes = roundA[i * 2 + 1];
      const oracle =
        oracleRes.status === 'success' ? (oracleRes.result as Address) : ('0x0000000000000000000000000000000000000000' as Address);
      const limit = limitRes.status === 'success' ? Number(limitRes.result) : 0;
      spokeImmutables.set(spokeAddresses[i], { oracle, maxUserReservesLimit: limit });
      if (oracle !== '0x0000000000000000000000000000000000000000') {
        oracleByspoke.set(spokeAddresses[i], oracle);
      }
    }

    // Round B: per (oracle, reserveId), getReserveSource
    const calls = reserveRefs
      .map((r) => ({ ...r, oracle: oracleByspoke.get(r.spokeAddress) }))
      .filter((r): r is { spokeAddress: Address; reserveId: number; oracle: Address } => !!r.oracle);

    const reserveSources = new Map<string, Address>();
    if (calls.length > 0) {
      const roundB = await publicClient.multicall({
        allowFailure: true,
        contracts: calls.map((c) => ({
          address: c.oracle,
          abi: ORACLE_ABI,
          functionName: 'getReserveSource',
          args: [BigInt(c.reserveId)],
        } as const)),
      });
      for (let i = 0; i < calls.length; i++) {
        const res = roundB[i];
        if (res.status === 'success') {
          reserveSources.set(
            `${calls[i].spokeAddress}|${calls[i].reserveId}`,
            res.result as Address,
          );
        }
      }
    }

    return { spokeImmutables, reserveSources };
  } catch (err) {
    console.warn('[rpc] reads failed, falling back to placeholders:', err);
    return EMPTY_RPC;
  }
}
