import type { AssetMetadata } from '../data/types';

// Token icon. PTs show their underlying's icon inside a PT-colored ring;
// credit-line reserves (cUSDC) show the base icon inside a dashed credit ring.
// A missing icon falls back to a dot in the asset-type color.
export function AssetGlyph({
  symbol,
  size = 18,
  meta,
  className = 'pp-glyph',
  title,
}: {
  symbol: string;
  size?: number;
  meta: Record<string, AssetMetadata>;
  className?: string;
  title?: string;
}) {
  const m = meta[symbol] as AssetMetadata | undefined;
  const kind = m?.type === 'credit' ? ' credit' : m?.type === 'pt' ? ' pt' : '';
  return (
    <span className={className + kind} style={{ width: size, height: size }} title={title}>
      {m?.icon && (
        <img
          src={m.icon}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            if (e.currentTarget.parentElement) {
              e.currentTarget.parentElement.style.background = m?.color || '#888';
            }
          }}
        />
      )}
    </span>
  );
}
