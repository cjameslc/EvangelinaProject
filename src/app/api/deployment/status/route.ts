import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getCachedActiveDeploymentEvent } from "@/lib/deployment";

function serialize(event: NonNullable<Awaited<ReturnType<typeof getCachedActiveDeploymentEvent>>>) {
  return {
    ...event,
    affectedModules: event.affectedModules ? (JSON.parse(event.affectedModules) as string[]) : [],
  };
}

// Polled by every staff page's DeploymentBanner — any authenticated role
// may read it, this is informational only. See getCachedActiveDeploymentEvent()
// for the lazy SCHEDULED->IN_PROGRESS / ->COMPLETED auto-transition this
// call can trigger, and why it's cached (real traffic evidence of this
// being the dominant source of request volume app-wide).
export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  const event = await getCachedActiveDeploymentEvent();
  return NextResponse.json(event ? serialize(event) : null);
}
