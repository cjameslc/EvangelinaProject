import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";
import { manilaDayStart } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "Evangelina's Staycation",
  description: "Bookings, calendar, housekeeping and admin for Evangelina's Staycation units.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Admin -> Units is the single source of truth — never hardcode the count,
  // it must track whatever's actually configured there.
  const unitCount = await prisma.unit.count({ where: { active: true } }).catch(() => 0);

  return (
    <html lang="en" className={manrope.variable}>
      <body className="font-sans antialiased">
        <Providers>
          <Navbar />
          <main>{children}</main>
          <footer className="mt-14 border-t border-[var(--line)] bg-[var(--bg-2)]">
            <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-[13px] text-[var(--gray)]">
              <span>© {manilaDayStart().getUTCFullYear()} Evangelina&rsquo;s Staycation</span>
              <span>Cubao, Quezon City · {unitCount} unit{unitCount !== 1 ? "s" : ""}</span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
