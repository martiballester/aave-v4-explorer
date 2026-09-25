// Two-round multicall per chain to fill in the fields AaveKit GraphQL omits.
// Per page load, per chain:
//   round A: per spoke, ORACLE() + MAX_USER_RESERVES_LIMIT() — N×2 reads
//   round B: per (oracle, reserveId), getReserveSource(reserveId) — M reads
// Both bundled into Multicall3 via viem's `multicall()`.
//
// Map keys carry the chain id: V4 contracts are often deployed with CREATE2,
// so the same address can exist on two chains.

import type { PublicClient } from 'viem';
import { SPOKE_ABI, ORACLE_ABI } from './abis';
import type { Address } from '../types';

export interface SpokeImmutables {
  oracle: Address;
  maxUserReservesLimit: number;
}

export interface RpcReads {
  spokeImmutables: Map<string, SpokeImmutables>; // key: spokeKey(chainId, spoke)
  reserveSources: Map<string, Address>; // key: reserveKey(chainId, spoke, reserveId)
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export const spokeKey = (chainId: number, spoke: string) => `${chainId}|${spoke.toLowerCase()}`;
export const reserveKey = (chainId: number, spoke: string, reserveId: number) =>
  `${chainId}|${spoke.toLowerCase()}|${reserveId}`;

export function emptyRpcReads(): RpcReads {
  return { spokeImmutables: new Map(), reserveSources: new Map() };
}

/** Merge per-chain results into one lookup. */
export function mergeRpcReads(parts: RpcReads[]): RpcReads {
  const out = emptyRpcReads();
  for (const p of parts) {
    p.spokeImmutables.forEach((v, k) => out.spokeImmutables.set(k, v));
    p.reserveSources.forEach((v, k) => out.reserveSources.set(k, v));
  }
  return out;
}

/** Fetch RPC-only fields for one chain's spokes and (spoke, reserveId) pairs.
 *  Returns empty maps on any error — UI falls back to placeholder values. */
export async function fetchRpc(
  client: PublicClient | null,
  chainId: number,
  spokeAddresses: Address[],
  reserveRefs: Array<{ spokeAddress: Address; reserveId: number }>,
): Promise<RpcReads> {
  const out = emptyRpcReads();
  if (!client || spokeAddresses.length === 0) return out;

  try {
    const roundA = await client.multicall({
      allowFailure: true,
      contracts: spokeAddresses.flatMap((addr) => [
        { address: addr, abi: SPOKE_ABI, functionName: 'ORACLE' } as const,
        { address: addr, abi: SPOKE_ABI, functionName: 'MAX_USER_RESERVES_LIMIT' } as const,
      ]),
    });

    const oracleBySpoke = new Map<string, Address>();
    for (let i = 0; i < spokeAddresses.length; i++) {
      const oracleRes = roundA[i * 2];
      const limitRes = roundA[i * 2 + 1];
      const oracle = oracleRes.status === 'success' ? (oracleRes.result as Address) : ZERO_ADDRESS;
      const limit = limitRes.status === 'success' ? Number(limitRes.result) : 0;
      out.spokeImmutables.set(spokeKey(chainId, spokeAddresses[i]), {
        oracle,
        maxUserReservesLimit: limit,
      });
      if (oracle !== ZERO_ADDRESS) oracleBySpoke.set(spokeAddresses[i].toLowerCase(), oracle);
    }

    const calls = reserveRefs
      .map((r) => ({ ...r, oracle: oracleBySpoke.get(r.spokeAddress.toLowerCase()) }))
      .filter((r): r is { spokeAddress: Address; reserveId: number; oracle: Address } => !!r.oracle);

    if (calls.length > 0) {
      const roundB = await client.multicall({
        allowFailure: true,
        contracts: calls.map(
          (c) =>
            ({
              address: c.oracle,
              abi: ORACLE_ABI,
              functionName: 'getReserveSource',
              args: [BigInt(c.reserveId)],
            }) as const,
        ),
      });
      calls.forEach((c, i) => {
        const res = roundB[i];
        if (res.status === 'success') {
          out.reserveSources.set(reserveKey(chainId, c.spokeAddress, c.reserveId), res.result as Address);
        }
      });
    }
    return out;
  } catch (err) {
    console.warn(`[rpc] chain ${chainId} reads failed, falling back to placeholders:`, err);
    return emptyRpcReads();
  }
}
