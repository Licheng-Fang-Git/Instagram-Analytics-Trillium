import PostView from '@/components/PostView';

export const dynamic = 'force-dynamic';

// Flat fallback route — /post/<slug>. Used for posts without a month/year
// (undated) so they still have a home; dated posts use /{year}/{month}/{slug}.
export default async function Page({ params }) {
  const { slug } = await params;
  return <PostView slug={slug} />;
}
