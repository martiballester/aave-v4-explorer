# Aave V4 Explorer — LlamaRisk

A static, point-in-time dashboard mapping the Aave V4 hub-and-spoke topology and parameter surface. Built from the design handoff at `../Visulizer/handoff/`. Deploys to GitHub Pages.

## Status

**Phase 1 (port) complete.** The prototype JSX has been ported to TypeScript React. Mock data still in place — the data layer reads from `src/data/fixtures/` rather than live AaveKit + RPC.

**Phase 2 (live data) pending.** `src/data/index.ts::fetchAaveParams` currently returns the fixture; replace its body with the GraphQL + RPC adapter per `../Visulizer/handoff/DATA-CONTRACT.md` and `QUERIES.md`. The hook signature must stay identical.

**Phase 3 (deploy) ready.** `.github/workflows/deploy.yml` is in place. One-time GitHub setup: Settings → Pages → Source = "GitHub Actions"; Settings → Secrets → add `VITE_RPC_URL`.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # produces dist/
npm run preview  # serves dist/ locally
```

## Project layout

```
src/
├── App.tsx                                # tab nav + view switcher
├── main.tsx                               # ReactDOM root + TanStack Query provider
├── styles/                                # ports of prototype CSS
│   ├── shared.css                         # LlamaRisk design tokens
│   ├── matrix.css
│   ├── params.css
│   └── index.css                          # imports the three + body styles
├── data/
│   ├── types.ts                           # AaveParams contract (matches DATA-CONTRACT.md)
│   ├── index.ts                           # useAaveParams() hook
│   ├── fixtures/
│   │   ├── topology.ts                    # static topology + asset metadata
│   │   └── params.ts                      # mock hub/spoke/reserve data
│   ├── graphql/                           # (Phase 2) live GraphQL queries
│   └── rpc/                               # (Phase 2) viem multicall reads
└── ui/
    ├── TopologyView/Matrix.tsx            # asset × spoke matrix
    └── ParametersView/ParamsExplorer.tsx  # hub/spoke/reserve drill-down
```

## Design tokens

Defined in `src/styles/shared.css` under `:root` — palette, type, spacing. Do not invent new tokens. Hub colors: Core `#C9B68C` (sand), Plus `#D88E5A` (clay), Prime `#6FB7AE` (mint). Credit semantics: red `#C76B58` (incoming) / mint `#6FB7AE` (outgoing).

## Phase 2 entry points

The data adapter is the only file that should change to swap mocks for live data:

```ts
// src/data/index.ts
async function fetchAaveParams(): Promise<AaveParams> {
  // currently: returns aaveParams (the fixture)
  // Phase 2: parallel GraphQL + RPC fetches, then transform into AaveParams shape
}
```

Reference: `../Visulizer/handoff/QUERIES.md` for the GraphQL operations and the viem multicall recipe. `../Visulizer/PARAMS.md` §D.1 maps every parameter to either a GraphQL path or an RPC selector.
