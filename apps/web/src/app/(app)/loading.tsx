// Shown in the persistent shell's content area during navigation. The `delayed-appear` class keeps
// it invisible for ~200ms so fast page loads don't flash an empty skeleton (only slow loads show it).
export default function Loading() {
  return (
    <div className="delayed-appear" aria-busy="true" aria-label="Loading">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-64 rounded-md bg-surface-2" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg border border-border bg-surface-2" />
          ))}
        </div>
        <div className="h-64 rounded-lg border border-border bg-surface-2" />
      </div>
    </div>
  );
}
