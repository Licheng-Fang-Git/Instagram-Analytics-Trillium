import React from 'react';

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

// A four-step funnel (Views -> Reach -> Interactions -> Follows) rendered as
// labeled bars, each scaled to its share of total Views.
export default function Funnel({ data }) {
  const views = Number(data.views) || 0;
  const interactions =
    (Number(data.likes) || 0) +
    (Number(data.saves) || 0) +
    (Number(data.comments) || 0) +
    (Number(data.shares) || 0);

  const pct = (n) => (views > 0 ? (n / views) * 100 : 0);
  const engRate =
    data.reach > 0
      ? (((data.likes + data.saves + data.comments) / data.reach) * 100).toFixed(1) 
      : '0.0';

  const steps = [
    { label: 'Views', value: views, w: 100 },
    { label: 'Reach', value: Number(data.reach) || 0, w: pct(Number(data.reach) || 0) },
    { label: 'Likes', value: Number(data.likes), w: pct(Number(data.likes)) },
    { label: 'Shares', value: Number(data.shares) || 0, w: pct(Number(data.shares) || 0) },
    { label: 'Follows', value: Number(data.follows) || 0, w:  pct(Number(data.follows) || 0) },
    { label: 'Comments', value: Number(data.comments) || 0, w: pct(Number(data.comments) || 0) },
    { label: 'Saves', value: Number(data.saves) || 0, w: pct(Number(data.saves) || 0) },
  ];

  return (
    <div className="border border-[#1f1f1f] bg-[#121212] p-6">
      <h4 className="mb-[18px] font-display text-[16px] font-semibold text-white">Funnel</h4>
      <div className="flex flex-col gap-3.5">
        {steps.map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[13px] text-[#e8e8e8]">
              <span>{s.label}</span>
              <span className="font-mono text-[#787878]">{fmt(s.value)}</span>
            </div>
            <div className="h-2 bg-[#1f1f1f]">
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
