import { Fragment, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useScopedParams, useTopology } from '../../data';
import type {
  AaveParams,
  AssetMetadata,
  CreditLine,
  Hub,
  HubId,
  Reserve,
  Spoke,
} from '../../data/types';
import { AssetGlyph } from '../AssetGlyph';
import { ChainIcon } from '../ChainSwitcher';

export type Selected =
  | { kind: 'hub'; id: HubId }
  | { kind: 'spoke'; id: string }
  | { kind: 'reserve'; spokeId: string; symbol: string };

export function ParamsExplorer({ initialSelection }: { initialSelection?: Selected } = {}) {
  const { data, isLoading, isFetching, error, dataUpdatedAt, refetch } = useScopedParams();
  const topology = useTopology();

  if (isLoading || !data) {
    return (
      <div style={{ padding: 24, color: 'var(--fg-mute)' }}>
        <div className="lr-eyebrow">Parameters</div>
        <p style={{ marginTop: 8 }}>{error ? 'Failed to load — retrying…' : 'Loading…'}</p>
      </div>
    );
  }

  return (
    <ParamsExplorerInner
      data={data}
      hubNames={topology.HUB_NAMES}
      assetMeta={data.assetMeta}
      dataUpdatedAt={dataUpdatedAt}
      isFetching={isFetching}
      onRefresh={() => refetch()}
      initialSelection={initialSelection}
    />
  );
}

interface InnerProps {
  data: AaveParams;
  hubNames: Record<HubId, string>;
  assetMeta: AssetMeta;
  dataUpdatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
  initialSelection?: Selected;
}

