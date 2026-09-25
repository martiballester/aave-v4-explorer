import { useCallback, useMemo, useState } from 'react';
import { Overview } from './ui/OverviewView/Overview';
import { Matrix } from './ui/TopologyView/Matrix';
import { ParamsExplorer, type Selected } from './ui/ParametersView/ParamsExplorer';
import { ChainSwitcher } from './ui/ChainSwitcher';
import { ChainScopeContext, useAaveParams, type ChainScope } from './data';
import { FALLBACK_CHAINS } from './data/chains';
import type { HubId } from './data/types';

type Tab = 'overview' | 'matrix' | 'params';

// Network scope lives in the URL (`?chain=avalanche`) so a scoped view can be
// shared as a link. Unknown slugs fall back to "all networks".
function readScopeFromUrl(): ChainScope {
  try {
    const slug = new URLSearchParams(window.location.search).get('chain');
    const hit = FALLBACK_CHAINS.find((c) => c.slug === slug);
    return hit ? hit.chainId : 'all';
  } catch {
    return 'all';
  }
}

function writeScopeToUrl(scope: ChainScope, slug?: string) {
  try {
    const url = new URL(window.location.href);
    if (scope === 'all' || !slug) url.searchParams.delete('chain');
    else url.searchParams.set('chain', slug);
    window.history.replaceState(null, '', url);
  } catch {
    // non-browser / sandboxed history — scope still works in-memory
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [scope, setScopeState] = useState<ChainScope>(readScopeFromUrl);
  // When Overview's hub card is clicked, we jump to Parameters with that hub
  // pre-selected. ParamsExplorer manages its own selection thereafter.
  const [paramInitial, setParamInitial] = useState<Selected | undefined>(undefined);
  const { data } = useAaveParams();

  const chains = data?.chains;
  const setScope = useCallback(
    (s: ChainScope) => {
      setScopeState(s);
      setParamInitial(undefined);
      const slug =
        s === 'all'
          ? undefined
          : (chains?.find((c) => c.chainId === s) ?? FALLBACK_CHAINS.find((c) => c.chainId === s))?.slug;
      writeScopeToUrl(s, slug);
    },
    [chains],
  );
  const scopeCtx = useMemo(() => ({ scope, setScope }), [scope, setScope]);

  const drillIntoHub = (id: HubId) => {
    setParamInitial({ kind: 'hub', id });
    setTab('params');
  };

  return (
    <ChainScopeContext.Provider value={scopeCtx}>
      <div className="lr-art" data-screen-label={tab}>
        <header className="art-head">
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--fg)',
            }}
          >
            LlamaRisk
          </span>
          <span className="div" />
          <span className="tag">Aave V4 Explorer</span>
          <div className="meta">
            <span>
              <span className="dot" />
              Live data
            </span>
          </div>
        </header>
        <nav className="app-tabs">
          <button
            className={'app-tab ' + (tab === 'overview' ? 'on' : '')}
            onClick={() => setTab('overview')}
          >
            Overview
          </button>
          <button
            className={'app-tab ' + (tab === 'matrix' ? 'on' : '')}
            onClick={() => setTab('matrix')}
          >
            Topology
          </button>
          <button
            className={'app-tab ' + (tab === 'params' ? 'on' : '')}
            onClick={() => setTab('params')}
          >
            Parameters
          </button>
          <ChainSwitcher />
        </nav>
        {/* Keyed by scope: each view's local selection resets when the
            network changes, so it never points at a hub that left scope. */}
        <div className="tab-body" key={String(scope)}>
          {tab === 'overview' && <Overview onSelectHub={drillIntoHub} />}
          {tab === 'matrix' && <Matrix />}
          {tab === 'params' && <ParamsExplorer initialSelection={paramInitial} />}
        </div>
      </div>
    </ChainScopeContext.Provider>
  );
}
