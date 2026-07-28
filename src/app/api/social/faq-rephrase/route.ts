import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireUser } from "@/lib/session";
import { canSeeSocialMedia } from "@/lib/rbac";
import { rephraseFaqAnswer, type FaqRephraseMode } from "@/lib/ai/faqRephrase";
import { rateLimit } from "@/lib/rateLimit";

const getCached = unstable_cache(
  (answer: string, mode: FaqRephraseMode) => rephraseFaqAnswer(answer, mode),
  ["faq-rephrase"],
  { revalidate: 3600 } // FAQ answers are static content — an hour is safe
);

export async function POST(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!canSeeSocialMedia(user.role as any)) return new Response("Forbidden", { status: 403 });

  const limited = rateLimit(`faq-rephrase:${user.id}`, 30, 5 * 60 * 1000);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  const body = await req.json().catch(() => null) as { answer?: string; mode?: FaqRephraseMode } | null;
  if (!body?.answer || (body.mode !== "translate" && body.mode !== "friendly")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await getCached(body.answer, body.mode);
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Couldn't rephrase right now." }, { status: 502 });
  }
}
