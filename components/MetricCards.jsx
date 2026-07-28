import React from 'react';

function fmt(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

// The 4-column stat grid on a post page. Values come from the parsed sheet
// row (views/reach/likes/shares/follows/comments/saves); Eng. Rate is derived.
export default function MetricCards({ data }) {
  const engRate =
    data.reach > 0
      ? (((data.likes + data.saves + data.comments) / data.reach) * 100).toFixed(1) + '%'
      : '0.0%';

  
  const metrics = [
    { label: 'Views', value: fmt(data.views) },
    { label: 'Reach', value: fmt(data.reach) },
    { label: 'Likes', value: fmt(data.likes) },
    { label: 'Shares', value: fmt(data.shares) },
    { label: 'Follows', value: fmt(data.follows) },
    { label: 'Comments', value: fmt(data.comments) },
    { label: 'Saves', value: fmt(data.saves) },
    { label: 'Eng. Rate', value: engRate },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {metrics.map((item) => (
        <div 
          key={item.label}
          className="flex flex-col gap-1.5 border border-[#232323] bg-black px-5 pb-5 pt-[18px] transition-colors hover:border-[rgba(235,255,168,0.35)]"
        >
          
          <span className={`font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#787878]`}>
            {item.label}
          </span> 
          <span className={`font-serif text-[34px] leading-none ${item.label === "Likes" ? "text-[#ebffa8]" : "text-white"}`}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
