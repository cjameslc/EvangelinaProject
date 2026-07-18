"use client";

import { useState } from "react";
import { UnitsTab } from "./UnitsTab";
import { UsersTab } from "./UsersTab";
import { SettingsTab } from "./SettingsTab";
import { ChecklistTab } from "./ChecklistTab";
import { LoginLogsTab } from "./LoginLogsTab";
import { cn } from "@/lib/utils";

const TABS = ["Units", "Users & roles", "Housekeeping checklist", "Login logs", "Settings"] as const;

export function AdminView({ units: initialUnits, users: initialUsers, settings, loginLogs }: { units: any[]; users: any[]; settings: any; loginLogs: any[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Units");
  const [units, setUnits] = useState(initialUnits);
  const [users, setUsers] = useState(initialUsers);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-9 sm:px-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-extrabold tracking-tight sm:text-[30px]">Admin</h1>
        <p className="mt-1 text-[14.5px] text-[var(--gray)]">Manage units, staff accounts, roles, and site-wide settings.</p>
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] p-1.5">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("whitespace-nowrap rounded-xl px-4 py-2 text-[13px] font-bold transition", tab === t ? "bg-rausch text-white" : "text-[var(--gray)] hover:bg-[var(--bg-2)]")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Units" && <UnitsTab units={units} onUnitsChange={setUnits} ownerCandidates={users.filter((u: any) => u.role === "CO_OWNER" || u.role === "OWNER_ADMIN")} />}
      {tab === "Users & roles" && <UsersTab users={users} onUsersChange={setUsers} units={units} />}
      {tab === "Housekeeping checklist" && <ChecklistTab initial={settings.checklistGroups ?? []} />}
      {tab === "Login logs" && <LoginLogsTab logs={loginLogs} />}
      {tab === "Settings" && <SettingsTab initial={settings} />}
    </div>
  );
}
