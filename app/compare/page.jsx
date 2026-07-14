import ComparePost from '@/components/ComparePost';

export default function ComparePage() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Compare Posts</h1>
        <p className="text-gray-500">
          Search for up to two posts to compare their cumulative view growth.
        </p>
      </div>

      <ComparePost />
    </div>
  );
}
