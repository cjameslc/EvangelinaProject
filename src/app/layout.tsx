import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";
import { BottomNav } from "@/components/layout/BottomNav";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { AIAssistantWidget } from "@/components/guest/AIAssistantWidget";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { DeploymentBanner } from "@/components/layout/DeploymentBanner";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import { manilaDayStart } from "@/lib/format";
import { getCachedActiveUnitCount } from "@/lib/bookingEngine/unitsCache";
import { getCachedActiveSkinId } from "@/lib/bookingEngine/settingsCache";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope" });

// Deliberately static, not per-session — a getCurrentUser()/cookies() read
// here (tried and reverted) forces the whole route tree dynamic, which
// silently knocked every static-prerendered guest guidebook page
// (/guide/welcome, /guide/amenities, etc.) off static rendering too. Owner
// branding for the browser tab/footer isn't worth that guest-facing cost;
// the nav bar (Navbar.tsx, a Client Component reading useSession()) is
// where per-owner branding actually shows up instead.
export const metadata: Metadata = {
  title: "Evangelina's Staycation",
  description: "Bookings, calendar, housekeeping and admin for Evangelina's Staycation units.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Evangelina's" },
};

// viewportFit: "cover" lets the app draw under the iPhone notch/home
// indicator so env(safe-area-inset-*) has something real to react to.
export const viewport: Viewport = {
  themeColor: "#ff385c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Admin -> Units is the single source of truth — never hardcode the count,
  // it must track whatever's actually configured there. Cached (see
  // getCachedActiveUnitCount) since this renders on every single page.
  const unitCount = await getCachedActiveUnitCount().catch(() => 0);
  // Seasonal Skin System (src/lib/skins/) — resolved once here (Manual >
  // Scheduled > Evangelina Violet default) and set directly on <html> so
  // every page's CSS picks up the right [data-skin="..."] token overrides
  // from the very first server-rendered byte, no client flash. Falls back
  // to the permanent default on any error rather than ever blocking the app.
  const skinId = await getCachedActiveSkinId().catch(() => "evangelina" as const);

  return (
    <html lang="en" className={manrope.variable} data-skin={skinId}>
      <body className="font-sans antialiased">
        <Providers skinId={skinId}>
          <ServiceWorkerRegister />
          <div className="sticky top-0 z-40">
            <OfflineBanner />
            <ImpersonationBanner />
            <DeploymentBanner />
            <Navbar />
          </div>
          <main className="pb-16 md:pb-0">{children}</main>
          <InstallPrompt />
          <footer className="mb-16 mt-14 border-t border-[var(--line)] bg-[var(--bg-2)] md:mb-0">
            <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-[13px] text-[var(--gray)]">
              <span>© {manilaDayStart().getUTCFullYear()} Evangelina&rsquo;s Staycation</span>
              <span>Cubao, Quezon City · {unitCount} unit{unitCount !== 1 ? "s" : ""}</span>
            </div>
          </footer>
          <BottomNav />
          <AIAssistantWidget />
        </Providers>
      </body>
    </html>
  );
}
