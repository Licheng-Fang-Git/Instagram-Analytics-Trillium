import React from 'react';

export default function MetricCards({data}) {
  // Mock data — you can pass this in as props from your parsed CSV or API
  const metrics = [
    { label: 'Views', value: '8,850'},
    { label: 'Reach', value: '14,200'},
    { label: 'Likes', value: '1,240'},
    { label: 'Shares', value: '312'},
    { label: 'Follows', value: '89'},
    { label: 'Comments', value: '154'},
    { label: 'Saves', value: '420'},
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
      {metrics.map((item, index) => (
        <div
          key={index}
          className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:border-gray-300 transition-colors"
        >
          {/* Top Row: Metric Label & Percentage Badge */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {item.label}
            </span>
            <span
              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                item.isPositive
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              {item.change}
            </span>
          </div>

          {/* Bottom Row: Main Numeric Value */}
          <div>
            <span className="text-xl font-bold tracking-tight text-gray-900">
              {item.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}