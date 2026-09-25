import { useEffect, type ReactNode } from 'react';
import { useAaveParams, useChainScope, type ChainScope } from '../data';
import { FALLBACK_CHAINS } from '../data/chains';
import type { ChainSummary } from '../data/types';

type ChainOption = Pick<
  ChainSummary,
  'chainId' | 'label' | 'icon' | 'operator' | 'status' | 'error' | 'totals'
>;

const fmtUSD = (n: number): string => {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
};

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

// Network bar: one row under the tabs, scoping every view below it. Each
// option shows how much is supplied there, and keys 0–9 jump straight to a
// network (0 = all). A network whose source failed this load stays listed
// with a warning pip (its hubs are just absent) rather than disappearing.
export function ChainSwitcher() {
  const { data } = useAaveParams();
  const { scope, setScope } = useChainScope();

  const chains: ChainOption[] =
    data?.chains ??
    FALLBACK_CHAINS.map((c) => ({
      ...c,
      status: 'ok' as const,
      error: undefined,
      totals: { supplied: 0, borrowed: 0, hubs: 0, spokes: 0, reserves: 0 },
    }));
  const loaded = !!data;
  const allSupplied = chains.reduce((t, c) => t + c.totals.supplied, 0);

  // Keyboard: 0 = all networks, 1..9 = networks in bar order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (!/^[0-9]$/.test(e.key)) return;
      const n = Number(e.key);
      if (n === 0) setScope('all');
      else if (chains[n - 1]) setScope(chains[n - 1].chainId);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chains, setScope]);

  const option = (key: string, s: ChainScope, body: ReactNode, title: string, err = false) => {
    const on = scope === s;
    return (
      <button
        key={key}
        className={'net-opt ' + (on ? 'on ' : '') + (err ? 'err' : '')}
        onClick={() => setScope(s)}
        aria-pressed={on}
        title={title}
      >
        {body}
      </button>
    );
  };

  return (
    <div className="net-bar" role="group" aria-label="Network">
      <span className="net-bar-k lr-eyebrow">Network</span>
      <div className="net-opts">
        {option(
          'all',
          'all',
          <>
            <span className="net-opt-name">All networks</span>
            {loaded && <span className="net-opt-v">{fmtUSD(allSupplied)}</span>}
            <kbd className="net-kbd">0</kbd>
          </>,
          'All networks (key 0)',
        )}
        {chains.map((c, i) => {
          const err = c.status === 'error';
          const title =
            (err
              ? `${c.label}: data failed to load (${c.error ?? 'unknown error'})`
              : c.operator
                ? `${c.label}, white-label deployment operated by ${c.operator}`
                : c.label) + (i < 9 ? ` (key ${i + 1})` : '');
          return option(
            String(c.chainId),
            c.chainId,
            <>
              <ChainIcon src={c.icon} size={18} />
              <span className="net-opt-name">{c.label}</span>
              {c.operator && <span className="chain-op">{c.operator}</span>}
              {err ? (
                <span className="chain-err" aria-label="failed to load">
                  !
                </span>
              ) : (
                loaded && <span className="net-opt-v">{fmtUSD(c.totals.supplied)}</span>
              )}
              {i < 9 && <kbd className="net-kbd">{i + 1}</kbd>}
            </>,
            title,
            err,
          );
        })}
      </div>
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
