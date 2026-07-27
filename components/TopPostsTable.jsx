import Link from 'next/link';

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

// Engagement rate as a share of reach, shown as a percentage + a mini bar.
function engagement(p) {
  const reach = Number(p.reach) || 0;
  if (!reach) return 0;
  return (((Number(p.likes) || 0) + (Number(p.saves) || 0) + (Number(p.comments) || 0)) / reach) * 100;
}

const COLS = 'grid-cols-[2.2fr_1fr_1fr_1fr_1fr_1.4fr]';

// The overview "Top Posts" table — one row per post, sorted by views desc,
// each row linking through to that post's detail page.
export default function TopPostsTable({ posts }) {
  const rows = [...posts].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));

  return (
    <div className="border border-[#1f1f1f] bg-[#121212]">
      <div className="flex items-center justify-between border-b border-[#1f1f1f] px-6 py-5">
        <h4 className="font-display text-[16px] font-semibold text-white">Top Posts</h4>
        <span className="font-mono text-xs text-[#67696f]">{rows.length} posts</span>
      </div>

      {/* Column headers */}
      <div
        className={`grid ${COLS} border-b border-[#1f1f1f] px-6 py-3 font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#67696f]`}
      >
        <span>Post</span>
        <span className="text-right">Views</span>
        <span className="text-right">Reach</span>
        <span className="text-right">Likes</span>
        <span className="text-right">Saves</span>
        <span className="text-right">Engagement</span>
      </div>

      {rows.map((p) => {
        const eng = engagement(p);
        return (
          <Link
            key={p.code}
            href={p.href}
            className={`grid ${COLS} items-center border-b border-[#191919] px-6 py-4 transition-colors hover:bg-[#181818]`}
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-sm text-white">{p.title}</span>
              <span className="font-mono text-[11px] text-[#67696f]">{p.slug}</span>
            </span>
            <span className="text-right font-mono text-[13px] text-[#e8e8e8]">{fmt(p.views)}</span>
            <span className="text-right font-mono text-[13px] text-[#e8e8e8]">{fmt(p.reach)}</span>
            <span className="text-right font-mono text-[13px] text-[#e8e8e8]">{fmt(p.likes)}</span>
            <span className="text-right font-mono text-[13px] text-[#e8e8e8]">{fmt(p.saves)}</span>
            <span className="flex items-center justify-end gap-2">
              <span className="font-mono text-xs text-[#787878]">{eng.toFixed(1)}%</span>
              <span className="block h-1.5 w-[72px] bg-[#1f1f1f]">
                <span
                  className="block h-full bg-[#ebffa8]"
                  style={{ width: `${Math.min(100, eng * 12)}%` }}
                />
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
