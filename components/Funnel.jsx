import React from 'react';

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

// The post "Funnel": each metric shows its value, a bar scaled to its share of
// Views, and a short descriptor line beneath.
export default function Funnel({ data }) {
  const num = (k) => Number(data[k]) || 0;
  const views = num('views');
  const reach = num('reach');
  const likes = num('likes');
  const saves = num('saves');
  const shares = num('shares');
  const follows = num('follows');
  const comments = num('comments');

  const pct = (n) => (views > 0 ? (n / views) * 100 : 0);
  // Give any non-zero value a visible sliver even when it's a tiny share.
  const barW = (v) => (v > 0 ? Math.max(0.6, pct(v)) : 0);

  const reachPct = views > 0 ? Math.round((reach / views) * 100) : 0;
  const likesPct = reach > 0 ? ((likes / reach) * 100).toFixed(1) : '0.0';

  const steps = [
    { label: 'Views', value: views, w: 100, desc: 'Total plays and impressions' },
    { label: 'Reach', value: reach, w: barW(reach), desc: `${reachPct}% of views were unique accounts` },
    { label: 'Likes', value: likes, w: barW(likes), desc: `${likesPct}% of reach` },
    { label: 'Saves', value: saves, w: barW(saves), desc: 'Strongest signal of intent' },
    { label: 'Shares', value: shares, w: barW(shares), desc: 'Sent to a friend or story' },
    { label: 'Follows', value: follows, w: barW(follows), desc: 'New accounts from this post' },
    { label: 'Comments', value: comments, w: barW(comments), desc: 'Replies on the post' },
  ];

  return (
    <div className="border border-[#1f1f1f] bg-[#121212] p-6">
      <h4 className="mb-5 font-display text-[16px] font-semibold text-white">Funnel</h4>
      <div className="flex flex-col gap-5">
        {steps.map((s) => (
          <div key={s.label} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] text-white">{s.label}</span>
              <span className="font-mono text-[15px] font-semibold text-white">{fmt(s.value)}</span>
            </div>
            <div className="h-3 bg-[#1f1f1f]">
              <div
                className="h-full bg-[#ebffa8] transition-[width] duration-500"
                style={{ width: `${s.w.toFixed(1)}%` }}
              />
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
