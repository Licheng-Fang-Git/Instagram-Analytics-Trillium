import PostView from '@/components/PostView';

export const dynamic = 'force-dynamic';

// Any OTHER 2026 month (August, September, …) resolves here automatically —
// the literal June/ and July/ folders take precedence for those, and this
// catch-all means new months need no new folder. Add a literal month folder
// only if you want it visible in the tree alongside June/July.
export default async function Page({ params }) {
  const { slug } = await params;
  return <PostView slug={slug} />;
}
