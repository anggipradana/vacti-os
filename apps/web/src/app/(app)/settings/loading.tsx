export default function Loading() {
  return (
    <div className="delayed-appear" aria-busy="true" aria-label="Loading">
      <div className="animate-pulse space-y-4">
        <div className="h-9 w-full max-w-md rounded-md bg-surface-2" />
        <div className="h-48 rounded-lg border border-border bg-surface-2" />
      </div>
    </div>
  );
}
