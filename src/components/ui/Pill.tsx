import { cn } from "@/lib/utils";

export function Pill({ on, color, onClick, children, type = "button" }: { on: boolean; color?: string; onClick?: () => void; children: React.ReactNode; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} className={cn("pill", on && "on")}>
      {color && <span className="h-2 w-2 flex-none rounded-full" style={{ background: on ? "currentColor" : color }} />}
      {children}
    </button>
  );
}
