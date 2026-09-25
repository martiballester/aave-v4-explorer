import { useAaveParams, useChainScope } from '../data';
import { FALLBACK_CHAINS } from '../data/chains';
import type { ChainSummary } from '../data/types';

// Network switcher in the tab bar. Lists every network the registry + AaveKit
// know about; a network whose source failed this load stays listed with a
// warning pip (its hubs are just absent) rather than silently disappearing.
export function ChainSwitcher() {
  const { data } = useAaveParams();
  const { scope, setScope } = useChainScope();

  const chains: Array<Pick<ChainSummary, 'chainId' | 'label' | 'icon' | 'operator' | 'status' | 'error'>> =
    data?.chains ??
    FALLBACK_CHAINS.map((c) => ({ ...c, status: 'ok' as const, error: undefined }));

  return (
    <div className="chain-switch" role="group" aria-label="Network">
      <button
        className={'chain-opt ' + (scope === 'all' ? 'on' : '')}
        onClick={() => setScope('all')}
        aria-pressed={scope === 'all'}
      >
        All networks
      </button>
      {chains.map((c) => {
        const on = scope === c.chainId;
        const title =
          c.status === 'error'
            ? `${c.label}: data failed to load (${c.error ?? 'unknown error'})`
            : c.operator
              ? `${c.label} — white-label deployment operated by ${c.operator}`
              : c.label;
        return (
          <button
            key={c.chainId}
            className={'chain-opt ' + (on ? 'on ' : '') + (c.status === 'error' ? 'err' : '')}
            onClick={() => setScope(c.chainId)}
            aria-pressed={on}
            title={title}
          >
            <ChainIcon src={c.icon} />
            <span>{c.label}</span>
            {c.operator && <span className="chain-op">{c.operator}</span>}
            {c.status === 'error' && <span className="chain-err" aria-label="failed to load">!</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ChainIcon({ src, size = 14 }: { src?: string; size?: number }) {
  return (
    <span className="chain-icon" style={{ width: size, height: size }}>
      {src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
    </span>
  );
}
