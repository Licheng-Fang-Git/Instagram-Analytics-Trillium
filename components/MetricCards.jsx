import React from 'react';
import getPostMetrics from '@/app/content.js';

export default function MetricCards({data}) {
  // Mock data — you can pass this in as props from your parsed CSV or API
  const metrics = [
    { label: 'Views', value: data.views },
    { label: 'Reach', value: data.reach },
    { label: 'Likes', value: data.likes },
    { label: 'Shares', value: data.shares },
    { label: 'Follows', value: data.follows },
    { label: 'Comments', value: data.comments },
    { label: 'Saves', value: data.saves },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {metrics.map((item, index) => (
        <div
          key={index}
          className="w-[245px] h-[110px] bg-[#0c0c0c] rounded-xl px-5 py-4 flex flex-col justify-center items-start box-border"
        >
          {/* Top Row: Metric Label & Percentage Badge */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[#dfdecc] font-sans text-sm font-bold tracking-widest mb-1.5">
              {item.label}
            </span>
          </div>

          {/* Bottom Row: Main Numeric Value */}
          <div>
            <span className="text-white font-serif text-4xl leading-none">
              {item.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}