"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { ROLE_LABEL } from "@/lib/constants";
import { initials, fmtDate } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { LogoutIcon } from "@/components/ui/Icons";

const AVATAR_COLORS = ["#FF385C", "#6C5CE7", "#0B7C74", "#3B71E8", "#C87D00", "#008A05", "#111111"];

type Unit = { id: string; name: string; shortName: string };
type ProfileUser = {
  id: string; name: string; email: string; role: string; avatarColor: string; createdAt: string;
  ownedUnits: { unit: Unit }[];
};

export function ProfileView({ user }: { user: ProfileUser }) {
  const { update } = useSession();
  const toast = useToast();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [savingInfo, setSavingInfo] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveInfo() {
    setSavingInfo(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, avatarColor }),
    });
    const j = await res.json().catch(() => ({}));
    setSavingInfo(false);
    if (!res.ok) { toast(j.error ?? "Couldn't save your info", true); return; }
    await update({ name, email, avatarColor });
    toast("Profile updated ✓");
  }

  async function changePassword() {
    if (!currentPassword) { toast("Enter your current password", true); return; }
    if (newPassword.length < 6) { toast("New password must be at least 6 characters", true); return; }
    if (newPassword !== confirmPassword) { toast("New passwords don't match", true); return; }

    setSavingPassword(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const j = await res.json().catch(() => ({}));
    setSavingPassword(false);
    if (!res.ok) { toast(j.error ?? "Couldn't change your password", true); return; }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast("Password changed ✓");
  }

  return (
    <div className="mx-auto max-w-[640px] px-4 py-9 sm:px-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">Profile</h1>
        <p className="mt-1 text-[14.5px] text-[var(--gray)]">Your account info, password, and preferences.</p>
      </div>

      <div className="card mb-5 flex items-center gap-4 p-5">
        <span className="grid h-16 w-16 flex-none place-items-center rounded-full text-[20px] font-bold text-white" style={{ background: avatarColor }}>
          {initials(name)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[18px] font-extrabold">{user.name}</div>
          <div className="truncate text-[13.5px] text-[var(--gray)]">{user.email}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-rausch/10 px-2.5 py-1 text-[11.5px] font-bold text-rausch">{ROLE_LABEL[user.role] ?? user.role}</span>
            <span className="text-[11.5px] text-[var(--gray)]">Member since {fmtDate(user.createdAt, { month: "long", year: "numeric" })}</span>
          </div>
        </div>
      </div>

      {user.role === "CO_OWNER" && (
        <div className="card mb-5 p-5">
          <h2 className="mb-1 text-[15px] font-extrabold">Units you own</h2>
          <p className="mb-3 text-[12.5px] text-[var(--gray)]">These are the only units you can see across the app.</p>
          {user.ownedUnits.length === 0 ? (
            <p className="text-[13px] text-[var(--gray)]">No units assigned yet — ask an Owner/Admin to assign one in Admin → Units.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {user.ownedUnits.map((o) => (
                <span key={o.unit.id} className="rounded-full bg-[var(--bg-2)] px-2.5 py-1 text-[12.5px] font-semibold">{o.unit.shortName}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card mb-5 space-y-4 p-5">
        <h2 className="text-[15px] font-extrabold">Your info</h2>
        <div>
          <label className="field-label">Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field-input mt-1.5" />
        </div>
        <div>
          <label className="field-label">Avatar color</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAvatarColor(c)}
                aria-label={`Use avatar color ${c}`}
                className={cn("h-8 w-8 rounded-full border-2 transition", avatarColor === c ? "border-[var(--ink)]" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <button onClick={saveInfo} disabled={savingInfo} className="btn-primary">{savingInfo ? "Saving…" : "Save changes"}</button>
      </div>

      <div className="card mb-5 space-y-4 p-5">
        <h2 className="text-[15px] font-extrabold">Change password</h2>
        <div>
          <label className="field-label">Current password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="field-input mt-1.5" placeholder="••••••••" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">New password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="field-input mt-1.5" placeholder="min. 6 characters" />
          </div>
          <div>
            <label className="field-label">Confirm new password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="field-input mt-1.5" placeholder="min. 6 characters" />
          </div>
        </div>
        <button onClick={changePassword} disabled={savingPassword} className="btn-primary">{savingPassword ? "Saving…" : "Change password"}</button>
      </div>

      <button onClick={() => signOut({ callbackUrl: "/login" })} className="btn w-full justify-center">
        <LogoutIcon className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
