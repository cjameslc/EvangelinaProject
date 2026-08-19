import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Admin-only campaign configuration: target/rewards/hero image + full
 * participant roster with side assignment. Deliberately its own endpoint
 * rather than folding into the general Employee/Admin routes — this is
 * campaign-scoped config (see CampaignParticipant's own doc comment on why
 * `side` isn't Employee.teamKey), not a payroll or identity change.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireUser(["OWNER_ADMIN"]);
  if (error) return error;
  if (!user.ownerId) return NextResponse.json({ error: "No property selected." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { campaignId, targetPesos, winnerRewardPesos, participantRewardPesos, heroImageUrl, participants } = body as {
    campaignId?: string;
    targetPesos?: number;
    winnerRewardPesos?: number;
    participantRewardPesos?: number;
    heroImageUrl?: string | null;
    participants?: { employeeId: string; side: string }[];
  };
  if (!campaignId || typeof campaignId !== "string") return NextResponse.json({ error: "campaignId is required." }, { status: 400 });

  const campaign = await prisma.gamificationCampaign.findUnique({ where: { id: campaignId }, select: { id: true, ownerId: true, status: true } });
  if (!campaign || campaign.ownerId !== user.ownerId) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.status === "CLOSED") return NextResponse.json({ error: "This campaign is already closed and can't be edited." }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof targetPesos === "number" && targetPesos > 0) data.targetPesos = Math.round(targetPesos);
  if (typeof winnerRewardPesos === "number" && winnerRewardPesos >= 0) data.winnerRewardPesos = Math.round(winnerRewardPesos);
  if (typeof participantRewardPesos === "number" && participantRewardPesos >= 0) data.participantRewardPesos = Math.round(participantRewardPesos);
  if (heroImageUrl !== undefined) data.heroImageUrl = heroImageUrl || null;

  if (Array.isArray(participants)) {
    const validSides = new Set(["A", "B"]);
    const clean = participants.filter((p) => p && typeof p.employeeId === "string" && validSides.has(p.side));
    const employeeIds = clean.map((p) => p.employeeId);
    // Only employees that actually belong to this owner may be added — a
    // raw API call can't slip in a cross-tenant employeeId.
    const validEmployees = employeeIds.length
      ? await prisma.employee.findMany({ where: { id: { in: employeeIds }, ownerId: user.ownerId }, select: { id: true } })
      : [];
    const validIds = new Set(validEmployees.map((e) => e.id));
    const finalParticipants = clean.filter((p) => validIds.has(p.employeeId));

    await prisma.$transaction([
      prisma.gamificationCampaign.update({ where: { id: campaignId }, data }),
      prisma.campaignParticipant.deleteMany({ where: { campaignId, employeeId: { notIn: finalParticipants.map((p) => p.employeeId) } } }),
      ...finalParticipants.map((p) =>
        prisma.campaignParticipant.upsert({
          where: { campaignId_employeeId: { campaignId, employeeId: p.employeeId } },
          update: { side: p.side },
          create: { campaignId, employeeId: p.employeeId, side: p.side },
        })
      ),
    ]);
  } else if (Object.keys(data).length > 0) {
    await prisma.gamificationCampaign.update({ where: { id: campaignId }, data });
  }

  return NextResponse.json({ ok: true });
}
