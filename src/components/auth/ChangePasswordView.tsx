"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export function ChangePasswordView({ username }: { username: string }) {
  const { update } = useSession();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setError("New passwords don't match."); return; }

    setLoading(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(j.error ?? "Couldn't change your password."); return; }

    await update({ mustChangePassword: false });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-[calc(100vh-60px)] items-center justify-center px-4 py-14">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/logo.jpg" alt="Evangelina's Staycation" className="h-16 w-16 rounded-2xl object-cover shadow-s" />
          <h1 className="text-2xl font-extrabold tracking-tight">Set a new password</h1>
          <p className="text-sm text-[var(--gray)]">
            Signed in as @{username}. For security, you need to change your password before continuing.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div className="space-y-1.5">
            <label className="field-label">Current password</label>
            <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="field-input" placeholder="••••••••" />
          </div>
          <div className="space-y-1.5">
            <label className="field-label">New password</label>
            <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="field-input" placeholder="min. 6 characters" />
          </div>
          <div className="space-y-1.5">
            <label className="field-label">Confirm new password</label>
            <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="field-input" placeholder="min. 6 characters" />
          </div>
          {error && <p className="text-[13px] font-semibold text-rausch">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
