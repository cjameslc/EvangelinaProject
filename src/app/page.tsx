import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeDashboard } from "@/lib/rbac";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (canSeeDashboard(user.role)) redirect("/dashboard");
  if (user.role === "AUDITOR") redirect("/auditor");
  redirect("/bookings");
}
