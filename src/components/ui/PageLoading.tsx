// Next.js renders this automatically (via the App Router's loading.tsx
// convention) the instant a navigation starts, streamed in before the
// destination route's server-side data fetch resolves — so the nav bar
// stays interactive and the user gets immediate feedback instead of a
// frozen screen while a page's Prisma queries run.
export function PageLoading({ cards = 3 }: { cards?: number }) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="mb-5 h-6 w-40 animate-pulse rounded-lg bg-[var(--bg-2)]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="card h-20 animate-pulse bg-[var(--bg-2)]" />
        ))}
      </div>
      <div className="mt-4 card h-72 animate-pulse bg-[var(--bg-2)]" />
    </div>
  );
}
