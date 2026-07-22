"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Guest = { id: string; email: string; name: string | null; phone: string | null; emailNotifications: boolean };

export function AccountClient({ guest }: { guest: Guest }) {
  const router = useRouter();
  const [name, setName] = useState(guest.name ?? "");
  const [phone, setPhone] = useState(guest.phone ?? "");
  const [emailNotifications, setEmailNotifications] = useState(guest.emailNotifications);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/guest/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, emailNotifications }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
    } catch {
      setError("Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await fetch("/api/guest/auth/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[500px] px-4 py-9 sm:px-6">
      <h1 className="text-[22px] font-extrabold tracking-tight">My account</h1>

      <form onSubmit={save} className="card mt-5 space-y-4 p-5">
        <div>
          <label htmlFor="account-email" className="field-label">Email</label>
          <input id="account-email" value={guest.email} disabled className="field-input mt-1 opacity-60" />
          <p className="mt-1 text-[12px] text-[var(--gray)]">You sign in with an email link — there&apos;s no password to manage.</p>
        </div>
        <div>
          <label htmlFor="account-name" className="field-label">Full name</label>
          <input id="account-name" value={name} onChange={(e) => setName(e.target.value)} className="field-input mt-1" />
        </div>
        <div>
          <label htmlFor="account-phone" className="field-label">Phone</label>
          <input id="account-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="field-input mt-1" />
        </div>
        <label className="flex items-center gap-2.5 text-[13.5px] font-semibold">
          <input type="checkbox" checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} className="h-4 w-4" />
          Email me about booking updates
        </label>
        {error && <p className="text-[13px] font-semibold text-red-600">{error}</p>}
        <button type="submit" disabled={saving} className="btn-primary w-full justify-center">{saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}</button>
      </form>

      <button onClick={signOut} className="btn btn-sm mt-4 w-full justify-center text-rausch">Sign out</button>
    </div>
  );
}
