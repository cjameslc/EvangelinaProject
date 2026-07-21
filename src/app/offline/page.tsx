export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-rausch/10 text-2xl">📶</div>
      <h1 className="text-lg font-extrabold text-[var(--ink)]">You&rsquo;re offline</h1>
      <p className="text-[13.5px] text-[var(--gray)]">
        This page needs a connection to load. Anything you already opened today — like Housekeeping&rsquo;s
        room list or checklist — still works from where you left off.
      </p>
      <a href="/dashboard" className="btn-primary mt-2">Try again</a>
    </div>
  );
}
