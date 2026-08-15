import { NextRequest, NextResponse } from "next/server";
import { getOwnerBySlug } from "@/lib/ownerScope";

/**
 * Public, unauthenticated — backs Navbar's branding for an anonymous
 * visitor on /o/[ownerSlug]/... (no staff session exists there to read
 * ownerBusinessName/ownerLogoUrl from, unlike the staff-side Navbar
 * branding added earlier). Only ever returns the same handful of already-
 * public fields ListingsGrid/BookFlowView show on that same page — nothing
 * here is sensitive.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });

  const owner = await getOwnerBySlug(slug);
  if (!owner) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ businessName: owner.businessName, logoUrl: owner.logoUrl });
}