function ParamsExplorerInner({ data, hubNames, assetMeta, dataUpdatedAt, isFetching, onRefresh, initialSelection }: InnerProps) {
  const { hubs: P_HUBS, spokes: P_SPOKES, creditLines: P_CL, helpers: P_H } = data;
  // RPC layer is live if at least one spoke has a non-zero ORACLE() address —
  // multicall succeeded. If all are zero, the fallback chain failed and we
  // show "fallback" instead.
  const ZERO = '0x0000000000000000000000000000000000000000';
  const rpcLive = data.spokes.some((s) => s.summary.oracle && s.summary.oracle !== ZERO);
  const P_API = data;
  const P_HUB_NAMES = hubNames;
  const P_META = assetMeta;

  const [selected, setSelected] = useState<Selected>(
    initialSelection ?? { kind: 'hub', id: P_HUBS[0]?.id ?? '' },
  );
  // Group the tree by network only when more than one is in scope.
  const chainGroups = useMemo(() => {
    const groups: Array<{ chainId: number; label: string; icon: string; hubs: Hub[] }> = [];
    for (const h of P_HUBS) {
      let g = groups.find((x) => x.chainId === h.chain.chainId);
      if (!g) {
        g = { chainId: h.chain.chainId, label: h.chain.name, icon: h.chain.icon, hubs: [] };
        groups.push(g);
      }
      g.hubs.push(h);
    }
    return groups;
  }, [P_HUBS]);
  const showChainHeaders = chainGroups.length > 1;
  const selHub = selected.kind === 'hub' ? P_API.getHub(selected.id) : undefined;
  const selSpoke = selected.kind !== 'hub' ? P_API.getSpoke(selected.kind === 'spoke' ? selected.id : selected.spokeId) : undefined;
  const selReserve =
    selected.kind === 'reserve' ? P_API.getReserve(selected.spokeId, selected.symbol) : undefined;
  const [openHubs, setOpenHubs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(P_HUBS.map((h) => [h.id, true])),
  );
  const [openSpokes, setOpenSpokes] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');

  const matches = (s: string) => !query || s.toLowerCase().includes(query.toLowerCase());

  return (
    <div
      className="pp-root"
      // Expose each hub's color as a CSS var so credit-line routes (which read
      // `var(--hub-{id})`) resolve for any hub, including auto-discovered ones.
      style={Object.fromEntries(P_HUBS.map((h) => ['--hub-' + h.id, h.color])) as CSSProperties}
    >
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
          {chainGroups.map((group) => (
          <Fragment key={group.chainId}>
          {showChainHeaders && (!query || group.hubs.some((h) => matches(h.label) || P_SPOKES.some((sp) => sp.hubId === h.id && (matches(sp.name) || sp.reserves.some((r) => matches(r.symbol)))))) && (
            <div className="pp-chain-head">
              <ChainIcon src={group.icon} size={13} />
              <span>{group.label}</span>
            </div>
          )}
          {group.hubs.map((hub) => {
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
          </Fragment>
          ))}
        </nav>

        <div className="pp-side-foot">
          <div className="lr-eyebrow" style={{ marginBottom: 8 }}>
            SOURCE
          </div>
          <div className="pp-source">
            <span>AaveKit GraphQL</span>
            <span className={'pp-source-status ' + (isFetching ? 'fetching' : 'live')}>
              {isFetching ? 'fetching' : 'live'}
            </span>
          </div>
          <div className="pp-source">
            <span>RPC reads</span>
            <span className={'pp-source-status ' + (rpcLive ? 'live' : '')}>
              {rpcLive ? 'live' : 'fallback'}
            </span>
          </div>
          <div className="pp-refresh-row">
            <span>
              Fetched{' '}
              {new Date(dataUpdatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
            <button className="pp-refresh-btn" onClick={onRefresh} disabled={isFetching}>
              {isFetching ? '…' : 'refresh'}
            </button>
          </div>
        </div>
      </aside>

      <section className="pp-main">
        {!selHub && !selSpoke && (
          <div className="pp-detail pp-mute">Select a hub, spoke or reserve.</div>
        )}
        {selected.kind === 'hub' && selHub && (
          <HubDetail
            hub={selHub}
            spokes={P_SPOKES}
            creditLines={P_CL}
            helpers={P_H}
            meta={P_META}
            hubNames={P_HUB_NAMES}
            onSelect={setSelected}
          />
        )}
        {selected.kind === 'spoke' && selSpoke && (
          <SpokeDetail
            spoke={selSpoke}
            api={P_API}
            meta={P_META}
            onSelect={setSelected}
            hubNames={P_HUB_NAMES}
          />
        )}
        {selected.kind === 'reserve' && selSpoke && selReserve && (
          <ReserveDetail
            reserve={selReserve}
            spoke={selSpoke}
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

type AssetMeta = Record<string, AssetMetadata>;

function ReserveFlags({ reserve: r, compact }: { reserve: Reserve; compact?: boolean }) {
  const flags: Array<{ k: string; t: string; cls: string }> = [];
  if (r.paused) flags.push({ k: 'P', t: 'paused', cls: 'alert' });
  if (r.frozen) flags.push({ k: 'F', t: 'frozen', cls: 'warn' });
  if (!r.collateral) flags.push({ k: 'B', t: 'borrow only', cls: 'mute' });
  if (!r.borrowable) flags.push({ k: 'C', t: 'collateral only', cls: 'mute' });
  // Dual-purpose reserves (both collateral AND borrowable, healthy) — no
  // restriction flags apply. Render a faint "both" pip so the column looks
  // consistent with neighboring rows instead of empty (which reads as
  // missing data).
  if (flags.length === 0) {
    if (compact) return null;
    return (
      <span className="pp-flags">
        <span className="pp-flag pp-flag-mute" title="collateral & borrowable">
          ↔
        </span>
      </span>
    );
  }
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
// Health factors: at least 2 decimals, up to 3 when they matter (1.019).
const fmtHf = (n: number): string => {
  const s = n.toFixed(3);
  return s.endsWith('0') ? n.toFixed(2) : s;
};
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
          <span>{hub.chain.name}</span>
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
            <span className="pp-chain-kv">
              <ChainIcon src={hub.chain.icon} size={12} />
              {hub.chain.name} · {hub.chain.chainId}
            </span>
          </KV>
          <KV k="GraphQL ID">
            <code className="pp-id-tag">{hub.gqlId.slice(0, 12)}…</code>
            <Copy text={hub.gqlId} />
          </KV>
        </div>
      </header>

      <Section title="Aggregates" hint="Totals across every asset listed on this hub">
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
        hint={`${hub.assets.length} assets listed · settings, caps, and live state`}
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
        <Section title="Credit lines" hint="Assets a spoke can borrow from a hub other than its parent — cross-hub credit flows">
          <div className="pp-cl-list">
            {inCl.map((cl, i) => (
              <CreditRow key={'i' + i} cl={cl} spokeName={P_SPOKES.find((s) => s.id === cl.toSpoke)?.name ?? cl.toSpoke} direction="in" hubNames={hubNames} meta={meta} onSelect={onSelect} />
            ))}
            {outCl.map((cl, i) => (
              <CreditRow key={'o' + i} cl={cl} spokeName={P_SPOKES.find((s) => s.id === cl.toSpoke)?.name ?? cl.toSpoke} direction="out" hubNames={hubNames} meta={meta} onSelect={onSelect} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

interface CreditRowProps {
  cl: CreditLine;
  spokeName: string;
  direction: 'in' | 'out';
  hubNames: Record<HubId, string>;
  meta: AssetMeta;
  onSelect: (s: Selected) => void;
}
function CreditRow({ cl, spokeName, direction, hubNames, meta, onSelect }: CreditRowProps) {
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
            {spokeName}
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
              <b className="pp-mono">
                {fmtPct(cl.riskPremiumThreshold, 0)}
                {cl.riskPremiumThreshold === 0 && (
                  <span className="pp-mute" style={{ marginLeft: 6, fontSize: 10 }}>
                    (premium-free debt only)
                  </span>
                )}
              </b>
            </KV>
            <span className="pp-cl-meta-hint">
              Max ratio of premium shares to drawn shares for this credit line. Above this, new draws
              revert.
              {cl.riskPremiumThreshold === 0 && (
                <>
                  {' '}
                  At 0, any change that would leave the spoke holding premium debt on this line
                  reverts; premium only accrues on positions backed by collateral with a
                  collateral risk above 0 BPS.
                </>
              )}
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
          <span>{hub.chain.name}</span>
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

      <Section title="Aggregates" hint="Totals across every reserve in this spoke">
        <Grid cols={4}>
          <Stat n={fmtUSD(spoke.summary.totalSupplied)} k="Supplied" />
          <Stat n={fmtUSD(spoke.summary.totalBorrowed)} k="Borrowed" />
          <Stat n={fmtPct(spoke.summary.utilizationRate, 1)} k="Utilization" />
          <Stat n={spoke.summary.uniqueAssets} k="Reserves" />
        </Grid>
      </Section>

      <Section
        title="Liquidation engine"
        hint="Dutch-auction profile shared by every reserve in this spoke (replaces V3's fixed close factor and bonus). The bonus a liquidator earns grows as the position's health factor falls, from the minimum just below HF 1 to the reserve's max bonus at the saturation HF."
      >
        <div className="pp-liq">
          <div className="pp-liq-params">
            <Stat n={fmtHf(spoke.liquidationConfig.targetHF)} k="Target HF" sub="restored after liquidation" />
            <Stat
              n={fmtHf(spoke.liquidationConfig.hfForMaxBonus)}
              k="HF @ max bonus"
              sub="bonus saturates at or below"
            />
            <Stat
              n={fmtPct(spoke.liquidationConfig.liqBonusFactor, 0)}
              k="Min-bonus factor"
              sub="min bonus = factor × max bonus"
            />
          </div>
          <LiquidationBonusChart spoke={spoke} meta={meta} />
        </div>
      </Section>

      <Section title="Reserves" hint={`${spoke.reserves.length} reserves · risk parameters and live state`}>
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
              <div className="r pp-mono">{fmtPct(r.maxLiquidationBonus, 2)}</div>
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
        <Section title="Incoming credit lines" hint="Credit this spoke can draw from other hubs">
          <div className="pp-cl-list">
            {credits.map((cl, i) => (
              <CreditRow key={i} cl={cl} spokeName={spoke.name} direction="in" hubNames={hubNames} meta={meta} onSelect={onSelect} />
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
  // The asset's own hub (differs from the spoke's parent for credit lines).
  const hubAsset = api
    .getHub(r.hub)
    ?.assets.find((a) => a.underlying.toLowerCase() === r.underlying.toLowerCase());
  return (
    <div className="pp-detail">
      <header className="pp-detail-head">
        <div className="pp-crumb">
          <span>Aave V4</span>
          <span className="sep">/</span>
          <span>{hub.chain.name}</span>
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
        hint="Risk parameters at the latest config version. When governance tightens these, existing positions keep their original terms until they next refresh — only new positions get the updated values."
      >
        <Grid cols={4}>
          <Stat
            n={fmtPct(r.collateralFactor, 0)}
            k="Collateral factor (CF)"
            sub="share of value usable as borrowing power"
          />
          <Stat
            n={fmtPct(r.maxLiquidationBonus, 1)}
            k="Max liquidation bonus"
            sub="maximum discount a liquidator can receive"
          />
          <Stat
            n={fmtPct(r.liquidationFee, 0)}
            k="Liquidation fee"
            sub="protocol's cut of that bonus"
          />
          <Stat
            n={fmtBps(r.collateralRisk)}
            k="Collateral risk"
            sub="risk score that drives the borrower's risk premium"
          />
        </Grid>
      </Section>

      <Section title="Static reserve config" hint="Reserve-level flags that apply immediately to all positions">
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
        hint="The price feed contract this reserve reads from. Each spoke routes through a single oracle that holds one feed per reserve."
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
          hint="Interest rate curve set at the hub-asset level — every spoke listing this asset shares the same curve."
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

// ---------------------------------------------------------------------------
// Liquidation bonus vs health factor
//
// V4 (LiquidationLogic.calculateLiquidationBonus), per reserve:
//   HF ≤ hfForMaxBonus          → bonus = maxBonus
//   hfForMaxBonus < HF < 1      → linear from maxBonus down to
//                                 minBonus = maxBonus × liquidationBonusFactor
//   HF ≥ 1                      → not liquidatable
// The shape is spoke-wide; the level is per reserve (its max bonus), so the
// chart draws one line per distinct max-bonus tier among collateral reserves.
// ---------------------------------------------------------------------------

// Ordinal ramp (one hue, darker → lighter = smaller → larger bonus), checked
// with the dataviz validator against the chart surface #0A1F23: monotone
// lightness, adjacent ΔL ≥ 0.06, dark end 2.34:1 contrast. Fewer tiers take
// evenly spaced steps, so their gaps only get wider.
const LB_RAMP = ['#7A4A40', '#915A4F', '#A96C5E', '#C27D6E', '#D49385', '#E6A99B', '#F8BFB3'];
const LB_MAX_TIERS = LB_RAMP.length;
const rampColors = (n: number) =>
  n === 1
    ? [LB_RAMP[3]]
    : Array.from({ length: n }, (_, i) => LB_RAMP[Math.round((i * (LB_RAMP.length - 1)) / (n - 1))]);

function bonusAt(hf: number, maxBonus: number, cfg: Spoke['liquidationConfig']): number | null {
  if (hf >= 1) return null;
  if (hf <= cfg.hfForMaxBonus) return maxBonus;
  const minBonus = maxBonus * cfg.liqBonusFactor;
  return minBonus + ((maxBonus - minBonus) * (1 - hf)) / (1 - cfg.hfForMaxBonus);
}

function niceStep(max: number): number {
  for (const s of [0.0025, 0.005, 0.01, 0.02, 0.05, 0.1]) if (max / s <= 6) return s;
  return 0.2;
}

function LiquidationBonusChart({ spoke, meta }: { spoke: Spoke; meta: AssetMeta }) {
  const cfg = spoke.liquidationConfig;
  const [hoverHf, setHoverHf] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const allTiers = useMemo(() => {
    const byBonus = new Map<string, { maxBonus: number; symbols: string[]; supplied: number }>();
    for (const r of spoke.reserves) {
      if (!r.collateral || r.maxLiquidationBonus <= 0) continue;
      const k = r.maxLiquidationBonus.toFixed(6);
      const t = byBonus.get(k) ?? { maxBonus: r.maxLiquidationBonus, symbols: [], supplied: 0 };
      t.symbols.push(r.symbol);
      t.supplied += r.suppliedAmount;
      byBonus.set(k, t);
    }
    return [...byBonus.values()].sort((a, b) => a.maxBonus - b.maxBonus);
  }, [spoke.reserves]);

  if (allTiers.length === 0) {
    return (
      <div className="pp-lb-empty">
        No reserve on this spoke is enabled as collateral, so there is nothing to liquidate.
      </div>
    );
  }

  // Past seven tiers, keep the seven carrying the most collateral; the
  // reserves table below lists every reserve's max bonus.
  const tiers =
    allTiers.length <= LB_MAX_TIERS
      ? allTiers
      : [...allTiers]
          .sort((a, b) => b.supplied - a.supplied)
          .slice(0, LB_MAX_TIERS)
          .sort((a, b) => a.maxBonus - b.maxBonus);
  const colors = rampColors(tiers.length);
  const flat = cfg.liqBonusFactor >= 0.9999;

  // Geometry (viewBox units; the SVG scales to its container width).
  const W = 640;
  const H = 240;
  const padL = 48;
  const padR = 20;
  const padT = 30;
  const padB = 40;
  const cw = W - padL - padR;
  const ch = H - padT - padB;

  const hfMax = cfg.hfForMaxBonus;
  const span = Math.max(1 - hfMax, 0.001);
  const lo = hfMax - span * 0.45;
  const hi = 1 + span * 0.45;
  const x = (hf: number) => padL + ((hf - lo) / (hi - lo)) * cw;

  const topTier = tiers[tiers.length - 1].maxBonus;
  const step = niceStep(topTier * 1.15);
  const yMax = Math.ceil((topTier * 1.15) / step) * step;
  const y = (b: number) => padT + ch - (b / yMax) * ch;
  const yTicks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);
  // Enough decimals that every tick prints exactly (0.25% steps → 2).
  const yDigits = (String(Math.round(step * 1e6) / 1e4).split('.')[1] ?? '').length;

  const mid = (hfMax + 1) / 2;
  const xDigits = Math.max(2, (mid.toString().split('.')[1] ?? '').replace(/0+$/, '').length);
  const xTicks = [hfMax, mid, 1];

  const tierPath = (maxBonus: number) => {
    const minBonus = maxBonus * cfg.liqBonusFactor;
    return `M${x(lo)},${y(maxBonus)} L${x(hfMax)},${y(maxBonus)} L${x(1)},${y(minBonus)}`;
  };

  const hfFromPointer = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const hf = lo + ((px - padL) / cw) * (hi - lo);
    return Math.min(hi, Math.max(lo, hf));
  };
  const keyStep = (hi - lo) / 60;

  const hoverX = hoverHf != null ? x(hoverHf) : null;
  const tipLeftPct = hoverX != null ? (hoverX / W) * 100 : 0;
  const zone =
    hoverHf == null
      ? ''
      : hoverHf >= 1
        ? 'Not liquidatable'
        : hoverHf <= hfMax
          ? 'Max bonus'
          : flat
            ? 'Full bonus'
            : 'Bonus ramp';

  return (
    <div className="pp-lb">
      <div
        className="pp-lb-plot"
        tabIndex={0}
        aria-label={`Liquidation bonus by health factor for ${spoke.name}. Use arrow keys to move along the health factor axis.`}
        onFocus={() => setHoverHf((h) => h ?? mid)}
        onBlur={() => setHoverHf(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const d = e.key === 'ArrowLeft' ? -keyStep : keyStep;
            setHoverHf((h) => Math.min(hi, Math.max(lo, (h ?? mid) + d)));
          }
        }}
      >
        <svg
          ref={svgRef}
          className="pp-lb-svg"
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          onPointerMove={(e) => setHoverHf(hfFromPointer(e.clientX))}
          onPointerLeave={() => setHoverHf(null)}
        >
          {/* HF ≥ 1: no liquidation possible */}
          <rect x={x(1)} y={padT} width={x(hi) - x(1)} height={ch} fill="var(--fg)" opacity="0.035" />

          {/* Gridlines + y ticks */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={padL + cw} y1={y(t)} y2={y(t)} stroke="var(--line-soft)" strokeWidth="1" />
              <text x={padL - 8} y={y(t) + 3} textAnchor="end" className="pp-lb-tick">
                {(t * 100).toFixed(yDigits)}%
              </text>
            </g>
          ))}
          <line x1={padL} x2={padL + cw} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1" />

          {/* Zone labels */}
          <text x={(x(lo) + x(hfMax)) / 2} y={padT - 12} textAnchor="middle" className="pp-lb-zone">
            max bonus
          </text>
          <text x={(x(hfMax) + x(1)) / 2} y={padT - 12} textAnchor="middle" className="pp-lb-zone">
            {flat ? 'full bonus' : 'bonus ramp'}
          </text>
          <text x={(x(1) + x(hi)) / 2} y={padT - 12} textAnchor="middle" className="pp-lb-zone">
            not liquidatable
          </text>

          {/* Threshold markers */}
          {[hfMax, 1].map((t) => (
            <line
              key={t}
              x1={x(t)}
              x2={x(t)}
              y1={padT - 4}
              y2={padT + ch}
              stroke="var(--fg-mute)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          ))}

          {/* One line per max-bonus tier */}
          {tiers.map((t, i) => (
            <g key={t.maxBonus}>
              <path
                d={tierPath(t.maxBonus)}
                fill="none"
                stroke={colors[i]}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={x(1)}
                cy={y(t.maxBonus * cfg.liqBonusFactor)}
                r="4"
                fill={colors[i]}
                stroke="var(--pp-lb-surface)"
                strokeWidth="2"
              />
            </g>
          ))}

          {/* X axis */}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={padT + ch + 16} textAnchor="middle" className="pp-lb-tick">
              {t.toFixed(xDigits)}
            </text>
          ))}
          <text x={padL + cw / 2} y={H - 6} textAnchor="middle" className="pp-lb-axis">
            Health factor
          </text>

          {/* Crosshair */}
          {hoverHf != null && hoverX != null && (
            <g pointerEvents="none">
              <line x1={hoverX} x2={hoverX} y1={padT} y2={padT + ch} stroke="var(--fg-soft)" strokeWidth="1" />
              {tiers.map((t, i) => {
                const b = bonusAt(hoverHf, t.maxBonus, cfg);
                return b == null ? null : (
                  <circle
                    key={t.maxBonus}
                    cx={hoverX}
                    cy={y(b)}
                    r="4"
                    fill={colors[i]}
                    stroke="var(--pp-lb-surface)"
                    strokeWidth="2"
                  />
                );
              })}
            </g>
          )}
        </svg>

        {hoverHf != null && (
          <div
            className={'pp-lb-tip ' + (tipLeftPct > 60 ? 'flip' : '')}
            style={{ left: tipLeftPct + '%' }}
            role="status"
          >
            <div className="pp-lb-tip-h">
              <b className="pp-mono">HF {hoverHf.toFixed(xDigits + 1)}</b>
              <span>{zone}</span>
            </div>
            {hoverHf >= 1 ? (
              <div className="pp-lb-tip-note">Health factor at or above 1: no bonus is paid.</div>
            ) : (
              [...tiers].reverse().map((t) => {
                const i = tiers.indexOf(t);
                return (
                  <div key={t.maxBonus} className="pp-lb-tip-row">
                    <span className="pp-lb-key" style={{ background: colors[i] }} />
                    <b className="pp-mono">{fmtPct(bonusAt(hoverHf, t.maxBonus, cfg), 2)}</b>
                    <span className="pp-lb-tip-syms">
                      {t.symbols.slice(0, 3).join(', ')}
                      {t.symbols.length > 3 ? ` +${t.symbols.length - 3}` : ''}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="pp-lb-legend">
        {[...tiers].reverse().map((t) => {
          const i = tiers.indexOf(t);
          return (
            <div key={t.maxBonus} className="pp-lb-leg-row">
              <span className="pp-lb-key" style={{ background: colors[i] }} />
              <span className="pp-lb-leg-v pp-mono">
                {fmtPct(t.maxBonus, 2)}
                {!flat && (
                  <span className="pp-mute"> → {fmtPct(t.maxBonus * cfg.liqBonusFactor, 2)} at HF 1</span>
                )}
              </span>
              <span className="pp-lb-leg-assets">
                {t.symbols.map((sym) => (
                  <span key={sym} className="pp-lb-leg-asset">
                    <AssetGlyph symbol={sym} size={14} meta={meta} />
                    {sym}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
        {allTiers.length > tiers.length && (
          <div className="pp-lb-leg-note">
            Showing the {LB_MAX_TIERS} of {allTiers.length} bonus tiers with the most collateral supplied.
            Every reserve's max bonus is in the table below.
          </div>
        )}
      </div>
    </div>
  );
}
