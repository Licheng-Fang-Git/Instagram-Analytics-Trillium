import PostView from '@/components/PostView';

export const dynamic = 'force-dynamic';

// July 2026 posts — /2026/July/<slug>. Content comes from the registry, so any
// July post (current or future) renders here automatically.
export default async function Page({ params }) {
  const { slug } = await params;
  return <PostView slug={slug} />;
}
