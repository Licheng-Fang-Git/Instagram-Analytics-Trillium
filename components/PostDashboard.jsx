import MetricCards from '@/components/MetricCards';
import InidiviualCharts from '@/components/InidiviualCharts';
import PostCreative from '@/components/PostCreative';
import Funnel from '@/components/Funnel';
import { getInstagramMeta } from '@/app/compare/actions';

// One shared layout for every post-detail page, matching the Claude design:
// eyebrow + serif title, a stat grid, the View Growth combo chart, and a
// two-column row of the "The Post" creative + caption and the Funnel.
export default async function PostDashboard({ title, slug, month, metrics, chartData, link }) {
  const eyebrow = `${month} 2026 · ${slug}`;
  const { image: imageSrc, caption } = await getInstagramMeta(link);

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

  // "Jul 1, 2026 · 2:42pm ET" from the first interval start. Parse via Date so
  // it works whether or not the raw timestamp already includes the year.
  const rawStart = String(chartData[0]?.['Interval Start'] ?? '');
  const startDate = new Date(/\d{4}/.test(rawStart) ? rawStart : `${rawStart} 2026`);
  let postDateTime = '';
  if (!isNaN(startDate)) {
    const mon = startDate.toLocaleDateString('en-US', { month: 'short' });
    let h = startDate.getHours();
    const ap = h < 12 ? 'am' : 'pm';
    h = h % 12 || 12;
    const min = String(startDate.getMinutes()).padStart(2, '0');
    postDateTime = `${mon} ${startDate.getDate()}, ${startDate.getFullYear()} · ${h}:${min}${ap} ET`;
  }


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

        <div className="grid grid-cols-2 items-start gap-5">
          <div className="flex flex-col gap-4 border border-[#1f1f1f] bg-[#121212] p-6">
            {/* Account + post time */}
            <div className="flex items-center gap-3">
              <a
                href="https://www.instagram.com/trilliumtrading/"
                className="block h-10 w-10 flex-none rounded-full border border-[#8D8D8D] bg-[#000000] justify-center"
                aria-label="trilliumtrading on Instagram"
              > 
                <h1 className="text-[20px] w-6 justify-center ml-[10px] mt-[6.5px]">T</h1>
              </a>
              <div className="flex flex-col">
                <a
                  href={link || 'https://www.instagram.com/trilliumtrading/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[15px] font-semibold text-[#ebffa8]!"
                >
                  trilliumtrading
                </a>
                {postDateTime && <span className="text-[13px] text-[#8d8d8d]">{postDateTime}</span>}
              </div>
            </div>

            <PostCreative src={imageSrc} title={title} />
          </div>

          <Funnel data={metrics} />
        </div>
      </div>
    </div>
  );
}
