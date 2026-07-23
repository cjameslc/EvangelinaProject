import { TransitionLink } from "@/components/guest/TransitionLink";

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-[var(--line)] bg-[var(--bg-2)]/60">
        <div className="mx-auto max-w-[900px] px-4 py-3 sm:px-6">
          <TransitionLink href="/" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--gray)] hover:text-rausch">
            ← Guide
          </TransitionLink>
        </div>
      </div>
      {children}
    </div>
  );
}
