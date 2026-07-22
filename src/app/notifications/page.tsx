import Link from "next/link";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestNotifications, markNotificationsRead } from "@/lib/bookingEngine/guestService";
import { fmtDate, fmtTime } from "@/lib/format";

export default async function NotificationsPage() {
  const guest = await getCurrentGuest();
  if (!guest) {
    return (
      <div className="mx-auto max-w-[500px] px-4 py-14 text-center">
        <p className="mb-4 text-[15px] text-[var(--gray)]">Sign in to see your notifications.</p>
        <Link href="/guest-login" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  const notifications = await getGuestNotifications(guest.id);
  await markNotificationsRead(guest.id).catch(() => {});

  return (
    <div className="mx-auto max-w-[600px] px-4 py-9 sm:px-6">
      <h1 className="text-[22px] font-extrabold tracking-tight">Notifications</h1>

      {notifications.length === 0 ? (
        <p className="mt-8 text-center text-[14px] text-[var(--gray)]">Nothing yet — booking updates will show up here.</p>
      ) : (
        <div className="mt-5 space-y-2.5">
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={n.bookingId ? `/my-bookings/${n.bookingId}` : "/my-bookings"}
              className={`card block p-4 transition hover:border-[var(--ink)] ${!n.read ? "border-rausch/30 bg-rausch/5" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-semibold">{n.message}</p>
                {!n.read && <span className="mt-1 h-2 w-2 flex-none rounded-full bg-rausch" />}
              </div>
              <div className="mt-1 text-[11.5px] text-[var(--gray)]">
                {fmtDate(n.createdAt, { month: "short", day: "numeric" })} · {fmtTime(n.createdAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
