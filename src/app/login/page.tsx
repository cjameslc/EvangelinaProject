"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if ((res as any)?.error) {
      setError("Incorrect email or password.");
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
          <svg viewBox="0 0 32 32" className="h-10 w-10 text-rausch">
            <path d="M16 3 4 13v15a1 1 0 0 0 1 1h8v-8h6v8h8a1 1 0 0 0 1-1V13L16 3Z" fill="currentColor" />
          </svg>
          <h1 className="text-2xl font-extrabold tracking-tight">Evangelina&rsquo;s Staycation</h1>
          <p className="text-sm text-[var(--gray)]">Sign in to manage bookings, housekeeping and units.</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div className="space-y-1.5">
            <label className="field-label">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" placeholder="you@evangelinas.ph" />
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
