"use client";

import { useEffect } from "react";
import "./globals.css";

// Only fires for errors thrown by the root layout itself (e.g. its
// prisma.unit.count() call hitting a transient DB blip) — a regular
// error.tsx can't catch those, since the layout wraps error.tsx too. Next.js
// unmounts the entire root layout when this renders, so it must supply its
// own <html>/<body> and can't rely on Providers/Navbar/fonts from layout.tsx.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
          <div style={{ width: "100%", maxWidth: 420, borderRadius: 20, border: "1px solid #e5e5e5", padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
            <div style={{ margin: "0 auto 16px", display: "grid", height: 48, width: 48, placeItems: "center", borderRadius: "50%", background: "rgba(255,56,92,.1)", fontSize: 24 }}>⚠️</div>
            <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>Something went wrong</h1>
            <p style={{ marginTop: 8, fontSize: 13.5, color: "#717171" }}>
              This is usually temporary — often a brief hiccup reaching the database. Try again in a moment.
            </p>
            <div style={{ marginTop: 20, display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                onClick={() => reset()}
                style={{ background: "#FF385C", color: "#fff", border: "none", borderRadius: 12, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Try again
              </button>
              <a
                href="/"
                style={{ background: "transparent", color: "#222", border: "1px solid #e5e5e5", borderRadius: 12, padding: "10px 18px", fontSize: 14, fontWeight: 700, textDecoration: "none" }}
              >
                Go home
              </a>
            </div>
            {error.digest && <p style={{ marginTop: 16, fontSize: 11, color: "#717171" }}>Reference: {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  );
}
