"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ROLE_LABEL } from "@/lib/constants";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };
type ActionDef = { key: string; label: string; page: string };
type Member = {
  id: string; name: string; username: string; role: string; active: boolean;
  rolePages: string[]; additionalPages: string[];
  roleActions: string[]; additionalActions: string[];
  lastUpdated: string | null;
};

/**
 * Owner-configurable additive access — page visibility (effectivePageAccess
 * in src/lib/pageAccess.ts) and, one level below it, individual
 * transactions (hasActionAccess in src/lib/actionAccess.ts: create/edit/
 * delete/financial-write, wherever a page actually has distinct ones —
 * Dashboard/Analytics/Auditor/Calendar don't, so they show no action list).
 * Both are additive only, on top of the member's base role; neither ever
 * narrows what the role already grants, since nothing else in this app's
 * RBAC supports an explicit deny to build one on top of.
 */
export function AccessManagementTab() {
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [grantablePages, setGrantablePages] = useState<string[]>([]);
  const [grantableActions, setGrantableActions] = useState<ActionDef[]>([]);
  const [navItems, setNavItems] = useState<NavItem[]>([]);
  const [managing, setManaging] = useState<Member | null>(null);

  async function load() {
    const res = await fetch("/api/access-management/members");
    if (!res.ok) { toast("Couldn't load members.", true); return; }
    const j = await res.json();
    setMembers(j.members);
    setGrantablePages(j.grantablePages);
    setGrantableActions(j.grantableActions ?? []);
    setNavItems(j.navItems);
  }
  useEffect(() => { load(); }, []);

  function label(href: string) {
    return navItems.find((n) => n.href === href)?.label ?? href;
  }

  if (!members) return <div className="card h-40 animate-pulse p-4" />;

  return (
    <div>
      <p className="mb-4 text-[13px] text-[var(--gray)]">
        Every member starts with their role&apos;s own default pages and transactions. Grant more here to give one person
        access beyond their role — e.g. letting a Booker see Analytics, or a Housekeeping account delete a booking —
        without creating a whole new role for it.
      </p>
      <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-2)] text-left text-[11.5px] font-bold uppercase tracking-wide text-[var(--gray)]">
            <tr>
              <th className="px-4 py-2.5">Member</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Additional access</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {members.map((m) => {
              const totalAdditional = m.additionalPages.length + m.additionalActions.length;
              return (
                <tr key={m.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--bg-2)] text-[12px] font-bold text-[var(--ink)]">
                        {initials(m.name)}
                      </span>
                      <div>
                        <div className="font-semibold text-[var(--ink)]">{m.name}</div>
                        <div className="text-[11.5px] text-[var(--gray)]">@{m.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--gray)]">{ROLE_LABEL[m.role] ?? m.role}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", m.active ? "bg-teal/10 text-teal" : "bg-[var(--bg-2)] text-[var(--gray)]")}>
                      {m.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {m.role === "OWNER_ADMIN" ? (
                      <span className="text-[12.5px] text-[var(--gray)]">Full access (Owner/Admin)</span>
                    ) : totalAdditional === 0 ? (
                      <span className="text-[12.5px] text-[var(--gray)]">None</span>
                    ) : (
                      <span className="text-[12.5px] font-semibold text-[var(--ink)]">
                        +{totalAdditional} permission{totalAdditional === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.role !== "OWNER_ADMIN" && (
                      <button onClick={() => setManaging(m)} className="rounded-lg border border-[var(--line-2)] px-3 py-1.5 text-[12.5px] font-bold text-[var(--ink)] hover:bg-[var(--bg-2)]">
                        Manage access
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {managing && (
        <ManageAccessModal
          member={managing}
          grantablePages={grantablePages}
          grantableActions={grantableActions}
          label={label}
          onClose={() => setManaging(null)}
          onSaved={(additionalPages, additionalActions) => {
            setMembers((prev) => prev && prev.map((m) => (m.id === managing.id ? { ...m, additionalPages, additionalActions } : m)));
            setManaging(null);
          }}
        />
      )}
    </div>
  );
}

function ManageAccessModal({
  member, grantablePages, grantableActions, label, onClose, onSaved,
}: {
  member: Member; grantablePages: string[]; grantableActions: ActionDef[]; label: (href: string) => string;
  onClose: () => void; onSaved: (additionalPages: string[], additionalActions: string[]) => void;
}) {
  const toast = useToast();
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set(member.additionalPages));
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set(member.additionalActions));
  const [saving, setSaving] = useState(false);

  const addedPageCount = [...selectedPages].filter((p) => !member.rolePages.includes(p)).length;
  const addedActionCount = [...selectedActions].filter((a) => !member.roleActions.includes(a)).length;
  const addedCount = addedPageCount + addedActionCount;

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/access-management/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages: [...selectedPages], actions: [...selectedActions] }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { toast(j.error ?? "Couldn't save access.", true); return; }
    toast(`Access updated — ${member.name} now has ${addedCount} additional permission${addedCount === 1 ? "" : "s"}.`);
    onSaved(j.additionalPages ?? [...selectedPages], j.additionalActions ?? [...selectedActions]);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Manage access — ${member.name}`}
      sub={`Base role: ${ROLE_LABEL[member.role] ?? member.role}`}
      maxWidth={560}
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-[12.5px] font-semibold text-[var(--gray)]">
            {addedCount} additional permission{addedCount === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-[13px] font-bold text-[var(--gray)] hover:bg-[var(--bg-2)]">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save changes"}</button>
          </div>
        </div>
      }
    >
      <div className="mb-3 text-[12.5px] text-[var(--gray)]">
        Pages and transactions already included in <strong>{ROLE_LABEL[member.role] ?? member.role}</strong> are checked and locked — grant more below.
      </div>
      <div className="space-y-1.5">
        {grantablePages.map((page) => {
          const pageIncluded = member.rolePages.includes(page);
          const pageChecked = pageIncluded || selectedPages.has(page);
          const pageActions = grantableActions.filter((a) => a.page === page);

          return (
            <div key={page} className={cn("rounded-xl border border-[var(--line)]", pageIncluded ? "bg-[var(--bg-2)]" : "bg-[var(--card)]")}>
              <label className="flex items-center justify-between px-3 py-2.5">
                <span className="text-[13.5px] font-semibold text-[var(--ink)]">{label(page)}</span>
                <span className="flex items-center gap-2">
                  {pageIncluded && <span className="text-[11px] font-semibold text-[var(--gray)]">Inherited</span>}
                  <input
                    type="checkbox"
                    checked={pageChecked}
                    disabled={pageIncluded}
                    onChange={(e) => {
                      setSelectedPages((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(page); else next.delete(page);
                        return next;
                      });
                      // Unchecking page access removes any of its
                      // page-scoped action grants too — an action grant
                      // with no way to reach the page is dead weight the
                      // Owner never asked for.
                      if (!e.target.checked) {
                        setSelectedActions((prev) => {
                          const next = new Set(prev);
                          for (const a of pageActions) next.delete(a.key);
                          return next;
                        });
                      }
                    }}
                    className="h-4 w-4 accent-[var(--skin-primary,#6c5ce7)]"
                  />
                </span>
              </label>

              {pageChecked && pageActions.length > 0 && (
                <div className="space-y-1 border-t border-[var(--line)] px-3 py-2">
                  {pageActions.map((action) => {
                    const actionIncluded = member.roleActions.includes(action.key);
                    const actionChecked = actionIncluded || selectedActions.has(action.key);
                    return (
                      <label key={action.key} className="flex items-center justify-between py-1 pl-3">
                        <span className="text-[12.5px] text-[var(--ink)]">{action.label}</span>
                        <span className="flex items-center gap-2">
                          {actionIncluded && <span className="text-[10.5px] font-semibold text-[var(--gray)]">Inherited</span>}
                          <input
                            type="checkbox"
                            checked={actionChecked}
                            disabled={actionIncluded}
                            onChange={(e) => {
                              setSelectedActions((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(action.key); else next.delete(action.key);
                                return next;
                              });
                            }}
                            className="h-3.5 w-3.5 accent-[var(--skin-primary,#6c5ce7)]"
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
