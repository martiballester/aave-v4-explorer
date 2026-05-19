import { Fragment, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useTopology } from '../../data';
import type { HubId, HubSpokeRef } from '../../data/types';

type CellState = 'col' | 'bor' | 'both' | null;
type SpokeWithHub = HubSpokeRef & { hub: HubId; hubLabel: string; hubColor: string };

interface HoverState {
  spokeId?: string;
  asset?: string;
  type?: CellState;
  spoke?: SpokeWithHub;
}

export function Matrix() {
  const { hubs: hubsM, creditLines: creditLinesM, assetMeta: assetMetaM, HUB_NAMES: HUB_NAMES_M } = useTopology();

  const [hover, setHover] = useState<HoverState | null>(null);
  const [filter, setFilter] = useState<'all' | HubId>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selectedSpokes, setSelectedSpokes] = useState<string[]>([]);
  const [activeCredit, setActiveCredit] = useState<number | null>(null);

  const isLoading = hubsM.length === 0;

  const allSpokes = useMemo<SpokeWithHub[]>(
    () =>
      hubsM.flatMap((h) =>
        h.spokes.map((s) => ({ ...s, hub: h.id, hubLabel: h.label, hubColor: h.color })),
      ),
    [hubsM],
  );
  const findSpoke = (id: string) => allSpokes.find((s) => s.id === id);

  // -------- assets to display --------
  const { assetCols, groupBoundaries } = useMemo(() => {
    const set = new Set<string>();
    const scope = filter === 'all' ? hubsM : hubsM.filter((h) => h.id === filter);
    scope.forEach((h) =>
      h.spokes.forEach((s) => {
        s.collateral.forEach((a) => set.add(a));
        s.borrowable.forEach((a) => set.add(a));
      }),
    );
    const order = ['eth', 'btc', 'stable', 'eur', 'gold', 'pt', 'credit', 'other'];
    const arr = [...set].sort((a, b) => {
      const ta = order.indexOf(assetMetaM[a]?.type);
      const tb = order.indexOf(assetMetaM[b]?.type);
      if (ta !== tb) return ta - tb;
      return a.localeCompare(b);
    });
    const bounds: Array<{ i: number; type: string }> = [];
    let lastT: string | null = null;
    arr.forEach((sym, i) => {
      const t = assetMetaM[sym]?.type ?? '';
      if (t !== lastT) {
        bounds.push({ i, type: t });
        lastT = t;
      }
    });
    return { assetCols: arr, groupBoundaries: bounds };
  }, [filter, hubsM, assetMetaM]);

  const cellState = (spoke: HubSpokeRef, asset: string): CellState => {
    const c = spoke.collateral.includes(asset);
    const b = spoke.borrowable.includes(asset);
    if (c && b) return 'both';
    if (c) return 'col';
    if (b) return 'bor';
    return null;
  };

  // -------- selection helpers --------
  const toggleSpoke = (id: string, ev: ReactMouseEvent) => {
    const additive = ev?.shiftKey || ev?.metaKey || ev?.ctrlKey;
    setSelectedSpokes((prev) => {
      const has = prev.includes(id);
      if (additive) return has ? prev.filter((x) => x !== id) : [...prev, id];
      if (has && prev.length === 1) return [];
      return [id];
    });
    setActiveCredit(null);
  };
  const clearSelection = () => {
    setSelectedSpokes([]);
    setActiveCredit(null);
  };
  const isSelected = (id: string) => selectedSpokes.includes(id);

  const { selectedColAssets, selectedBorAssets } = useMemo(() => {
    const c = new Set<string>();
    const b = new Set<string>();
    selectedSpokes.forEach((id) => {
      const sp = findSpoke(id);
      if (!sp) return;
      sp.collateral.forEach((a) => c.add(a));
      sp.borrowable.forEach((a) => b.add(a));
    });
    return { selectedColAssets: c, selectedBorAssets: b };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSpokes, allSpokes]);

  const creditAssetSet = useMemo(() => {
    if (activeCredit == null) return null;
    return new Set(creditLinesM[activeCredit].assets);
  }, [activeCredit, creditLinesM]);

  // permanent lookup: which (spoke, asset) cells are credit-derived
  const creditCellLookup = useMemo(() => {
    const m = new Map<string, { from: HubId; idx: number }>();
    creditLinesM.forEach((cl, i) => {
      cl.assets.forEach((a) => {
        m.set(cl.toSpoke + '|' + a, { from: cl.from, idx: i });
      });
    });
    return m;
  }, [creditLinesM]);

  const visibleSpokes = useMemo(() => {
    return filter === 'all' ? allSpokes : allSpokes.filter((s) => s.hub === filter);
  }, [filter, allSpokes]);

  const totals = useMemo(() => {
    return assetCols.map((asset) => {
      let c = 0;
      let b = 0;
      visibleSpokes.forEach((sp) => {
        if (sp.collateral.includes(asset)) c++;
        if (sp.borrowable.includes(asset)) b++;
      });
      return { asset, c, b };
    });
  }, [assetCols, visibleSpokes]);

  const visibleCreditLines = useMemo(() => {
    const withIdx = creditLinesM.map((cl, i) => ({ ...cl, _i: i }));
    if (filter === 'all') return withIdx;
    return withIdx.filter((cl) => cl.from === filter || cl.to === filter);
  }, [filter, creditLinesM]);

  const hubColor = (id: HubId) => hubsM.find((h) => h.id === id)?.color || 'var(--credit)';

  const colHL = (asset: string) => {
    const isHover = hover?.asset === asset;
    const inSel = selectedColAssets.has(asset) || selectedBorAssets.has(asset);
    const inCredit = creditAssetSet?.has(asset);
    if (inCredit) return 'col-credit';
    if (inSel) return 'col-sel';
    if (isHover) return 'col-hov';
    return '';
  };

  // Render loading state AFTER all hooks have been called — Rules of Hooks
  // require a stable call order across renders.
  if (isLoading) {
    return (
      <div style={{ padding: 24, color: 'var(--fg-mute)' }}>
        <div className="lr-eyebrow">Topology</div>
        <p style={{ marginTop: 8 }}>Loading hub topology from AaveKit…</p>
      </div>
    );
  }

  return (
    <div className="mx-root">
      <div className="mx-toolbar">
        <div className="mx-filter">
          <button
            className={filter === 'all' ? 'on' : ''}
            onClick={() => {
              setFilter('all');
              clearSelection();
            }}
          >
            All hubs
          </button>
          {hubsM.map((h) => (
            <button
              key={h.id}
              className={filter === h.id ? 'on' : ''}
              onClick={() => {
                setFilter(h.id);
                clearSelection();
              }}
            >
              <span className="mx-dot" style={{ background: h.color }} />
              {h.label}
            </button>
          ))}
        </div>

        <div className="mx-toolbar-mid">
          {selectedSpokes.length > 0 && (
            <div className="mx-sel-bar">
              <span className="lr-eyebrow">Selected</span>
              <span className="mx-sel-count">
                {selectedSpokes.length} spoke{selectedSpokes.length > 1 ? 's' : ''}
              </span>
              <button className="mx-sel-clear" onClick={clearSelection}>
                clear ✕
              </button>
            </div>
          )}
        </div>

        <div className="mx-legend">
          <span className="mx-leg-item">
            <span className="mx-cell col" /> collateral
          </span>
          <span className="mx-leg-item">
            <span className="mx-cell bor" /> borrowable
          </span>
          <span className="mx-leg-item">
            <span className="mx-cell both" /> both
          </span>
          <span className="mx-leg-item">
            <span className="mx-leg-credit-in" /> credit in
          </span>
          <span className="mx-leg-item">
            <span className="mx-leg-credit-out" /> credit out
          </span>
        </div>
      </div>

      <div className="mx-scroll">
        <div
          className="mx-grid"
          style={
            {
              '--cols': assetCols.length,
              '--col-w': '30px',
            } as React.CSSProperties
          }
        >
          <div className="mx-corner">
            <div className="lr-eyebrow" style={{ fontSize: 9 }}>
              Spoke ↓ · Asset →
            </div>
            <div className="mx-corner-hint">
              {selectedSpokes.length === 0 && filter === 'all' && 'click spoke · ⇧+click adds'}
              {selectedSpokes.length > 0 &&
                `${selectedColAssets.size + selectedBorAssets.size} unique assets`}
              {filter !== 'all' &&
                selectedSpokes.length === 0 &&
                `${assetCols.length} assets in ${HUB_NAMES_M[filter]}`}
            </div>
          </div>

          <div className="mx-col-head-row">
            {assetCols.map((asset, i) => {
              const m = assetMetaM[asset] || ({} as { icon?: string; color?: string });
              const boundary = groupBoundaries.find((g) => g.i === i);
              const hl = colHL(asset);
              return (
                <div
                  key={asset}
                  className={'mx-col-head ' + hl + (boundary ? ' new-group' : '')}
                  onMouseEnter={() => setHover((h) => ({ ...(h ?? {}), asset }))}
                  onMouseLeave={() => setHover((h) => (h?.asset === asset ? null : h))}
                >
                  <span className="mx-col-asset-icon">
                    <img
                      src={m.icon}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.parentElement) {
                          e.currentTarget.parentElement.style.background = m.color || '#888';
                        }
                      }}
                    />
                  </span>
                  <span className="mx-col-label">{asset}</span>
                </div>
              );
            })}
          </div>

          {hubsM.map((hub) => {
            if (filter !== 'all' && filter !== hub.id) return null;
            const isCollapsed = !!collapsed[hub.id];
            const incomingCredits = visibleCreditLines.filter((cl) => cl.to === hub.id);
            const outgoingCredits = filter === hub.id ? visibleCreditLines.filter((cl) => cl.from === hub.id) : [];

            return (
              <Fragment key={hub.id}>
                <button
                  className={'mx-hub-band ' + (isCollapsed ? 'collapsed' : '')}
                  style={{ ['--hub' as string]: hub.color } as React.CSSProperties}
                  onClick={() => setCollapsed((s) => ({ ...s, [hub.id]: !s[hub.id] }))}
                >
                  <svg
                    className="mx-hub-caret"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style={{ transform: isCollapsed ? 'rotate(0)' : 'rotate(90deg)' }}
                  >
                    <path d="M9 6l8 6-8 6V6z" />
                  </svg>
                  <span className="mx-hub-bullet" style={{ background: hub.color }} />
                  <span className="mx-hub-band-name">{hub.label}</span>
                  <span className="lr-eyebrow">{hub.tag}</span>
                  <span className="mx-hub-band-meta">
                    {hub.spokes.length} spoke{hub.spokes.length > 1 ? 's' : ''}
                    {isCollapsed && ' · collapsed'}
                  </span>
                </button>

                {!isCollapsed &&
                  hub.spokes.map((sp) => {
                    const sel = isSelected(sp.id);
                    const dim =
                      (selectedSpokes.length > 0 && !sel) ||
                      (activeCredit != null && creditLinesM[activeCredit].toSpoke !== sp.id);
                    return (
                      <div key={sp.id} className={'mx-row ' + (sel ? 'sel ' : '') + (dim ? 'dim ' : '')}>
                        <button className="mx-row-head" onClick={(e) => toggleSpoke(sp.id, e)}>
                          <span className="mx-row-check">
                            {sel ? (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                              </svg>
                            ) : (
                              <span className="mx-spoke-mark" />
                            )}
                          </span>
                          <span className="mx-row-name">{sp.label}</span>
                        </button>
                        <div className="mx-row-cells">
                          {assetCols.map((asset) => {
                            const st = cellState(sp, asset);
                            const colCls = colHL(asset);
                            const isExact = !!hover && hover.spokeId === sp.id && hover.asset === asset;
                            const cl = activeCredit != null ? creditLinesM[activeCredit] : null;
                            const isActiveCreditCell = !!(cl && cl.toSpoke === sp.id && cl.assets.includes(asset) && st);
                            const credit = creditCellLookup.get(sp.id + '|' + asset);
                            const isCreditCell = !!credit && !!st;
                            const direction = credit ? (credit.from === filter ? 'out' : 'in') : null;
                            const cellStyle = isCreditCell
                              ? ({ ['--credit-from' as string]: hubColor(credit!.from) } as React.CSSProperties)
                              : undefined;
                            return (
                              <div
                                key={asset}
                                className={
                                  'mx-cell-wrap ' +
                                  colCls +
                                  (isExact ? ' exact' : '') +
                                  (isCreditCell ? ' has-credit dir-' + direction : '') +
                                  (isActiveCreditCell ? ' is-credit-active' : '')
                                }
                                style={cellStyle}
                                onMouseEnter={() =>
                                  setHover({
                                    spokeId: sp.id,
                                    asset,
                                    type: st,
                                    spoke: { ...sp, hub: hub.id, hubLabel: hub.label, hubColor: hub.color },
                                  })
                                }
                                onMouseLeave={() => setHover(null)}
                              >
                                {st && <span className={'mx-cell ' + st + (isActiveCreditCell ? ' credit-cell' : '')} />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                {!isCollapsed &&
                  incomingCredits.map((cl) => {
                    const isAct = activeCredit === cl._i;
                    const fromHub = hubsM.find((h) => h.id === cl.from)!;
                    return (
                      <button
                        key={'cr' + cl._i}
                        className={'mx-credit-band incoming ' + (isAct ? 'on' : '')}
                        onClick={() => {
                          setActiveCredit((prev) => (prev === cl._i ? null : cl._i));
                          setSelectedSpokes([]);
                        }}
                      >
                        <span className="mx-credit-arrow">↳</span>
                        <span className="mx-credit-from" style={{ color: fromHub.color }}>
                          {HUB_NAMES_M[cl.from]}
                        </span>
                        <span className="mx-credit-sep">credit in →</span>
                        <span className="mx-credit-to">{cl.toSpoke.replace(cl.to + '-', '')}</span>
                        <span className="mx-credit-assets">
                          {cl.assets.map((a) => (
                            <span key={a} className="mx-credit-chip">
                              {a}
                            </span>
                          ))}
                        </span>
                        <span className="mx-credit-cta">{isAct ? 'highlighted' : 'highlight columns'}</span>
                      </button>
                    );
                  })}

                {!isCollapsed &&
                  outgoingCredits.map((cl) => {
                    const isAct = activeCredit === cl._i;
                    const toHub = hubsM.find((h) => h.id === cl.to)!;
                    const toSpokeLabel = toHub.spokes.find((s) => s.id === cl.toSpoke)?.label || cl.toSpoke;
                    return (
                      <button
                        key={'co' + cl._i}
                        className={'mx-credit-band outgoing ' + (isAct ? 'on' : '')}
                        onClick={() => {
                          setActiveCredit((prev) => (prev === cl._i ? null : cl._i));
                          setSelectedSpokes([]);
                        }}
                      >
                        <span className="mx-credit-arrow">↦</span>
                        <span className="mx-credit-from" style={{ color: toHub.color }}>
                          {HUB_NAMES_M[cl.to]}
                        </span>
                        <span className="mx-credit-sep">credit out ←</span>
                        <span className="mx-credit-to">{toSpokeLabel}</span>
                        <span className="mx-credit-assets">
                          {cl.assets.map((a) => (
                            <span key={a} className="mx-credit-chip">
                              {a}
                            </span>
                          ))}
                        </span>
                        <span className="mx-credit-cta">{isAct ? 'highlighted' : 'highlight columns'}</span>
                      </button>
                    );
                  })}
              </Fragment>
            );
          })}

          <div className="mx-row totals">
            <div className="mx-row-head">
              <span className="lr-eyebrow">spokes using</span>
            </div>
            <div className="mx-row-cells">
              {totals.map((t) => (
                <div key={t.asset} className={'mx-cell-wrap totals-cell ' + colHL(t.asset)}>
                  <span className="mx-tot-c" title={`${t.c} collateral`}>
                    {t.c || '·'}
                  </span>
                  <span className="mx-tot-b" title={`${t.b} borrowable`}>
                    {t.b || '·'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-readout">
        {selectedSpokes.length > 1 ? (
          <div className="mx-readout-l">
            <span className="lr-eyebrow">comparing</span>
            <span className="mx-readout-name">{selectedSpokes.length} spokes</span>
            <span className="mx-readout-x">·</span>
            <span style={{ color: 'var(--fg-soft)', fontSize: 11.5 }}>
              {selectedColAssets.size} collateral · {selectedBorAssets.size} borrowable assets used in union
            </span>
          </div>
        ) : hover ? (
          <>
            <div className="mx-readout-l">
              <span className="lr-eyebrow">spoke</span>
              <span className="mx-readout-name">{hover.spoke?.label || '—'}</span>
              <span className="mx-readout-x">×</span>
              <span className="lr-eyebrow">asset</span>
              <span className="mx-readout-name">{hover.asset}</span>
            </div>
            <div className="mx-readout-r">
              {hover.type === 'both' && (
                <>
                  <span className="mx-cell both" /> <span>collateralisable & borrowable</span>
                </>
              )}
              {hover.type === 'col' && (
                <>
                  <span className="mx-cell col" /> <span>collateral only</span>
                </>
              )}
              {hover.type === 'bor' && (
                <>
                  <span className="mx-cell bor" /> <span>borrowable only</span>
                </>
              )}
              {!hover.type && (
                <>
                  <span className="mx-cell empty" /> <span>not available in this spoke</span>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="mx-readout-hint">
            Click a hub to collapse · click spokes to highlight (⇧ for multi) · click a credit line to trace flow.
          </div>
        )}
      </div>
    </div>
  );
}
