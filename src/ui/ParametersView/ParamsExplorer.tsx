import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useAaveParams, useTopology } from '../../data';
import type {
  AaveParams,
  CreditLine,
  Hub,
  HubId,
  Reserve,
  Spoke,
} from '../../data/types';

type Selected =
  | { kind: 'hub'; id: HubId }
  | { kind: 'spoke'; id: string }
  | { kind: 'reserve'; spokeId: string; symbol: string };

export function ParamsExplorer() {
  const { data, isLoading, error } = useAaveParams();
  const topology = useTopology();

  if (isLoading || !data) {
    return (
      <div style={{ padding: 24, color: 'var(--fg-mute)' }}>
        <div className="lr-eyebrow">Parameters</div>
        <p style={{ marginTop: 8 }}>{error ? 'Failed to load — retrying…' : 'Loading…'}</p>
      </div>
    );
  }

  return <ParamsExplorerInner data={data} hubNames={topology.HUB_NAMES} assetMeta={topology.assetMeta} />;
}

interface InnerProps {
  data: AaveParams;
  hubNames: Record<HubId, string>;
  assetMeta: ReturnType<typeof useTopology>['assetMeta'];
}

function ParamsExplorerInner({ data, hubNames, assetMeta }: InnerProps) {
  const { hubs: P_HUBS, spokes: P_SPOKES, creditLines: P_CL, helpers: P_H } = data;
  const P_API = data;
  const P_HUB_NAMES = hubNames;
  const P_META = assetMeta;

  const [selected, setSelected] = useState<Selected>({ kind: 'hub', id: 'core' });
  const [openHubs, setOpenHubs] = useState<Record<string, boolean>>({ core: true, prime: true, plus: true });
  const [openSpokes, setOpenSpokes] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');

  const matches = (s: string) => !query || s.toLowerCase().includes(query.toLowerCase());

  return (
    <div className="pp-root">
      <aside className="pp-side">
        <div className="pp-search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter hubs · spokes · reserves"
          />
          {query && (
            <button className="pp-search-clr" onClick={() => setQuery('')}>
              ✕
            </button>
          )}
        </div>

        <nav className="pp-tree">
          {P_HUBS.map((hub) => {
            const open = openHubs[hub.id];
            const hubSpokes = P_SPOKES.filter((s) => s.hubId === hub.id);
            const hubMatches =
              matches(hub.label) ||
              hubSpokes.some((sp) => matches(sp.name) || sp.reserves.some((r) => matches(r.symbol)));
            if (query && !hubMatches) return null;
            return (
              <div key={hub.id}>
                <button
                  className={'pp-row hub ' + (selected.kind === 'hub' && selected.id === hub.id ? 'on' : '')}
                  onClick={() => {
                    setSelected({ kind: 'hub', id: hub.id });
                    setOpenHubs((s) => ({ ...s, [hub.id]: !s[hub.id] }));
                  }}
                >
                  <Caret open={!!open} />
                  <span className="pp-bullet" style={{ background: hub.color }} />
                  <span className="pp-row-name">{hub.label}</span>
                  <span className="pp-row-meta">{hub.spokes.length}</span>
                </button>
                {open &&
                  hubSpokes.map((sp) => {
                    const sopen = !!openSpokes[sp.id];
                    const spMatches = matches(sp.name) || sp.reserves.some((r) => matches(r.symbol));
                    if (query && !spMatches) return null;
                    return (
                      <div key={sp.id}>
                        <button
                          className={
                            'pp-row spoke ' +
                            (selected.kind === 'spoke' && selected.id === sp.id ? 'on' : '')
                          }
                          onClick={() => {
                            setSelected({ kind: 'spoke', id: sp.id });
                            setOpenSpokes((s) => ({ ...s, [sp.id]: !s[sp.id] }));
                          }}
                        >
                          <Caret open={sopen} />
                          <span className="pp-spoke-mark" />
                          <span className="pp-row-name">{sp.name}</span>
                          <span className="pp-row-meta">{sp.reserves.length}</span>
                        </button>
                        {sopen &&
                          sp.reserves
                            .filter((r) => !query || matches(r.symbol))
                            .map((r) => (
                              <button
                                key={r.symbol}
                                className={
                                  'pp-row reserve ' +
                                  (selected.kind === 'reserve' &&
                                  selected.spokeId === sp.id &&
                                  selected.symbol === r.symbol
                                    ? 'on'
                                    : '')
                                }
                                onClick={() =>
                                  setSelected({ kind: 'reserve', spokeId: sp.id, symbol: r.symbol })
                                }
                              >
                                <AssetGlyph symbol={r.symbol} size={14} meta={P_META} />
                                <span className="pp-row-name">{r.symbol}</span>
                                <ReserveFlags reserve={r} compact />
                              </button>
                            ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </nav>

        <div className="pp-side-foot">
          <div className="lr-eyebrow" style={{ marginBottom: 8 }}>
            SOURCE
          </div>
          <div className="pp-source">
            <span>AaveKit GraphQL</span>
            <span className="pp-source-status">mock</span>
          </div>
          <div className="pp-source">
            <span>RPC fallback</span>
            <span className="pp-source-status">mock</span>
          </div>
        </div>
      </aside>

      <section className="pp-main">
        {selected.kind === 'hub' && (
          <HubDetail
            hub={P_API.getHub(selected.id)!}
            spokes={P_SPOKES}
            creditLines={P_CL}
            helpers={P_H}
            meta={P_META}
            hubNames={P_HUB_NAMES}
            onSelect={setSelected}
          />
        )}
        {selected.kind === 'spoke' && (
          <SpokeDetail
            spoke={P_API.getSpoke(selected.id)!}
            api={P_API}
            meta={P_META}
            onSelect={setSelected}
            hubNames={P_HUB_NAMES}
          />
        )}
        {selected.kind === 'reserve' && (
          <ReserveDetail
            reserve={P_API.getReserve(selected.spokeId, selected.symbol)!}
            spoke={P_API.getSpoke(selected.spokeId)!}
            api={P_API}
            helpers={P_H}
            meta={P_META}
            onSelect={setSelected}
          />
        )}
      </section>
    </div>
  );
}

// ===================================================================
// Atoms
// ===================================================================
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className="pp-caret"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0)' }}
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M9 6l8 6-8 6V6z" />
    </svg>
  );
}

type AssetMeta = ReturnType<typeof useTopology>['assetMeta'];

function AssetGlyph({ symbol, size = 18, meta }: { symbol: string; size?: number; meta: AssetMeta }) {
  const m = meta[symbol] || ({} as { icon?: string; type?: string; color?: string });
  const isCredit = m.type === 'credit';
  const isPt = m.type === 'pt';
  return (
    <span
      className={'pp-glyph ' + (isCredit ? 'credit ' : '') + (isPt ? 'pt ' : '')}
      style={{ width: size, height: size }}
    >
      <img
        src={m.icon}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          if (e.currentTarget.parentElement) {
            e.currentTarget.parentElement.style.background = m.color || '#888';
          }
        }}
      />
    </span>
  );
}

function ReserveFlags({ reserve: r, compact }: { reserve: Reserve; compact?: boolean }) {
  const flags: Array<{ k: string; t: string; cls: string }> = [];
  if (r.paused) flags.push({ k: 'P', t: 'paused', cls: 'alert' });
  if (r.frozen) flags.push({ k: 'F', t: 'frozen', cls: 'warn' });
  if (!r.collateral) flags.push({ k: 'B', t: 'borrow only', cls: 'mute' });
  if (!r.borrowable) flags.push({ k: 'C', t: 'collateral only', cls: 'mute' });
  if (flags.length === 0) return null;
  return (
    <span className="pp-flags">
      {flags.slice(0, compact ? 2 : 5).map((f) => (
        <span key={f.k} className={'pp-flag pp-flag-' + f.cls} title={f.t}>
          {f.k}
        </span>
      ))}
    </span>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="pp-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 900);
        } catch {
          // noop
        }
      }}
      title="Copy"
    >
      {done ? (
        '✓'
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15V5a2 2 0 012-2h10" />
        </svg>
      )}
    </button>
  );
}

function ShortAddr({ addr }: { addr?: string | null }) {
  if (!addr) return <span className="pp-mute">none</span>;
  const s = addr.length > 10 ? addr.slice(0, 6) + '…' + addr.slice(-4) : addr;
  return (
    <span className="pp-addr">
      <code>{s}</code>
      <Copy text={addr} />
    </span>
  );
}

// ===================================================================
// Formatters
// ===================================================================
const fmtUSD = (n: number | null | undefined, d = 2): string => {
  if (n == null) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(d) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(d) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(d) + 'K';
  return '$' + n.toFixed(d);
};
const fmtPct = (n: number | null | undefined, d = 2): string =>
  n == null ? '—' : (n * 100).toFixed(d) + '%';
const fmtBps = (n: number | null | undefined): string =>
  n == null ? '—' : (n * 10000).toFixed(0) + ' BPS';

function capPct(used: number, cap: number): string {
  if (!cap) return '—';
  const p = (used / cap) * 100;
  return p.toFixed(1) + '%';
}

// ===================================================================
// Layout atoms
// ===================================================================
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="pp-section">
      <header className="pp-section-h">
        <div>
          <h3 className="pp-section-t">{title}</h3>
          {hint && <div className="pp-section-hint">{hint}</div>}
        </div>
      </header>
      <div className="pp-section-body">{children}</div>
    </section>
  );
}

function Grid({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <div className="pp-grid" style={{ gridTemplateColumns: `repeat(${cols},1fr)` }}>
      {children}
    </div>
  );
}

function Stat({ n, k, sub }: { n: ReactNode; k: string; sub?: ReactNode }) {
  return (
    <div className="pp-stat">
      <div className="pp-stat-k lr-eyebrow">{k}</div>
      <div className="pp-stat-n pp-mono">{n}</div>
      {sub && <div className="pp-stat-sub">{sub}</div>}
    </div>
  );
}

interface KVProps {
  k: string;
  children: ReactNode;
  className?: string;
  mono?: boolean;
  style?: CSSProperties;
}
function KV({ k, children, className, mono, style }: KVProps) {
  return (
    <div className={'pp-kv ' + (className || '') + (mono ? ' pp-mono' : '')} style={style}>
      <span className="pp-kv-k lr-eyebrow">{k}</span>
      <span className="pp-kv-v">{children}</span>
    </div>
  );
}

function Mini({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="pp-mini">
      <span className="lr-eyebrow">{k}</span>
      <b className="pp-mono">{children}</b>
    </div>
  );
}

// ===================================================================
// Hub detail
// ===================================================================
interface HubDetailProps {
  hub: Hub;
  spokes: Spoke[];
  creditLines: CreditLine[];
  helpers: AaveParams['helpers'];
  meta: AssetMeta;
  hubNames: Record<HubId, string>;
  onSelect: (s: Selected) => void;
}
function HubDetail({ hub, spokes: P_SPOKES, creditLines: P_CL, helpers, meta, hubNames, onSelect }: HubDetailProps) {
  const [openAsset, setOpenAsset] = useState<string | null>(null);
  const sortable = useMemo(
    () => [...hub.assets].sort((a, b) => b.summary.supplied - a.summary.supplied),
    [hub.id, hub.assets],
  );
  const hubSpokes = P_SPOKES.filter((s) => s.hubId === hub.id);
  const inCl = P_CL.filter((c) => c.to === hub.id);
  const outCl = P_CL.filter((c) => c.from === hub.id);

  return (
    <div className="pp-detail">
      <header className="pp-detail-head">
        <div className="pp-crumb">
          <span>Aave V4</span>
          <span className="sep">/</span>
          <span>Hub</span>
        </div>
        <div className="pp-title-row">
          <span className="pp-bullet big" style={{ background: hub.color }} />
          <h1 className="pp-title">{hub.label} hub</h1>
        </div>
        <div className="pp-meta-row">
          <KV k="Address">
            <ShortAddr addr={hub.address} />
          </KV>
          <KV k="Chain">
            {hub.chain.name} · {hub.chain.chainId}
          </KV>
          <KV k="GraphQL ID">
            <code className="pp-id-tag">{hub.gqlId.slice(0, 12)}…</code>
            <Copy text={hub.gqlId} />
          </KV>
        </div>
      </header>

      <Section title="Aggregates" hint="Hub.summary — sum of all assets in this hub">
        <Grid cols={4}>
          <Stat
            n={fmtUSD(hub.summary.totalSupplied)}
            k="Total supplied"
            sub={fmtUSD(hub.summary.totalSupplyCap) + ' cap'}
          />
          <Stat
            n={fmtUSD(hub.summary.totalBorrowed)}
            k="Total borrowed"
            sub={fmtUSD(hub.summary.totalBorrowCap) + ' cap'}
          />
          <Stat n={fmtPct(hub.summary.utilizationRate, 1)} k="Utilization" />
          <Stat n={hub.summary.assetCount} k="Assets listed" sub={hub.summary.spokeCount + ' spokes'} />
        </Grid>
      </Section>

      <Section
        title="Assets"
        hint={`${hub.assets.length} HubAssets · settings + per-asset state (PARAMS.md §A.2)`}
      >
        <div className="pp-table">
          <div className="pp-table-h">
            <div>Asset</div>
            <div className="r">Supplied</div>
            <div className="r">Borrowed</div>
            <div className="r">Util.</div>
            <div className="r">Supply APY</div>
            <div className="r">Borrow APY</div>
            <div className="r">Liq. fee</div>
            <div>IRM</div>
          </div>
          {sortable.map((a) => {
            const isOpen = openAsset === a.symbol;
            return (
              <Fragment key={a.symbol}>
                <button
                  className={'pp-table-r ' + (isOpen ? 'open' : '')}
                  onClick={() => setOpenAsset((o) => (o === a.symbol ? null : a.symbol))}
                >
                  <div className="pp-asset-cell">
                    <AssetGlyph symbol={a.symbol} meta={meta} />
                    <div>
                      <div className="pp-asset-sym">{a.symbol}</div>
                      <div className="pp-asset-sub">{a.decimals} dec</div>
                    </div>
                  </div>
                  <div className="r">
                    <div className="pp-mono">{fmtUSD(a.summary.supplied)}</div>
                    <div className="pp-sub">{capPct(a.summary.supplied, a.summary.addCap)} of cap</div>
                  </div>
                  <div className="r">
                    <div className="pp-mono">{fmtUSD(a.summary.borrowed)}</div>
                    <div className="pp-sub">{capPct(a.summary.borrowed, a.summary.drawCap)} of cap</div>
                  </div>
                  <div className="r pp-mono">{fmtPct(a.summary.utilizationRate, 1)}</div>
                  <div className="r pp-mono">{fmtPct(a.summary.supplyApy, 2)}</div>
                  <div className="r pp-mono">{fmtPct(a.summary.borrowApy, 2)}</div>
                  <div className="r pp-mono">{fmtPct(a.liquidityFee, 1)}</div>
                  <div>
                    <IrmSpark irm={a.irm} util={a.summary.utilizationRate} helpers={helpers} />
                  </div>
                </button>
                {isOpen && <AssetExpanded asset={a} helpers={helpers} />}
              </Fragment>
            );
          })}
        </div>
      </Section>

      <Section title="Spokes" hint={`${hubSpokes.length} spokes drawing on this hub`}>
        <div className="pp-spoke-grid">
          {hubSpokes.map((sp) => {
            const assetSyms = sp.reserves.map((r) => r.symbol);
            return (
              <button
                key={sp.id}
                className="pp-spoke-card"
                onClick={() => onSelect({ kind: 'spoke', id: sp.id })}
              >
                <div className="pp-spoke-card-h">
                  <span className="pp-spoke-mark" />
                  <span className="pp-spoke-card-name">{sp.name}</span>
                </div>
                <div className="pp-spoke-card-assets">
                  {assetSyms.slice(0, 8).map((sym) => (
                    <AssetGlyph key={sym} symbol={sym} size={20} meta={meta} />
                  ))}
                  {assetSyms.length > 8 && (
                    <span className="pp-spoke-card-more">+{assetSyms.length - 8}</span>
                  )}
                </div>
                <div className="pp-spoke-card-body">
                  <KV k="Supplied" className="row">
                    <b className="pp-mono">{fmtUSD(sp.summary.totalSupplied)}</b>
                  </KV>
                  <KV k="Borrowed" className="row">
                    <b className="pp-mono">{fmtUSD(sp.summary.totalBorrowed)}</b>
                  </KV>
                  <KV k="Reserves" className="row">
                    <b className="pp-mono">{sp.summary.uniqueAssets}</b>
                  </KV>
                  <KV k="Target HF" className="row">
                    <b className="pp-mono">{sp.liquidationConfig.targetHF.toFixed(2)}</b>
                  </KV>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {inCl.length + outCl.length > 0 && (
        <Section title="Credit lines" hint="HubSpokeConfig — cross-hub credit flows (PARAMS.md §A.4)">
          <div className="pp-cl-list">
            {inCl.map((cl, i) => (
              <CreditRow key={'i' + i} cl={cl} direction="in" hubNames={hubNames} meta={meta} onSelect={onSelect} />
            ))}
            {outCl.map((cl, i) => (
              <CreditRow key={'o' + i} cl={cl} direction="out" hubNames={hubNames} meta={meta} onSelect={onSelect} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

interface CreditRowProps {
  cl: CreditLine;
  direction: 'in' | 'out';
  hubNames: Record<HubId, string>;
  meta: AssetMeta;
  onSelect: (s: Selected) => void;
}
function CreditRow({ cl, direction, hubNames, meta, onSelect }: CreditRowProps) {
  const [open, setOpen] = useState(false);
  const totalDrawCap = cl.assets.reduce((s, a) => s + (cl.capByAsset[a]?.drawCap || 0), 0);
  return (
    <div className={'pp-cl-row ' + direction + (open ? ' open' : '')}>
      <button className="pp-cl-row-h" onClick={() => setOpen((o) => !o)}>
        <span className="pp-cl-arrow">{direction === 'in' ? '↳' : '↦'}</span>
        <span className="pp-cl-route">
          <b style={{ color: 'var(--hub-' + cl.from + ')' }}>{hubNames[cl.from]}</b>
          <span className="pp-mute">→</span>
          <b style={{ color: 'var(--hub-' + cl.to + ')' }}>{hubNames[cl.to]}</b>
          <span className="pp-mute">/</span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ kind: 'spoke', id: cl.toSpoke });
            }}
            className="pp-cl-spoke"
          >
            {cl.toSpoke.replace(cl.to + '-', '')}
          </span>
        </span>
        <span className="pp-cl-chips">
          {cl.assets.map((a) => (
            <span key={a} className="pp-cl-chip">
              {a}
            </span>
          ))}
        </span>
        <span className="pp-cl-caps lr-eyebrow">
          {cl.assets.length} assets · {fmtUSD(totalDrawCap)} draw cap
        </span>
        <Caret open={open} />
      </button>
      {open && (
        <div className="pp-cl-detail">
          <div className="pp-cl-meta">
            <KV k="Premium share threshold">
              <b className="pp-mono">{fmtPct(cl.riskPremiumThreshold, 0)}</b>
            </KV>
            <span className="pp-cl-meta-hint">
              Max ratio of premium shares to drawn shares for this credit line. Above this, new draws on the
              credit line revert.
            </span>
          </div>
          <div className="pp-cl-cap-table">
            <div className="pp-cl-cap-head">
              <div>Asset</div>
              <div className="r">Add cap</div>
              <div className="r">Supplied</div>
              <div className="r">Used</div>
              <div className="r">Draw cap</div>
              <div className="r">Borrowed</div>
              <div className="r">Used</div>
            </div>
            {cl.assets.map((a) => {
              const cap = cl.capByAsset[a] || { addCap: 0, drawCap: 0, supplied: 0, borrowed: 0 };
              return (
                <div className="pp-cl-cap-row" key={a}>
                  <div className="pp-cl-cap-asset">
                    <AssetGlyph symbol={a} size={16} meta={meta} />
                    <span>{a}</span>
                  </div>
                  <div className="r pp-mono">{fmtUSD(cap.addCap)}</div>
                  <div className="r pp-mono">{fmtUSD(cap.supplied)}</div>
                  <div className="r pp-mono">{capPct(cap.supplied, cap.addCap)}</div>
                  <div className="r pp-mono">{fmtUSD(cap.drawCap)}</div>
                  <div className="r pp-mono">{fmtUSD(cap.borrowed)}</div>
                  <div className="r pp-mono">{capPct(cap.borrowed, cap.drawCap)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AssetExpanded({ asset, helpers }: { asset: Hub['assets'][number]; helpers: AaveParams['helpers'] }) {
  return (
    <div className="pp-asset-expanded">
      <div className="pp-aex-left">
        <div className="lr-eyebrow" style={{ marginBottom: 8 }}>
          Interest rate model
        </div>
        <IrmCurve irm={asset.irm} util={asset.summary.utilizationRate} helpers={helpers} />
        <div className="pp-irm-params">
          <Mini k="Base">{fmtPct(asset.irm?.base, 1)}</Mini>
          <Mini k="Slope ▲opt">{fmtPct(asset.irm?.slope1, 1)}</Mini>
          <Mini k="Slope ▼opt">{fmtPct(asset.irm?.slope2, 0)}</Mini>
          <Mini k="Optimal U">{fmtPct(asset.irm?.optimal, 0)}</Mini>
        </div>
      </div>
      <div className="pp-aex-right">
        <div className="lr-eyebrow" style={{ marginBottom: 8 }}>
          Settings
        </div>
        <KV k="Underlying">
          <ShortAddr addr={asset.underlying} />
        </KV>
        <KV k="IR strategy">
          <ShortAddr addr={asset.irStrategy} />
        </KV>
        <KV k="Fee receiver">
          <ShortAddr addr={asset.feeReceiver} />
        </KV>
        <KV k="Reinvestment">
          {asset.reinvestmentController ? <ShortAddr addr={asset.reinvestmentController} /> : <span className="pp-mute">none</span>}
        </KV>
        <KV k="Liquidity fee">
          <b className="pp-mono">{fmtPct(asset.liquidityFee, 1)}</b>
        </KV>
        <KV k="Add cap">
          <b className="pp-mono">{fmtUSD(asset.summary.addCap)}</b>
        </KV>
        <KV k="Draw cap">
          <b className="pp-mono">{fmtUSD(asset.summary.drawCap)}</b>
        </KV>
      </div>
    </div>
  );
}

// ===================================================================
// Spoke detail
// ===================================================================
interface SpokeDetailProps {
  spoke: Spoke;
  api: AaveParams;
  meta: AssetMeta;
  onSelect: (s: Selected) => void;
  hubNames: Record<HubId, string>;
}
function SpokeDetail({ spoke, api, meta, onSelect, hubNames }: SpokeDetailProps) {
  const hub = api.getHub(spoke.hubId)!;
  const credits = api.creditLinesForSpoke(spoke.id);
  return (
    <div className="pp-detail">
      <header className="pp-detail-head">
        <div className="pp-crumb">
          <span>Aave V4</span>
          <span className="sep">/</span>
          <button
            className="pp-crumb-link"
            onClick={() => onSelect({ kind: 'hub', id: hub.id })}
            style={{ color: hub.color }}
          >
            {hub.label}
          </button>
          <span className="sep">/</span>
          <span>Spoke</span>
        </div>
        <div className="pp-title-row">
          <span className="pp-spoke-mark big" />
          <h1 className="pp-title">{spoke.name}</h1>
        </div>
        <div className="pp-meta-row">
          <KV k="Address">
            <ShortAddr addr={spoke.address} />
          </KV>
          <KV k="Parent hub" style={{ color: hub.color }}>
            {hub.label}
          </KV>
          <KV k="Oracle">
            <ShortAddr addr={spoke.summary.oracle} />
          </KV>
          <KV k="Max user reserves">
            <b className="pp-mono">{spoke.summary.maxUserReservesLimit}</b>
          </KV>
        </div>
      </header>

      <Section title="Aggregates" hint="Spoke.summary (PARAMS.md §B.1)">
        <Grid cols={4}>
          <Stat n={fmtUSD(spoke.summary.totalSupplied)} k="Supplied" />
          <Stat n={fmtUSD(spoke.summary.totalBorrowed)} k="Borrowed" />
          <Stat n={fmtPct(spoke.summary.utilizationRate, 1)} k="Utilization" />
          <Stat n={spoke.summary.uniqueAssets} k="Reserves" />
        </Grid>
      </Section>

      <Section
        title="Liquidation engine"
        hint="One LiquidationConfig per Spoke (PARAMS.md §B.2 — Dutch auction)"
      >
        <div className="pp-liq">
          <div className="pp-liq-params">
            <Stat n={spoke.liquidationConfig.targetHF.toFixed(2)} k="Target HF" sub="post-liquidation" />
            <Stat
              n={spoke.liquidationConfig.hfForMaxBonus.toFixed(2)}
              k="HF @ max bonus"
              sub="auction saturates"
            />
            <Stat
              n={fmtPct(spoke.liquidationConfig.liqBonusFactor, 0)}
              k="Min-bonus factor"
              sub="× (maxLB − 100%)"
            />
          </div>
          <DutchAuction config={spoke.liquidationConfig} />
        </div>
      </Section>

      <Section title="Reserves" hint={`${spoke.reserves.length} reserves · per-reserve risk + dynamic config`}>
        <div className="pp-table reserves">
          <div className="pp-table-h">
            <div>Reserve</div>
            <div className="r">CF</div>
            <div className="r">Max LB</div>
            <div className="r">Liq. fee</div>
            <div className="r">Coll. risk</div>
            <div className="r">Supplied</div>
            <div className="r">Borrowed</div>
            <div>Flags</div>
          </div>
          {spoke.reserves.map((r) => (
            <button
              key={r.symbol}
              className="pp-table-r"
              onClick={() => onSelect({ kind: 'reserve', spokeId: spoke.id, symbol: r.symbol })}
            >
              <div className="pp-asset-cell">
                <AssetGlyph symbol={r.symbol} meta={meta} />
                <div>
                  <div className="pp-asset-sym">{r.symbol}</div>
                  <div className="pp-asset-sub">key #{r.dynamicConfigKey}</div>
                </div>
              </div>
              <div className="r pp-mono">{fmtPct(r.collateralFactor, 0)}</div>
              <div className="r pp-mono">{fmtPct(r.maxLiquidationBonus, 1)}</div>
              <div className="r pp-mono">{fmtPct(r.liquidationFee, 0)}</div>
              <div className="r pp-mono">{fmtBps(r.collateralRisk)}</div>
              <div className="r">
                <div className="pp-mono">{fmtUSD(r.suppliedAmount)}</div>
                <div className="pp-sub">
                  {capPct(r.suppliedAmount, r.supplyCap)} of {fmtUSD(r.supplyCap)}
                </div>
              </div>
              <div className="r">
                <div className="pp-mono">{r.borrowable ? fmtUSD(r.borrowedAmount) : '—'}</div>
                {r.borrowable && (
                  <div className="pp-sub">
                    {capPct(r.borrowedAmount, r.borrowCap)} of {fmtUSD(r.borrowCap)}
                  </div>
                )}
              </div>
              <div>
                <ReserveFlags reserve={r} />
              </div>
            </button>
          ))}
        </div>
      </Section>

      {credits.length > 0 && (
        <Section title="Incoming credit lines" hint="HubSpokeConfig — credit assets routed to this spoke">
          <div className="pp-cl-list">
            {credits.map((cl, i) => (
              <CreditRow key={i} cl={cl} direction="in" hubNames={hubNames} meta={meta} onSelect={onSelect} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ===================================================================
// Reserve detail
// ===================================================================
interface ReserveDetailProps {
  reserve: Reserve;
  spoke: Spoke;
  api: AaveParams;
  helpers: AaveParams['helpers'];
  meta: AssetMeta;
  onSelect: (s: Selected) => void;
}
function ReserveDetail({ reserve: r, spoke, api, helpers, meta, onSelect }: ReserveDetailProps) {
  const hub = api.getHub(spoke.hubId)!;
  const hubAsset = hub.assets.find((a) => a.symbol === r.symbol);
  return (
    <div className="pp-detail">
      <header className="pp-detail-head">
        <div className="pp-crumb">
          <span>Aave V4</span>
          <span className="sep">/</span>
          <button
            className="pp-crumb-link"
            onClick={() => onSelect({ kind: 'hub', id: hub.id })}
            style={{ color: hub.color }}
          >
            {hub.label}
          </button>
          <span className="sep">/</span>
          <button className="pp-crumb-link" onClick={() => onSelect({ kind: 'spoke', id: spoke.id })}>
            {spoke.name}
          </button>
          <span className="sep">/</span>
          <span>Reserve</span>
        </div>
        <div className="pp-title-row">
          <AssetGlyph symbol={r.symbol} size={28} meta={meta} />
          <h1 className="pp-title">{r.symbol}</h1>
          <ReserveFlags reserve={r} />
        </div>
        <div className="pp-meta-row">
          <KV k="Underlying">
            <ShortAddr addr={r.underlying} />
          </KV>
          <KV k="Hub">
            <ShortAddr addr={r.hubAddress} />
          </KV>
          <KV k="Decimals">
            <b className="pp-mono">{r.decimals}</b>
          </KV>
          <KV k="Asset ID">
            <b className="pp-mono">#{r.assetId}</b>
          </KV>
        </div>
      </header>

      <Section title="State">
        <Grid cols={4}>
          <Stat
            n={fmtUSD(r.suppliedAmount)}
            k="Supplied"
            sub={capPct(r.suppliedAmount, r.supplyCap) + ' of cap'}
          />
          <Stat
            n={r.borrowable ? fmtUSD(r.borrowedAmount) : '—'}
            k="Borrowed"
            sub={r.borrowable ? capPct(r.borrowedAmount, r.borrowCap) + ' of cap' : 'not borrowable'}
          />
          <Stat n={fmtPct(r.supplyApy, 2)} k="Supply APY" />
          <Stat n={r.borrowable ? fmtPct(r.borrowApy, 2) : '—'} k="Borrow APY" />
        </Grid>
      </Section>

      <Section
        title="Dynamic reserve config"
        hint="Latest key — versioned. Existing positions on older keys retain their original CF / maxLB / fee (PARAMS.md §B.4)"
      >
        <Grid cols={4}>
          <Stat n={fmtPct(r.collateralFactor, 0)} k="Collateral factor (CF)" sub="single value, no LTV-LT gap" />
          <Stat
            n={fmtPct(r.maxLiquidationBonus, 1)}
            k="Max liquidation bonus"
            sub="encoded as PERCENTAGE_FACTOR + bonus"
          />
          <Stat n={fmtPct(r.liquidationFee, 0)} k="Liquidation fee" sub="protocol's slice" />
          <Stat n={fmtBps(r.collateralRisk)} k="Collateral risk" sub="feeds risk premium" />
        </Grid>
      </Section>

      <Section title="Static reserve config" hint="Non-versioned subset (PARAMS.md §B.3)">
        <div className="pp-table compact">
          <KV k="Borrowable" mono>
            {r.borrowable ? 'true' : 'false'}
          </KV>
          <KV k="Collateral" mono>
            {r.collateral ? 'true' : 'false'}
          </KV>
          <KV k="Paused" mono>
            {r.paused ? 'true' : 'false'}
          </KV>
          <KV k="Frozen" mono>
            {r.frozen ? 'true' : 'false'}
          </KV>
          <KV k="Receive shares enabled" mono>
            {r.receiveSharesEnabled ? 'true' : 'false'}
          </KV>
          <KV k="Dynamic config key" mono>
            #{r.dynamicConfigKey}
          </KV>
          <KV k="Hub asset ID" mono>
            #{r.assetId}
          </KV>
        </div>
      </Section>

      <Section
        title="Oracle"
        hint="Per-reserve price feed bound through Spoke.ORACLE() (PARAMS.md §B.5 — RPC-only)"
      >
        <Grid cols={3}>
          <Stat
            n={r.oracle.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            k={r.oracle.description}
            sub={r.oracle.decimals + ' decimals'}
          />
          <KV k="Price feed">
            <ShortAddr addr={r.oracle.source} />
          </KV>
          <KV k="Spoke oracle">
            <ShortAddr addr={spoke.summary.oracle} />
          </KV>
        </Grid>
      </Section>

      {hubAsset && hubAsset.irm && (
        <Section
          title="Hub-level IRM"
          hint="Curve set at the Hub asset level (PARAMS.md §A.3). All Spokes sharing this asset share this curve."
        >
          <div className="pp-irm-full">
            <IrmCurve
              irm={hubAsset.irm}
              util={r.suppliedAmount > 0 ? r.borrowedAmount / r.suppliedAmount : 0}
              helpers={helpers}
              large
            />
            <div className="pp-irm-params">
              <Mini k="Base">{fmtPct(hubAsset.irm.base, 1)}</Mini>
              <Mini k="Slope ▲opt">{fmtPct(hubAsset.irm.slope1, 1)}</Mini>
              <Mini k="Slope ▼opt">{fmtPct(hubAsset.irm.slope2, 0)}</Mini>
              <Mini k="Optimal U">{fmtPct(hubAsset.irm.optimal, 0)}</Mini>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

// ===================================================================
// Charts
// ===================================================================
import type { IRM } from '../../data/types';

function IrmSpark({
  irm,
  util,
  helpers,
}: {
  irm: IRM | null;
  util: number;
  helpers: AaveParams['helpers'];
}) {
  if (!irm) return <span className="pp-mute">—</span>;
  const W = 90;
  const H = 26;
  const pts = helpers.sampleIrmCurve(irm, 30);
  const max = Math.max(...pts.map((p) => p.borrow), 1e-9);
  const d = pts
    .map(
      (p, i) =>
        (i === 0 ? 'M' : 'L') +
        (p.u * W).toFixed(1) +
        ',' +
        (H - (p.borrow / max) * (H - 2) - 1).toFixed(1),
    )
    .join(' ');
  const ux = util * W;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <path d={d} fill="none" stroke="var(--fg)" strokeWidth="1" opacity="0.5" />
      <line x1={ux} x2={ux} y1="0" y2={H} stroke="#6FB7AE" strokeWidth="1" strokeDasharray="2 2" />
      <line
        x1={irm.optimal * W}
        x2={irm.optimal * W}
        y1="0"
        y2={H}
        stroke="var(--fg-mute)"
        strokeWidth="0.5"
        strokeDasharray="1 2"
      />
    </svg>
  );
}

function IrmCurve({
  irm,
  util,
  helpers,
  large,
}: {
  irm: IRM | null;
  util: number;
  helpers: AaveParams['helpers'];
  large?: boolean;
}) {
  if (!irm) return null;
  const W = large ? 560 : 380;
  const H = large ? 200 : 130;
  const padL = 32;
  const padR = 8;
  const padT = 8;
  const padB = 22;
  const cw = W - padL - padR;
  const ch = H - padT - padB;
  const pts = helpers.sampleIrmCurve(irm, 80);
  const max = Math.max(...pts.map((p) => p.borrow), 1e-9);
  const yScale = (v: number) => padT + ch - (v / max) * ch;
  const xScale = (u: number) => padL + u * cw;
  const dB = pts.map((p, i) => (i === 0 ? 'M' : 'L') + xScale(p.u).toFixed(1) + ',' + yScale(p.borrow).toFixed(1)).join(' ');
  const dS = pts.map((p, i) => (i === 0 ? 'M' : 'L') + xScale(p.u).toFixed(1) + ',' + yScale(p.supply).toFixed(1)).join(' ');
  const curBorrow = helpers.evalBorrowRate(irm, util) ?? 0;
  const curSupply = curBorrow * util;
  return (
    <svg className="pp-irm-svg" width="100%" viewBox={`0 0 ${W} ${H}`}>
      {[0.25, 0.5, 0.75].map((u) => (
        <line
          key={u}
          x1={xScale(u)}
          x2={xScale(u)}
          y1={padT}
          y2={padT + ch}
          stroke="var(--line-soft)"
          strokeWidth="0.5"
        />
      ))}
      <line x1={padL} y1={padT + ch} x2={padL + cw} y2={padT + ch} stroke="var(--line)" strokeWidth="0.5" />
      <line
        x1={xScale(irm.optimal)}
        x2={xScale(irm.optimal)}
        y1={padT}
        y2={padT + ch}
        stroke="var(--fg-mute)"
        strokeWidth="0.75"
        strokeDasharray="2 3"
      />
      <text
        x={xScale(irm.optimal) + 4}
        y={padT + 10}
        fill="var(--fg-mute)"
        fontFamily="var(--font-mono)"
        fontSize="9"
      >
        U*={(irm.optimal * 100).toFixed(0)}%
      </text>
      <path d={dS} fill="none" stroke="#6FB7AE" strokeWidth="1.5" opacity="0.7" />
      <path d={dB} fill="none" stroke="var(--credit)" strokeWidth="1.75" />
      <circle cx={xScale(util)} cy={yScale(curBorrow)} r="3.5" fill="var(--credit)" stroke="var(--bg)" strokeWidth="1.5" />
      <circle cx={xScale(util)} cy={yScale(curSupply)} r="3.5" fill="#6FB7AE" stroke="var(--bg)" strokeWidth="1.5" />
      <text x={padL - 6} y={yScale(max) + 3} textAnchor="end" fill="var(--fg-mute)" fontFamily="var(--font-mono)" fontSize="9">
        {(max * 100).toFixed(0)}%
      </text>
      <text x={padL - 6} y={yScale(0) + 3} textAnchor="end" fill="var(--fg-mute)" fontFamily="var(--font-mono)" fontSize="9">
        0%
      </text>
      {[0, 0.25, 0.5, 0.75, 1].map((u) => (
        <text
          key={u}
          x={xScale(u)}
          y={padT + ch + 13}
          textAnchor="middle"
          fill="var(--fg-mute)"
          fontFamily="var(--font-mono)"
          fontSize="9"
        >
          {((u * 100) | 0)}%
        </text>
      ))}
      <g transform={`translate(${padL + 8} ${padT + 4})`}>
        <rect x="0" y="0" width="2" height="8" fill="var(--credit)" />
        <text x="6" y="7" fill="var(--fg-soft)" fontFamily="var(--font-mono)" fontSize="9">
          Borrow
        </text>
        <rect x="56" y="0" width="2" height="8" fill="#6FB7AE" />
        <text x="62" y="7" fill="var(--fg-soft)" fontFamily="var(--font-mono)" fontSize="9">
          Supply
        </text>
      </g>
    </svg>
  );
}

function DutchAuction({ config }: { config: Spoke['liquidationConfig'] }) {
  const maxLB = 0.08;
  const minLB = maxLB * config.liqBonusFactor;
  const W = 380;
  const H = 130;
  const padL = 32;
  const padR = 8;
  const padT = 8;
  const padB = 24;
  const cw = W - padL - padR;
  const ch = H - padT - padB;
  const xScale = (hf: number) => padL + ((1.0 - hf) / (1.0 - config.hfForMaxBonus + 0.05)) * cw;
  const yScale = (lb: number) => padT + ch - (lb / maxLB) * ch;
  const xs: Array<{ hf: number; lb: number }> = [];
  for (let i = 0; i <= 80; i++) {
    const hf = 1.0 - (i / 80) * (1.0 - config.hfForMaxBonus + 0.05);
    let lb: number;
    if (hf >= 1.0) lb = 0;
    else if (hf <= config.hfForMaxBonus) lb = maxLB;
    else lb = minLB + (maxLB - minLB) * (1.0 - hf) / (1.0 - config.hfForMaxBonus);
    xs.push({ hf, lb });
  }
  const d = xs.map((p, i) => (i === 0 ? 'M' : 'L') + xScale(p.hf).toFixed(1) + ',' + yScale(p.lb).toFixed(1)).join(' ');
  return (
    <svg className="pp-dutch" width="100%" viewBox={`0 0 ${W} ${H}`}>
      <line x1={padL} y1={padT + ch} x2={padL + cw} y2={padT + ch} stroke="var(--line)" strokeWidth="0.5" />
      <line
        x1={xScale(1.0)}
        x2={xScale(1.0)}
        y1={padT}
        y2={padT + ch}
        stroke="var(--fg-mute)"
        strokeWidth="0.75"
        strokeDasharray="2 3"
      />
      <text x={xScale(1.0) + 4} y={padT + 10} fill="var(--fg-mute)" fontFamily="var(--font-mono)" fontSize="9">
        HF=1.00
      </text>
      <line
        x1={xScale(config.hfForMaxBonus)}
        x2={xScale(config.hfForMaxBonus)}
        y1={padT}
        y2={padT + ch}
        stroke="#6FB7AE"
        strokeWidth="0.75"
        strokeDasharray="2 3"
      />
      <text
        x={xScale(config.hfForMaxBonus) + 4}
        y={padT + 22}
        fill="#6FB7AE"
        fontFamily="var(--font-mono)"
        fontSize="9"
      >
        HF={config.hfForMaxBonus.toFixed(2)}
      </text>
      <path d={d} fill="none" stroke="var(--credit)" strokeWidth="2" />
      <text x={padL - 6} y={yScale(maxLB) + 3} textAnchor="end" fill="var(--fg-mute)" fontFamily="var(--font-mono)" fontSize="9">
        {(maxLB * 100).toFixed(0)}%
      </text>
      <text x={padL - 6} y={yScale(minLB) + 3} textAnchor="end" fill="var(--fg-mute)" fontFamily="var(--font-mono)" fontSize="9">
        {(minLB * 100).toFixed(1)}%
      </text>
      <text x={padL - 6} y={yScale(0) + 3} textAnchor="end" fill="var(--fg-mute)" fontFamily="var(--font-mono)" fontSize="9">
        0%
      </text>
      <text x={W / 2} y={H - 4} textAnchor="middle" fill="var(--fg-mute)" fontFamily="var(--font-mono)" fontSize="9">
        Health factor (right → left = unhealthier)
      </text>
    </svg>
  );
}
