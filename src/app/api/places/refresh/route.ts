import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, logAudit } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";
import { isPlacesApiConfigured } from "@/lib/places/googlePlacesClient";
import { refreshCategoryInsights } from "@/lib/places/placeInsightService";
import { GUIDEBOOK_CATEGORIES, type GuidebookCategory } from "@/lib/guidebookContent";

/** Admin-triggered only, never scheduled — each call is a real, billed
 * Google Places API request per place in the category. Rate-limited on top
 * of the OWNER_ADMIN gate since a client-side double-click or retry loop
 * could otherwise burn through quota/cost for no reason. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;

  if (!isPlacesApiConfigured()) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY is not configured on the server." }, { status: 400 });
  }

  const limited = rateLimit(`places-refresh:${user.id}`, 10, 10 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many refresh requests — please slow down." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const category = typeof body?.category === "string" ? body.category : "";
  if (!category) return NextResponse.json({ error: "Missing category." }, { status: 400 });

  const settings = await prisma.settings.findUnique({ where: { id: 1 }, select: { guidebookCategories: true } });
  const categories = (settings?.guidebookCategories as unknown as GuidebookCategory[] | null) ?? GUIDEBOOK_CATEGORIES;
  const match = categories.find((c) => c.key === category);
  if (!match) return NextResponse.json({ error: "Unknown category." }, { status: 404 });

  const results = await refreshCategoryInsights(category, match.items);
  await logAudit(user.id, "places.refresh", "PlaceInsight", category, { count: results.length, failed: results.filter((r) => !r.ok).length });
  return NextResponse.json({ results });
}
