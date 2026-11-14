/** Shown instantly on every sidebar click while the next page loads. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-56 rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg border border-gray-200 bg-white" />)}
      </div>
      <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-5 rounded bg-gray-100" />)}
      </div>
    </div>
  );
}
