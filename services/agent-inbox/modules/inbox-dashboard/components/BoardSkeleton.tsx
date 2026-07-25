// @file: BoardSkeleton — skeleton placeholder mimicking board layout during cold start.
// @consumers: BoardPage
// @tasks: TSK-107

/**
 * @purpose Skeleton placeholder shown while the board loads — mimics role blocks, lanes,
 *   and unassigned section so users see structure instead of false zeros.
 */
export function BoardSkeleton() {
  return (
    <main
      className="mx-auto max-w-[1600px] p-4 space-y-3"
      role="status"
      aria-label="Loading dashboard"
    >
      {/* Awaiting queue skeleton */}
      <section
        className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] p-3"
        aria-label="Loading awaiting queue"
      >
        <div className="animate-pulse bg-muted rounded h-4 w-28 mb-2" />
        <div className="animate-pulse bg-muted rounded h-3 w-full" />
      </section>

      {/* 3 role block skeletons */}
      {[1, 2, 3].map((i) => (
        <section
          key={i}
          className="rounded-lg border bg-card shadow-sm"
          aria-label="Loading role block"
        >
          <div className="px-3 py-2">
            <div className="animate-pulse bg-muted rounded h-3.5 w-20" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-2.5 pt-0.5">
            {[1, 2, 3, 4].map((j) => (
              <div key={j}>
                <div className="animate-pulse bg-muted rounded h-3 w-12 mb-1.5" />
                <div className="animate-pulse bg-muted rounded h-16" />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Unassigned block skeleton */}
      <section
        className="rounded-lg border border-dashed bg-card/50 shadow-sm"
        aria-label="Loading unassigned block"
      >
        <div className="px-3 py-2">
          <div className="animate-pulse bg-muted rounded h-3.5 w-20" />
        </div>
        <div className="p-2.5 pt-0.5">
          <div className="animate-pulse bg-muted rounded h-3 w-48" />
        </div>
      </section>
    </main>
  );
}
