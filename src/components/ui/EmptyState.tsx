export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-6 py-11 text-center text-[var(--gray)]">
      <h3 className="mb-1 text-[16px] font-extrabold text-[var(--ink)]">{title}</h3>
      {sub && <p className="text-sm">{sub}</p>}
    </div>
  );
}
