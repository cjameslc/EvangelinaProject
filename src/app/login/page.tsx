"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if ((res as any)?.error) {
      setError("Incorrect username or password.");
      return;
    }

    const cb = searchParams?.get("callbackUrl");
    router.push(cb ?? "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-[calc(100vh-60px)] items-center justify-center px-4 py-14">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo.jpg" alt="Evangelina's Staycation" className="h-16 w-16 rounded-2xl object-cover shadow-s" />
          <h1 className="text-2xl font-extrabold tracking-tight">Evangelina&rsquo;s Staycation</h1>
          <p className="text-sm text-[var(--gray)]">Sign in to manage bookings, housekeeping and units.</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div className="space-y-1.5">
            <label className="field-label">Username</label>
            <input type="text" autoCapitalize="none" autoCorrect="off" required value={username} onChange={(e) => setUsername(e.target.value)} className="field-input" placeholder="yourusername" />
          </div>
          <div className="space-y-1.5">
            <label className="field-label">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" placeholder="••••••••" />
          </div>
          {error && <p className="text-[13px] font-semibold text-rausch">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
