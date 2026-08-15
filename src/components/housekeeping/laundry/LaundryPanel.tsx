"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { hasActionAccess } from "@/lib/actionAccess";
import { LaundryDashboard } from "./LaundryDashboard";
import { LaundryOrdersList } from "./LaundryOrdersList";
import { LaundryOrderForm } from "./LaundryOrderForm";
import { LaundryOrderDetail } from "./LaundryOrderDetail";
import { LaundryServicesPanel } from "./LaundryServicesPanel";
import { LaundryReports } from "./LaundryReports";
import type { LaundryOrder, LaundryOrderDetail as LaundryOrderDetailType, LaundryServiceRow, LaundryDashboardData, LaundryReportsData } from "./types";

type Unit = { id: string; name: string; shortName: string; unitNumber: string };

const TABS = ["Dashboard", "Orders", "Services", "Reports"] as const;
type Tab = (typeof TABS)[number];

/**
 * Laundry Management — lives inside the Housekeeping module's own Accordion
 * grid (see HousekeepingView.tsx), not a separate nav item, per the spec.
 * Data is fetched lazily on first open (not part of the Housekeeping page's
 * server-side load) since it's a genuinely separate, heavier concern most
 * staff won't touch every visit — same "fetch on demand" pattern already
 * used by Admin's PlaceInsightsPanel.
 */
export function LaundryPanel({ role, units, additionalActionAccess = [] }: { role: string; units: Unit[]; additionalActionAccess?: string[] }) {
  const [tab, setTab] = useState<Tab>("Dashboard");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [services, setServices] = useState<LaundryServiceRow[]>([]);
  const [dashboard, setDashboard] = useState<LaundryDashboardData | null>(null);
  const [reports, setReports] = useState<LaundryReportsData | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<LaundryOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<LaundryOrderDetailType | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const canEdit = hasActionAccess("housekeeping.edit", role, additionalActionAccess);
  const canPay = hasActionAccess("housekeeping.financial", role, additionalActionAccess);
  const canManageServices = role === "OWNER_ADMIN";

  async function loadAll() {
    setLoading(true);
    const [ordersRes, servicesRes, dashboardRes, reportsRes] = await Promise.all([
      fetch("/api/housekeeping/laundry/orders"),
      fetch("/api/housekeeping/laundry/services"),
      fetch("/api/housekeeping/laundry/dashboard"),
      fetch("/api/housekeeping/laundry/reports"),
    ]);
    if (ordersRes.ok) setOrders(await ordersRes.json());
    if (servicesRes.ok) setServices(await servicesRes.json());
    if (dashboardRes.ok) setDashboard(await dashboardRes.json());
    if (reportsRes.ok) setReports(await reportsRes.json());
    setLoading(false);
    setLoaded(true);
  }

  useEffect(() => {
    loadAll();
    // Fetch once, on mount of this panel (the Accordion it lives in is
    // already collapsed by default, so this only runs once a staff member
    // actually opens "Laundry Management").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openOrder(id: string) {
    const res = await fetch(`/api/housekeeping/laundry/orders/${id}`);
    if (!res.ok) return;
    setDetailOrder(await res.json());
    setDetailOpen(true);
  }

  function handleChanged() {
    loadAll();
    if (detailOrder) openOrder(detailOrder.id);
  }

  if (!loaded && loading) {
    return <div className="grid h-[200px] place-items-center text-[13px] text-[var(--gray)]">Loading laundry data…</div>;
  }

  return (
    <div>
      <div className="mb-4 inline-flex gap-1 rounded-full bg-[var(--bg-2)] p-1">
        {TABS.filter((t) => t !== "Services" || canManageServices).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-bold transition", tab === t ? "bg-[var(--card)] shadow-s" : "text-[var(--gray)]")}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Dashboard" && dashboard && <LaundryDashboard data={dashboard} onOpenOrder={openOrder} />}
      {tab === "Orders" && (
        <LaundryOrdersList
          orders={orders}
          onNewOrder={() => { setEditingOrder(null); setFormOpen(true); }}
          onOpenOrder={openOrder}
        />
      )}
      {tab === "Services" && canManageServices && <LaundryServicesPanel services={services} canEdit={canManageServices} onChanged={loadAll} />}
      {tab === "Reports" && reports && <LaundryReports data={reports} onOpenOrder={openOrder} />}

      <LaundryOrderForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); loadAll(); }}
        order={editingOrder}
        services={services}
        units={units}
      />

      <LaundryOrderDetail
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        order={detailOrder}
        canEdit={canEdit}
        canPay={canPay}
        onChanged={handleChanged}
        onEdit={() => {
          setEditingOrder(detailOrder);
          setDetailOpen(false);
          setFormOpen(true);
        }}
      />
    </div>
  );
}
