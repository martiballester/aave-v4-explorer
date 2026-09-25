import { useMemo } from 'react';
import { useChainScope, useScopedParams, type ChainScope } from '../../data';
import type { AaveParams, AssetMetadata, ChainSummary, Hub, HubId } from '../../data/types';
import { AssetGlyph } from '../AssetGlyph';
import { ChainIcon } from '../ChainSwitcher';

interface OverviewProps {
  onSelectHub: (id: HubId) => void;
}

export function Overview({ onSelectHub }: OverviewProps) {
  const { data, isLoading, isFetching, error, dataUpdatedAt, refetch } = useScopedParams();
  const { scope, setScope } = useChainScope();

  if (isLoading || !data) {
    return (
      <div style={{ padding: 24, color: 'var(--fg-mute)' }}>
        <div className="lr-eyebrow">Overview</div>
        <p style={{ marginTop: 8 }}>{error ? 'Failed to load — retrying…' : 'Loading protocol state…'}</p>
      </div>
    );
  }

  return (
    <OverviewInner
      data={data}
      scope={scope}
      onSelectChain={setScope}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      onRefresh={() => refetch()}
      onSelectHub={onSelectHub}
    />
  );
}

interface InnerProps {
  data: AaveParams;
  scope: ChainScope;
  onSelectChain: (s: ChainScope) => void;
  isFetching: boolean;
  dataUpdatedAt: number;
  onRefresh: () => void;
  onSelectHub: (id: HubId) => void;
}

const fmtUSD = (n: number, d = 2): string => {
  if (n == null) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(d) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(d) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(d) + 'K';
  return '$' + n.toFixed(d);
};
const fmtPct = (n: number, d = 1): string => (n * 100).toFixed(d) + '%';

