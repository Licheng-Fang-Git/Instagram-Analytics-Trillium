import MetricCards from '@/components/MetricCards';
import InidiviualCharts from '@/components/InidiviualCharts';
import InstagramEmbed from '@/components/InstagramEmbed';
import Funnel from '@/components/Funnel';

// One shared layout for every post-detail page, matching the Claude design:
// eyebrow + serif title, a stat grid, the View Growth combo chart, and a
// two-column row of the Funnel and "The Post" card (Instagram embed).
export default function PostDashboard({ title, slug, month, metrics, chartData, link }) {
  const eyebrow = `${month} 2026 · ${slug}`;
  const date = chartData[0]["Interval Start"].substring(8,11);
  const data_length = chartData.length;
  const upToDate = chartData[data_length-1]["Interval Start"].substring(4,11);
  

  return (
    <div className="max-w-[1440px] px-12 pb-[72px] pt-10">
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-1.5">
          <div className="trlm-eyebrow">{eyebrow}</div>
          <h1 className="m-0 font-serif text-[46px] leading-[1.08] tracking-[-0.01em] text-white">
            {title}
          </h1>
          <p className="m-0 text-[15px] text-[#787878]">{`Publication ${month} ${date} 2026. Post Metric through to ${upToDate} 2026`}</p>
        </header>

        <MetricCards data={metrics} />

        <InidiviualCharts data={chartData} />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_1fr]">

          <div className="flex flex-col gap-4 border border-[#1f1f1f] bg-[#121212] p-6">
            <h4 className="font-display text-[16px] font-semibold text-white">The Post</h4>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#2a2a2a] bg-black font-serif text-lg text-[#ebffa8]">
                T
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-white">trilliumtrading</span>
                <span className="text-xs text-[#67696f]">@trilliumtrading</span>
              </div>
              <a
                href={link || 'https://www.instagram.com/trilliumtrading/'}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto border border-white/25 px-4 py-2 font-display text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:border-[#ebffa8] hover:bg-[#ebffa8] hover:text-[#0d0d0d]"
              >
                View post
              </a>
            </div>
            {link ? (
              <InstagramEmbed url={link} />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center border border-dashed border-[#2f2f2f] bg-[#0d0d0d] p-6 text-center">
                <span className="max-w-[26ch] text-[13px] text-[#67696f]">
                  The post creative will appear here once a link is available.
                </span>
              </div>
            )}
          </div>

          <Funnel data={metrics} />
        </div>
      </div>
    </div>
  );
}
