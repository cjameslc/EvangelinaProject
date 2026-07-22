import Link from "next/link";
import { getCurrentGuest } from "@/lib/guestSession";
import { getGuestProfile } from "@/lib/bookingEngine/guestService";
import { AccountClient } from "@/components/guest/AccountClient";

export default async function AccountPage() {
  const guest = await getCurrentGuest();
  if (!guest) {
    return (
      <div className="mx-auto max-w-[500px] px-4 py-14 text-center">
        <p className="mb-4 text-[15px] text-[var(--gray)]">Sign in to see your account.</p>
        <Link href="/guest-login" className="btn-primary">Sign in</Link>
      </div>
    );
  }

  const profile = await getGuestProfile(guest.id);
  if (!profile) {
    return (
      <div className="mx-auto max-w-[500px] px-4 py-14 text-center">
        <p className="text-[15px] text-[var(--gray)]">Couldn't load your account. Please try again.</p>
      </div>
    );
  }

  return <AccountClient guest={profile} />;
}
