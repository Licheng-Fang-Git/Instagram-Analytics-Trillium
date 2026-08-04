import ComparePost from '@/components/ComparePost';
import PostImpact from '@/components/PostImpact';

export default function ComparePage() {
  return (
    <div className="max-w-[1440px] px-12 pb-[72px] pt-10">
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-1.5">
          <div className="trlm-eyebrow">Analysis</div>
          <h1 className="m-0 font-serif text-[52px] leading-[1.05] tracking-[-0.01em] text-white">
            Compare Posts
          </h1>
          <p className="m-0 max-w-[60ch] text-[15px] text-[#e6e6e6]">
            Analyze a single post&apos;s impact on account growth, or search to compare posts head to head.
          </p>
        </header>

        <PostImpact />

        <ComparePost />
      </div>
    </div>
  );
}
