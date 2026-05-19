import { useState } from 'react';
import { Matrix } from './ui/TopologyView/Matrix';
import { ParamsExplorer } from './ui/ParametersView/ParamsExplorer';

type Tab = 'matrix' | 'params';

export default function App() {
  const [tab, setTab] = useState<Tab>('matrix');

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
            Live · proposed market structure
          </span>
          <span>Ethereum · v4-RC1</span>
        </div>
      </header>
      <nav className="app-tabs">
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
        {tab === 'matrix' && <Matrix />}
        {tab === 'params' && <ParamsExplorer />}
      </div>
    </div>
  );
}
