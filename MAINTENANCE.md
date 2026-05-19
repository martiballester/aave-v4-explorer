# Maintenance — what can go stale, and what's safe to ignore

The dashboard refreshes on every page load — most data comes from the AaveKit GraphQL API and a public RPC multicall. But a handful of values are baked into the bundle. This doc lists every one of them, classifies the risk, and tells you whether you need to touch it.

**Default stance**: "leave alone" unless something on the live site visibly breaks.

---

## 🟢 Auto-updates — no maintenance ever

These are fully data-driven. New hub, new spoke, new asset, new credit line, new dynamic config key — they all show up automatically next page load.

| Field | Source |
|---|---|
| Hubs (count, names, addresses, TVL, util) | `hubs` query |
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
| `src/data/editorial.ts` | `HUB_EDITORIAL[*].tag` (`"Risk-adjusted"`, `"Risk-return"`, `"Low risk"`) | Old editorial labels — if the protocol re-tags hubs, our chips show the old phrasing. Cosmetic. |
| `src/data/editorial.ts` | `HUB_EDITORIAL[*].color` (sand / clay / mint) | Hub-color theme tokens. Visual only. |
| `src/data/editorial.ts` | `SPOKE_SLUG_BY_ADDRESS` | Pretty slugs for the 10 known spokes. New spokes get `<parentHub>-<name-slugified>` automatically. **Safe to delete entirely** — slugs will just look less polished. |
| `src/data/editorial.ts` | `SPOKE_TYPE_BY_SLUG` | "e-Mode" / "Specialty" / "General" classifications. New spokes get `inferSpokeTypeFromName()` heuristic ("correlated", "lido", "gold" → matching types). Safe to delete entirely. |
| `src/data/editorial.ts` | `ASSET_META` (token icons + display names) | New asset symbols not listed here render with generic gray icon. Tokens with their SVG at `app.aave.com/icons/tokens/<symbol>.svg` would work if we add an entry. |

**Bottom line on 🟡**: zero maintenance needed. If you want prettier UI for a new token/spoke, add an entry. Otherwise the fallback is acceptable.

---

## 🟠 Load-bearing but defensive — fix if it breaks

These would visibly break the dashboard if upstream changes, but each has fallback behavior so nothing crashes — you'd just see degraded data.

| File | Field | Drift risk | Fix when broken |
|---|---|---|---|
| `src/data/editorial.ts` | `HUB_ADDRESS_TO_ID` (3 mainnet hub addresses → id) | If Aave redeploys a hub or adds a new one, the unknown hub gets silently dropped (no `id` mapping). | Add the new address → id. The id can be any lowercase string. |
| `src/data/graphql/queries.ts` | All 5 GraphQL query bodies | AaveKit can change schema (we hit this once: `hubSpokeConfigs` changed argument shape; `ReserveStatus` is an object not enum). Symptoms: data fails to render, console shows GraphQL errors. | Open the [GraphQL playground](https://api.v4.aave.com/graphql) → introspect `__type(name:"X")` → fix the query. |
| `src/data/rpc/abis.ts` | Spoke + Oracle ABI fragments | If Aave V4 contract signatures change (`ORACLE`, `MAX_USER_RESERVES_LIMIT`, `getReserveSource`), multicall returns `failure` per-call and the UI falls back to placeholders. | Update ABI; check `aave-v4/src/spoke/Spoke.sol` for current selectors. |
| `src/data/index.ts` | `chainIds: [1]` (Ethereum mainnet only) | V4 is mainnet-only today. If it expands to L2s (Base, Arbitrum, etc.), the dashboard won't pick them up. | Change `chainIds: [1]` → `chainIds: [1, 8453, ...]`. Then the matrix and parameters views auto-include them. |
| `src/data/index.ts` | `HUB_NAMES = { core, plus, prime }` (display labels) | If a new hub (e.g. "Frontier") gets added, it'll render as `undefined` in the credit-line "from"/"to" badges. | Add `frontier: 'Frontier'`. Or auto-derive from `HUB_EDITORIAL[id].label`. |

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

hubs = gql('query{hubs(request:{query:{chainIds:[1]}}){id name address}}')
print(f'hubs: {len(hubs["hubs"]) if hubs else "FAIL"}')

spokes = gql('query{spokes(request:{query:{chainIds:[1]}}){id name connectedHubs{hub{address}}}}')
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
