import PostView from '@/components/PostView';

export const dynamic = 'force-dynamic';

// June 2026 posts — /2026/June/<slug>. Content comes from the registry, so any
// June post (current or future) renders here automatically.
export default async function Page({ params }) {
  const { slug } = await params;
  return <PostView slug={slug} />;
}
