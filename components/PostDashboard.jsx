import MetricCards from '@/components/MetricCards';
import InidiviualCharts from '@/components/InidiviualCharts';
import InstagramImage from '@/components/InstagramImage';
import Funnel from '@/components/Funnel';
import { getInstagramImage } from '@/app/compare/actions';

// One shared layout for every post-detail page, matching the Claude design:
// eyebrow + serif title, a stat grid, the View Growth combo chart, and a
// two-column row of the Funnel and "The Post" card (Instagram embed).
export default async function PostDashboard({ title, slug, month, metrics, chartData, link }) {
  const eyebrow = `${month} 2026 · ${slug}`;
  const imageSrc = await getInstagramImage(link);

  // "Interval Start" looks like "Thu Jul 2 12:06 PM" — split on spaces so the
  // day is read as a plain number regardless of one or two digits (fixes the
  // "2 1" / "8," artifacts from fixed-index substrings).
  const data_length = chartData.length;
  const startParts = String(chartData[0]?.['Interval Start'] ?? '').split(' ');
  const endParts = String(chartData[data_length - 1]?.['Interval Start'] ?? '').split(' ');
  const date = (startParts[2] ?? '').replace(/\D/g, '');
  const upToMonth = endParts[1]
    ? new Date(`${endParts[1]} 1, 2026`).toLocaleDateString('en-US', { month: 'long' })
    : month;
  const upToDate = (endParts[2] ?? '').replace(/\D/g, '');


  return (
    <div className="max-w-[1440px] px-12 pb-[72px] pt-10">
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-1.5">
          <div className="trlm-eyebrow">{eyebrow}</div>
          <h1 className="m-0 font-serif text-[46px] leading-[1.08] tracking-[-0.01em] text-white">
            {title}
          </h1>
          <p className="m-0 text-[15px] text-[#e6e6e6]">{`Publication ${month} ${date}, 2026. Post metrics up to ${upToMonth} ${upToDate}, 2026`}</p>
        </header>

        <MetricCards data={metrics} />

        <InidiviualCharts data={chartData} />

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-4 border border-[#1f1f1f] bg-[#121212] p-6">
            <div className="flex items-center gap-3">
              <a href="https://www.instagram.com/trilliumtrading/"><div className="flex h-10 w-10 ml-10 items-center justify-center rounded-full border border-[#2a2a2a] bg-black font-serif text-lg text-[#ebffa8]">
                T
              </div></a>
              <div className="flex flex-col">
                <a href="https://www.instagram.com/trilliumtrading/"> <span className="text-sm text-white">trilliumtrading</span> </a>
                <span className="text-xs text-[#e6e6e6]">@trilliumtrading</span>
              </div>
              <a
                href={link || 'https://www.instagram.com/trilliumtrading/'}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto mr-10 border border-white/25 px-4 py-2 font-display text-[11px] font-bold uppercase tracking-[0.12em] text-white transition-all hover:border-[#ebffa8]"
              >
                View post
              </a>
            </div>
            <InstagramImage src={imageSrc} url={link} />
          </div>

          <Funnel data={metrics} />
        </div>
      </div>
    </div>
  );
}
