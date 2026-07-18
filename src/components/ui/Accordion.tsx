"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

export function Accordion({
  title,
  sub,
  defaultOpen = true,
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card mb-5 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className={cn("flex w-full items-center gap-3 px-5 py-4 text-left", open && "border-b border-[var(--line)]")}>
        <h2 className="text-[17px] font-extrabold tracking-tight">{title}</h2>
        {sub && <span className="ml-auto text-[13px] font-semibold text-[var(--gray)]">{sub}</span>}
        <ChevronDownIcon className={cn("h-5 w-5 flex-none text-[var(--gray)] transition-transform", open && "rotate-180", !sub && "ml-auto")} />
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}
