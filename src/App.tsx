import { useState } from 'react';
import { Overview } from './ui/OverviewView/Overview';
import { Matrix } from './ui/TopologyView/Matrix';
import { ParamsExplorer, type Selected } from './ui/ParametersView/ParamsExplorer';
import type { HubId } from './data/types';

type Tab = 'overview' | 'matrix' | 'params';

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  // When Overview's hub card is clicked, we jump to Parameters with that hub
  // pre-selected. ParamsExplorer manages its own selection thereafter.
  const [paramInitial, setParamInitial] = useState<Selected | undefined>(undefined);

  const drillIntoHub = (id: HubId) => {
    setParamInitial({ kind: 'hub', id });
    setTab('params');
  };

  return (
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
          <span>Ethereum mainnet</span>
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
      </nav>
      <div className="tab-body">
        {tab === 'overview' && <Overview onSelectHub={drillIntoHub} />}
        {tab === 'matrix' && <Matrix />}
        {tab === 'params' && <ParamsExplorer initialSelection={paramInitial} />}
      </div>
    </div>
  );
}