function OverviewInner({
  data,
  scope,
  onSelectChain,
  isFetching,
  dataUpdatedAt,
  onRefresh,
  onSelectHub,
}: InnerProps) {
  const totals = useMemo(() => {
    const uniqueAssetSymbols = new Set<string>();
    let supplied = 0,
      borrowed = 0,
      supplyCap = 0,
      borrowCap = 0,
      assetCount = 0;
    for (const h of data.hubs) {
      supplied += h.summary.totalSupplied;
      borrowed += h.summary.totalBorrowed;
      supplyCap += h.summary.totalSupplyCap;
      borrowCap += h.summary.totalBorrowCap;
      assetCount += h.summary.assetCount;
      h.assets.forEach((a) => uniqueAssetSymbols.add(a.symbol));
    }
    const util = supplied > 0 ? borrowed / supplied : 0;
    let reserveCount = 0;
    data.spokes.forEach((s) => (reserveCount += s.reserves.length));
    return {
      supplied,
      borrowed,
      supplyCap,
      borrowCap,
      util,
      assetListings: assetCount,
      uniqueAssets: uniqueAssetSymbols.size,
      spokeCount: data.spokes.length,
      reserveCount,
      hubCount: data.hubs.length,
      creditLineCount: data.creditLines.length,
    };
  }, [data]);

  const scopeLabel =
    scope === 'all'
      ? `${data.chains.filter((c) => c.status === 'ok').length} networks`
      : data.chains.find((c) => c.chainId === scope)?.label ?? '';
  const multiChain = scope === 'all';

  return (
    <div className="ov-root">
      <header className="ov-head">
        <div>
          <h1 className="ov-title">Aave V4 — Protocol overview</h1>
          <p className="ov-sub">
            {totals.hubCount} hubs · {totals.spokeCount} spokes · {totals.reserveCount} reserves ·{' '}
            {totals.creditLineCount} cross-hub credit lines · {scopeLabel}
          </p>
        </div>
        <div className="ov-meta">
          <span className="ov-fetched">
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
      </header>

      <section className="ov-section">
        <div className="lr-eyebrow ov-section-title">Aggregates</div>
        <div className="ov-stats">
          <div className="ov-stat">
            <div className="ov-stat-k lr-eyebrow">Total supplied</div>
            <div className="ov-stat-n pp-mono">{fmtUSD(totals.supplied)}</div>
            <div className="ov-stat-sub">
              of {fmtUSD(totals.supplyCap)} aggregate cap (
              {fmtPct(totals.supplied / Math.max(totals.supplyCap, 1), 1)} used)
            </div>
          </div>
          <div className="ov-stat">
            <div className="ov-stat-k lr-eyebrow">Total borrowed</div>
            <div className="ov-stat-n pp-mono">{fmtUSD(totals.borrowed)}</div>
            <div className="ov-stat-sub">
              of {fmtUSD(totals.borrowCap)} aggregate cap (
              {fmtPct(totals.borrowed / Math.max(totals.borrowCap, 1), 1)} used)
            </div>
          </div>
          <div className="ov-stat">
            <div className="ov-stat-k lr-eyebrow">Utilization</div>
            <div className="ov-stat-n pp-mono">{fmtPct(totals.util, 1)}</div>
            <div className="ov-stat-sub">borrowed ÷ supplied across all hubs</div>
          </div>
          <div className="ov-stat">
            <div className="ov-stat-k lr-eyebrow">Coverage</div>
            <div className="ov-stat-n pp-mono">{totals.uniqueAssets}</div>
            <div className="ov-stat-sub">
              unique assets · {totals.assetListings} hub-listings
            </div>
          </div>
        </div>
      </section>

      {multiChain && (
        <section className="ov-section">
          <div className="lr-eyebrow ov-section-title">Networks</div>
          <NetworkTable chains={data.chains} onSelect={onSelectChain} />
        </section>
      )}

      <section className="ov-section">
        <div className="lr-eyebrow ov-section-title">Hubs</div>
        <div className="ov-hubs">
          {data.hubs.map((hub) => (
            <HubCard
              key={hub.id}
              hub={hub}
              spokeCount={data.spokes.filter((s) => s.hubId === hub.id).length}
              creditLinesIn={data.creditLines.filter((c) => c.to === hub.id).length}
              creditLinesOut={data.creditLines.filter((c) => c.from === hub.id).length}
              assetMeta={data.assetMeta}
              showChain={multiChain}
              onClick={() => onSelectHub(hub.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// One row per network: where V4's supply sits, and which sources loaded.
function NetworkTable({
  chains,
  onSelect,
}: {
  chains: ChainSummary[];
  onSelect: (s: ChainScope) => void;
}) {
  return (
    <div className="ov-net">
      <div className="ov-net-h">
        <div>Network</div>
        <div className="r">Supplied</div>
        <div className="r">Borrowed</div>
        <div className="r">Util.</div>
        <div className="r">Hubs</div>
        <div className="r">Spokes</div>
        <div className="r">Reserves</div>
        <div>Source</div>
      </div>
      {chains.map((c) => {
        const util = c.totals.supplied > 0 ? c.totals.borrowed / c.totals.supplied : 0;
        return (
          <button key={c.chainId} className="ov-net-r" onClick={() => onSelect(c.chainId)}>
            <div className="ov-net-name">
              <ChainIcon src={c.icon} size={16} />
              <span>{c.label}</span>
              {c.operator && <span className="chain-op">{c.operator}</span>}
            </div>
            <div className="r pp-mono">{c.status === 'ok' ? fmtUSD(c.totals.supplied) : '—'}</div>
            <div className="r pp-mono">{c.status === 'ok' ? fmtUSD(c.totals.borrowed) : '—'}</div>
            <div className="r pp-mono">{c.status === 'ok' ? fmtPct(util, 1) : '—'}</div>
            <div className="r pp-mono">{c.totals.hubs}</div>
            <div className="r pp-mono">{c.totals.spokes}</div>
            <div className="r pp-mono">{c.totals.reserves}</div>
            <div className={'ov-net-src ' + c.status} title={c.error}>
              {c.status === 'error'
                ? 'failed to load'
                : c.status === 'empty'
                  ? 'no hubs listed'
                  : c.source === 'rpc'
                    ? 'on-chain reads'
                    : 'AaveKit'}
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface HubCardProps {
  hub: Hub;
  spokeCount: number;
  creditLinesIn: number;
  creditLinesOut: number;
  assetMeta: Record<string, AssetMetadata>;
  showChain: boolean;
  onClick: () => void;
}

function HubCard({ hub, spokeCount, creditLinesIn, creditLinesOut, assetMeta, showChain, onClick }: HubCardProps) {
  const topAssets = useMemo(
    () => [...hub.assets].sort((a, b) => b.summary.supplied - a.summary.supplied).slice(0, 6),
    [hub.assets],
  );
  const supplyCapUsed = hub.summary.totalSupplyCap > 0
    ? hub.summary.totalSupplied / hub.summary.totalSupplyCap
    : 0;
  return (
    <button className="ov-hub-card" onClick={onClick} style={{ ['--hub' as string]: hub.color } as React.CSSProperties}>
      <div className="ov-hub-card-h">
        <span className="ov-hub-bullet" style={{ background: hub.color }} />
        <span className="ov-hub-name">{hub.label}</span>
        {hub.tag !== '—' && <span className="lr-eyebrow ov-hub-tag">{hub.tag}</span>}
      </div>
      {showChain && (
        <div className="ov-hub-chain">
          <ChainIcon src={hub.chain.icon} size={12} />
          <span>{hub.chain.name}</span>
        </div>
      )}

      <div className="ov-hub-stats">
        <div>
          <div className="lr-eyebrow">Supplied</div>
          <div className="pp-mono ov-hub-num">{fmtUSD(hub.summary.totalSupplied)}</div>
          <div className="ov-hub-num-sub">
            {fmtPct(supplyCapUsed, 1)} of {fmtUSD(hub.summary.totalSupplyCap)} cap
          </div>
        </div>
        <div>
          <div className="lr-eyebrow">Borrowed</div>
          <div className="pp-mono ov-hub-num">{fmtUSD(hub.summary.totalBorrowed)}</div>
          <div className="ov-hub-num-sub">{fmtPct(hub.summary.utilizationRate, 1)} util</div>
        </div>
      </div>

      <div className="ov-hub-meta">
        <span>
          <b className="pp-mono">{spokeCount}</b> spoke{spokeCount === 1 ? '' : 's'}
        </span>
        <span>
          <b className="pp-mono">{hub.summary.assetCount}</b> asset
          {hub.summary.assetCount === 1 ? '' : 's'}
        </span>
        {creditLinesIn > 0 && (
          <span title="incoming credit lines">
            <span className="ov-credit-in">↳</span>
            <b className="pp-mono">{creditLinesIn}</b> in
          </span>
        )}
        {creditLinesOut > 0 && (
          <span title="outgoing credit lines">
            <span className="ov-credit-out">↦</span>
            <b className="pp-mono">{creditLinesOut}</b> out
          </span>
        )}
      </div>

      <div className="ov-hub-glyphs">
        {topAssets.map((a) => (
          <AssetGlyph
            key={a.symbol}
            symbol={a.symbol}
            meta={assetMeta}
            size={22}
            className="ov-glyph"
            title={`${a.symbol} — ${fmtUSD(a.summary.supplied)}`}
          />
        ))}
        {hub.assets.length > topAssets.length && (
          <span className="ov-glyph-more">+{hub.assets.length - topAssets.length}</span>
        )}
      </div>

      <div className="ov-hub-cta">drill into {hub.label.toLowerCase()} →</div>
    </button>
  );
}
