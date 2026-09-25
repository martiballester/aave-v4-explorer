# Maintenance — what can go stale, and what's safe to ignore

## Adding a network

All networks live in **`src/data/chains.ts`**.

- **AaveKit-indexed network:** nothing to do. The explorer asks AaveKit's `chains` query for every mainnet network on each load and fetches hubs/spokes for all of them. A registry entry is optional polish: a short label, a URL slug (`?chain=<slug>`), browser-CORS RPCs for the oracle multicall, and display order.
- **White-label / non-indexed deployment** (today: the EtherFi instance on OP Mainnet): add an entry with `source: 'rpc'` and the **hub addresses**. `src/data/rpc/crawl.ts` walks each hub on-chain (assets, connected spokes, reserves, oracle prices, caps, IRM) and emits the same shapes as the AaveKit adapter. Spokes are discovered from the hubs; non-lending spokes (the treasury fee receiver) are skipped automatically. Optional `spokeLabels` gives spokes a display name.

Each network loads independently. If one source fails (AaveKit down, or all of a chain's RPCs down), that network is flagged "failed to load" in the switcher and Overview; the others still render.

Crawled figures use the contract formulas (utilization = totalOwed / addedAssets, borrow APR = drawnRate ray, supply APR = borrow APR × utilization × (1 − liquidityFee), per-second compounding to APY). Checked against AaveKit on Ethereum Core (EURC, frxUSD, GHO): borrow/supply APY and utilization agree to 4 decimals.

The dashboard refreshes on every page load — most data comes from the AaveKit GraphQL API and a public RPC multicall. But a handful of values are baked into the bundle. This doc lists every one of them, classifies the risk, and tells you whether you need to touch it.

**Default stance**: "leave alone" unless something on the live site visibly breaks.

---

## 🟢 Auto-updates — no maintenance ever

These are fully data-driven. New hub, new spoke, new asset, new credit line, new dynamic config key — they all show up automatically next page load.

| Field | Source |
|---|---|
| Networks | `chains` query (MAINNET_ONLY) merged with `src/data/chains.ts` |
| Hubs (count, names, addresses, TVL, util) | `hubs` query, all chains in one call |
| Hub assets (per-asset settings, IRM curve, addCap, drawCap, fees) | `hubAssets` query (per hub) |
| Spokes (count, names, addresses, totals, liquidation config) | `spokes` query |
| Reserves (CF, maxLB, liqFee, collateralRisk, status, paused/frozen, caps, APY) | `reserves` query (per spoke) |
| **Credit lines** | derived from `hubSpokeConfigs` (per connected pair) + reserves-based parent-hub detection — `transform.ts` step 3+6. New multi-hub spokes auto-classify on first load. |
| Parent-hub assignment | derived from collateral-side reserve count per hub (`transform.ts` step 3) |
| Credit-line "c" prefix | derived from `reserve.hub != spoke.parentHub` (`transform.ts` step 4) |
| Per-reserve oracle price feed address | `AaveOracle.getReserveSource()` via multicall RPC |
| Per-spoke oracle address + max user reserves limit | `Spoke.ORACLE()` + `Spoke.MAX_USER_RESERVES_LIMIT()` via multicall RPC |

---

## 🟡 Aesthetic only — safe to leave (won't break anything)

Visual polish for the known cases. New entries fall back gracefully — no icon, generic color, default "General" type. The site still works.

| File | Field | What happens if it drifts |
|---|---|---|
| `src/data/editorial.ts` | `HUB_EDITORIAL_BY_NAME` (Core / Plus / Prime → tag + color) | Keyed by hub name, so every chain's "Core" shares the Core look. Unknown hubs render grey with their on-chain name. |
| `src/data/editorial.ts` | `SPOKE_TYPE_BY_NAME` | "e-Mode" / "Specialty" / "General". Unknown spokes fall back to a name heuristic. Safe to delete. |
| `src/data/editorial.ts` | `ASSET_META` (curated icons) | Optional. Any token without an entry uses the icon AaveKit serves, else a generated logo keyed by chain + address. PTs always take their underlying's icon (`PT-sUSDE-7MAY2026` → sUSDe), credit-line reserves (`cUSDC`) the base token's. |
| `src/data/chains.ts` | `hubs[].label` for RPC chains | Hubs carry no on-chain name; the OP labels ("EtherFi", "EtherFi II") are editorial. |

**Bottom line on 🟡**: zero maintenance needed. If you want prettier UI for a new token/spoke, add an entry. Otherwise the fallback is acceptable.

---

## 🟠 Load-bearing but defensive — fix if it breaks

These would visibly break the dashboard if upstream changes, but each has fallback behavior so nothing crashes — you'd just see degraded data.

| File | Field | Drift risk | Fix when broken |
|---|---|---|---|
| `src/data/chains.ts` | `hubs` for `source: 'rpc'` networks | A new hub on a white-label deployment is not auto-discovered (AaveKit doesn't index it). | Add its address to that network's `hubs`. |
| `src/data/graphql/queries.ts` | All 5 GraphQL query bodies | AaveKit can change schema (we hit this once: `hubSpokeConfigs` changed argument shape; `ReserveStatus` is an object not enum). Symptoms: data fails to render, console shows GraphQL errors. | Open the [GraphQL playground](https://api.v4.aave.com/graphql) → introspect `__type(name:"X")` → fix the query. |
| `src/data/rpc/abis.ts` | Hub / Spoke / Oracle / IR-strategy ABI fragments | If V4 view signatures change, oracle multicalls fall back to placeholders, and the OP crawler fails (flagged in the UI). | Update ABI; check `aave-v4/src/hub/interfaces/IHub.sol`, `src/spoke/interfaces/ISpoke.sol`. |
| `src/data/chains.ts` | `rpcUrls` per network | Public RPCs come and go. All endpoints for a chain down → oracle fields show placeholders (AaveKit chains) or the network is flagged failed (RPC chains). | Swap in another CORS-enabled public RPC. `VITE_RPC_URL_<chainId>` overrides locally. |

---

## 🔴 Drift risk worth watching

One real risk: the **AaveKit GraphQL schema changes shape**. We hit two cases today:

1. `hubSpokeConfigs(request: { query: { chainIds } })` → `hubSpokeConfigs(request: { hubId, spokeId })`
2. `ReserveStatus` was treated as an enum scalar, but it's an object `{ frozen, paused, active }`

Both gave HTTP 200 with `data: null + errors[]`, which TanStack Query treated as success-with-empty-data → cascading silent failure. The dashboard appeared to "hang on Loading…" with no error in the console.

**How to detect early:**

```bash
# Re-introspect the schema, diff against the committed snapshot
curl -sS -X POST 'https://api.v4.aave.com/graphql' \
  -H 'content-type: application/json' \
  -d '{"query":"query{__schema{types{name kind fields{name type{name kind ofType{name kind ofType{name kind ofType{name kind}}}}}}}}"}' \
  > /tmp/schema-new.json
diff <(jq -S . ../Visulizer/schema_raw.json) <(jq -S . /tmp/schema-new.json) | head -100
```

If the diff shows changes in any of the 5 query input/output types we use (`HubsRequestQuery`, `HubAssetsRequestQuery`, `SpokesRequestQuery`, `ReservesRequestQuery`, `HubSpokeConfigsRequest`), update `queries.ts` + `graphql/types.ts` + the corresponding transform path.

**Could we make this self-healing?** Not really. GraphQL field shapes have no fallback semantics — wrong shape = no data. The only defense is the smoke test in `MAINTENANCE.md → Smoke test` below.

---

## ⚪ Hardcoded but truly invariant

These won't change in any plausible future. Don't worry about them.

| Value | Why invariant |
|---|---|
| `RAY = 1e27`, `WAD = 1e18`, `PERCENTAGE_FACTOR = 1e4` | Math conventions, not protocol parameters |
| Public RPC URL list (`drpc.org`, `llamarpc.com`, `merkle.io`, `ankr.com`) | If one goes down, viem fallback uses the next. All four would need to die simultaneously. |
| AaveKit GraphQL endpoint (`api.v4.aave.com/graphql`) | Aave's official public endpoint. If this changes, set `VITE_AAVE_GRAPHQL` in env. |
| `oracle.decimals: 8` (per-reserve) | Chainlink price feed convention. All V4 oracles I checked report 8. |

---

## Quick smoke test (when something feels off)

Run from inside the project:

```bash
# 1. Does the bundle still build?
npm run build

# 2. Do all 5 GraphQL queries return data?
python3 <<'PY'
import json, urllib.request
URL = 'https://api.v4.aave.com/graphql'
def gql(q, v=None):
    body = json.dumps({'query': q, 'variables': v or {}}).encode()
    req = urllib.request.Request(URL, data=body, headers={'content-type': 'application/json'})
    r = json.load(urllib.request.urlopen(req, timeout=10))
    if r.get('errors'): print(f'  ❌ {r["errors"][0]["message"][:120]}'); return None
    return r['data']

chains = gql('query{chains(request:{query:{filter:MAINNET_ONLY}}){chainId name}}')
ids = [c['chainId'] for c in chains['chains']] if chains else [1]
print(f'chains: {ids}')

hubs = gql('query($c:[ChainId!]!){hubs(request:{query:{chainIds:$c}}){id name address}}', {'c': ids})
print(f'hubs: {len(hubs["hubs"]) if hubs else "FAIL"}')

spokes = gql('query($c:[ChainId!]!){spokes(request:{query:{chainIds:$c}}){id name connectedHubs{hub{address}}}}', {'c': ids})
print(f'spokes: {len(spokes["spokes"]) if spokes else "FAIL"}')

if hubs and spokes:
    h0 = hubs["hubs"][0]
    ha = gql('query($h:HubId!){hubAssets(request:{query:{hubId:$h}}){id}}', {'h': h0['id']})
    print(f'hubAssets({h0["name"]}): {len(ha["hubAssets"]) if ha else "FAIL"}')

    s0 = spokes["spokes"][0]
    r = gql('query($s:SpokeId!){reserves(request:{query:{spokeId:$s}}){id status{active}}}', {'s': s0['id']})
    print(f'reserves({s0["name"]}): {len(r["reserves"]) if r else "FAIL"}')

    h0_addr = s0['connectedHubs'][0]['hub']['address']
    h0_gql = next(h for h in hubs["hubs"] if h['address'].lower() == h0_addr.lower())
    hsc = gql('query($h:HubId!,$s:SpokeId!){hubSpokeConfigs(request:{hubId:$h,spokeId:$s}){active}}',
              {'h': h0_gql['id'], 's': s0['id']})
    print(f'hubSpokeConfigs({h0_gql["name"]} × {s0["name"]}): {len(hsc["hubSpokeConfigs"]) if hsc else "FAIL"}')
PY

# 3. Does the live site load?
open https://martiballester.github.io/aave-v4-explorer/
```

If any line says FAIL → that's the GraphQL surface that drifted. Match the error message back to its query in `src/data/graphql/queries.ts` and re-introspect that input/output type.

---

## TL;DR — the maintenance budget

- **🟢 86% of the data updates itself.** Cap raises, IRM changes, new spokes, new credit lines, parameter tightenings — all auto-apply next page load.
- **🟡 13% is aesthetic.** New asset without an icon? Generic gray fallback. New spoke without a "Specialty" tag? Auto-inferred from name. Don't touch unless you want it prettier.
- **🟠 1% is real risk.** The GraphQL schema can change shape (it did, twice, today). Symptoms: dashboard stuck on "Loading…" with no console error. Run the smoke test above.

If the live site looks correct, nothing needs maintenance. If it looks wrong, the smoke test pinpoints the layer (GraphQL / RPC / config) within seconds.
