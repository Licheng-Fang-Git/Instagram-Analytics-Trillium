import BestTimeToPost from '@/components/BestTimeToPost';
import { getAllTimingSeries } from '@/app/compare/actions';

// Pulls live from Google Sheets on every request.
export const dynamic = 'force-dynamic';

export default async function BestTimeToPostPage() {
  const series = await getAllTimingSeries();

  return (
    <div className="max-w-[1440px] px-12 pb-[72px] pt-10">
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-1.5">
          <div className="trlm-eyebrow">Timing</div>
          <h1 className="m-0 font-serif text-[52px] leading-[1.05] tracking-[-0.01em] text-white">
            Best Time to Post
          </h1>
          <p className="m-0 max-w-[62ch] text-[15px] text-[#787878]">
            Views recorded across your posts, folded onto a day × hour grid by the clock time each
            view was counted. See all posts aggregated, or pick a single post.
          </p>
        </header>

        <BestTimeToPost series={series} />
      </div>
    </div>
  );
}
