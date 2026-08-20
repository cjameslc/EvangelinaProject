import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  computeDailySeries, computeMilestones, computeTeamBattle, computeWinner,
  deriveAchievements, motivationForViewer, rankParticipants,
} from "@/lib/campaignEngine/campaign";
import { computeBookerTotals } from "@/lib/campaignEngine/profit";
import type { CampaignBooking, CampaignDashboardData, CampaignParticipantInput } from "@/lib/campaignEngine/types";

const DEFAULT_TARGET_PESOS = 250_000;
const DEFAULT_WINNER_REWARD_PESOS = 15_000;
const DEFAULT_PARTICIPANT_REWARD_PESOS = 1_500;

/** First-of-month UTC-midnight boundary for a given Manila calendar month — same bare-UTC-day convention every Booking.date boundary in this app already uses (no timezone conversion needed since Booking.date is itself a UTC-midnight-anchored Manila day). */
function monthStart(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, 1));
}
function nextMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
function currentManilaMonthStart(): Date {
  const manilaNow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(new Date());
  const [y, m] = manilaNow.split("-").map(Number);
  return monthStart(y, m);
}

/**
 * Finds (or lazily creates, or lazily closes) the campaign for the
 * requested period, then computes the full live dashboard. No cron —
 * "October automatically creates a new campaign" and "freeze at month end"
 * both happen the first time this route is hit after the relevant moment,
 * same lazy-upsert pattern this codebase already uses (see Settings.upsert
 * in leaderboard/route.ts).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireUser();
  if (error) return error;
  if (!user.ownerId) return NextResponse.json({ error: "No property selected." }, { status: 400 });

  const periodParam = req.nextUrl.searchParams.get("period"); // "YYYY-MM-01", optional — for browsing past campaigns
  let periodStart: Date;
  if (periodParam && /^\d{4}-\d{2}-01$/.test(periodParam)) {
    const [y, m] = periodParam.split("-").map(Number);
    periodStart = monthStart(y, m);
  } else {
    periodStart = currentManilaMonthStart();
  }
  const periodEnd = nextMonthStart(periodStart);
  const now = new Date();

  let campaign = await prisma.gamificationCampaign.findUnique({
    where: { ownerId_periodStart: { ownerId: user.ownerId, periodStart } },
  });

  if (!campaign) {
    // Only auto-create the CURRENT (or a future) period on demand — never
    // fabricate a campaign for a past month nobody configured, that would
    // show a misleading "0% of ₱250,000" for a month before this feature
    // even existed.
    if (periodStart.getTime() < currentManilaMonthStart().getTime()) {
      return NextResponse.json({ campaign: null });
    }
    // Inherit config + roster from the most recent prior campaign, if any
    // — a real admin shouldn't have to re-enter target/rewards/roster every
    // month. Falls back to the brief's own September defaults only when
    // this is genuinely the first campaign ever for this property.
    const prior = await prisma.gamificationCampaign.findFirst({
      where: { ownerId: user.ownerId, periodStart: { lt: periodStart } },
      orderBy: { periodStart: "desc" },
      include: { participants: true },
    });
    const monthName = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(periodStart);
    campaign = await prisma.gamificationCampaign.create({
      data: {
        ownerId: user.ownerId,
        name: `${monthName} Sales Championship`,
        periodStart,
        periodEnd,
        targetPesos: prior?.targetPesos ?? DEFAULT_TARGET_PESOS,
        winnerRewardPesos: prior?.winnerRewardPesos ?? DEFAULT_WINNER_REWARD_PESOS,
        participantRewardPesos: prior?.participantRewardPesos ?? DEFAULT_PARTICIPANT_REWARD_PESOS,
        heroImageUrl: prior?.heroImageUrl ?? null,
        participants: prior
          ? { create: prior.participants.map((p) => ({ employeeId: p.employeeId, side: p.side })) }
          : undefined,
      },
    });
  }

  const participantRows = await prisma.campaignParticipant.findMany({
    where: { campaignId: campaign.id },
    select: {
      employeeId: true, side: true, finalProfitPesos: true, finalRank: true, rewardPesos: true,
      employee: { select: { name: true, role: true, active: true, userId: true, user: { select: { avatarColor: true, avatarUrl: true } } } },
    },
  });
  const activeParticipants = participantRows.filter((p) => p.employee.active);
  const participants: CampaignParticipantInput[] = activeParticipants.map((p) => ({
    employeeId: p.employeeId,
    name: p.employee.name,
    role: p.employee.role,
    side: p.side,
    avatarColor: p.employee.user?.avatarColor ?? "#6C5CE7",
    avatarUrl: p.employee.user?.avatarUrl ?? null,
  }));
  const employeeIds = participants.map((p) => p.employeeId);

  const bookingsRaw = employeeIds.length
    ? await prisma.booking.findMany({
        where: { unit: { ownerId: user.ownerId }, bookerId: { in: employeeIds }, date: { gte: campaign.periodStart, lt: campaign.periodEnd } },
        select: { bookerId: true, date: true, amount: true, paid: true, dpAmount: true, refundedAt: true },
      })
    : [];
  const bookings: CampaignBooking[] = bookingsRaw as CampaignBooking[];

  const totals = computeBookerTotals(bookings, employeeIds);

  // Month-over-month trend — compare against the immediately preceding
  // (closed) campaign's frozen final figures for the same employee, if any.
  const prevCampaign = await prisma.gamificationCampaign.findFirst({
    where: { ownerId: user.ownerId, periodStart: { lt: campaign.periodStart }, status: "CLOSED" },
    orderBy: { periodStart: "desc" },
    include: { participants: { select: { employeeId: true, finalProfitPesos: true } } },
  });
  const previousFinals = prevCampaign
    ? new Map(prevCampaign.participants.filter((p) => p.finalProfitPesos != null).map((p) => [p.employeeId, p.finalProfitPesos!]))
    : null;

  const ranked = rankParticipants(participants, totals, previousFinals);
  const totalProfitPesos = ranked.reduce((s, r) => s + r.profitPesos, 0);
  const totalRevenuePesos = ranked.reduce((s, r) => s + r.revenuePesos, 0);
  const totalBookings = ranked.reduce((s, r) => s + r.bookingCount, 0);
  const targetAchieved = totalProfitPesos >= campaign.targetPesos;

  // Lazily stamp the live target-crossing moment — a real, once-set server
  // fact (see campaign.ts's doc comment for why this is deliberately
  // distinct from the month-end CLOSE freeze below).
  if (targetAchieved && !campaign.targetAchievedAt) {
    campaign = await prisma.gamificationCampaign.update({ where: { id: campaign.id }, data: { targetAchievedAt: now } });
  }

  // Lazily close a campaign whose period has fully elapsed — freezes the
  // real final numbers exactly once; rewards are only ever finalized if
  // the target was actually reached by period end (brief's own rule).
  if (campaign.status === "ACTIVE" && now.getTime() >= campaign.periodEnd.getTime()) {
    const winner = computeWinner(ranked, targetAchieved);
    await prisma.$transaction([
      prisma.gamificationCampaign.update({
        where: { id: campaign.id },
        data: { status: "CLOSED", closedAt: now, winnerEmployeeId: winner?.employeeId ?? null, winnerProfitPesos: winner?.profitPesos ?? null },
      }),
      ...ranked.map((r) =>
        prisma.campaignParticipant.update({
          where: { campaignId_employeeId: { campaignId: campaign!.id, employeeId: r.employeeId } },
          data: {
            finalProfitPesos: r.profitPesos,
            finalRank: r.rank,
            rewardPesos: !targetAchieved ? null : r.rank === 1 ? campaign!.winnerRewardPesos : campaign!.participantRewardPesos,
          },
        })
      ),
    ]);
    campaign = await prisma.gamificationCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  }

  let viewerEmployeeId: string | null = null;
  const viewerEmployee = await prisma.employee.findFirst({ where: { userId: user.id, ownerId: user.ownerId }, select: { id: true } });
  viewerEmployeeId = viewerEmployee?.id ?? null;
  const viewerRank = viewerEmployeeId ? ranked.find((r) => r.employeeId === viewerEmployeeId)?.rank ?? null : null;
  const winnerLight = campaign.status === "CLOSED"
    ? (campaign.winnerEmployeeId ? { employeeId: campaign.winnerEmployeeId, name: participants.find((p) => p.employeeId === campaign!.winnerEmployeeId)?.name ?? ranked[0]?.name ?? "", profitPesos: campaign.winnerProfitPesos ?? 0 } : null)
    : computeWinner(ranked, targetAchieved);

  // Light mode: skips the day-by-day series and achievement derivation
  // (the only O(days) work in this route) — for a small, frequently-
  // polled teaser (e.g. the Bookings tab's Championship badge) that only
  // needs rank + a motivational line, not the full dashboard.
  if (req.nextUrl.searchParams.get("light")) {
    return NextResponse.json({
      teaser: {
        campaignId: campaign.id,
        hasParticipants: participants.length > 0,
        isParticipant: !!viewerEmployeeId && ranked.some((r) => r.employeeId === viewerEmployeeId),
        rank: viewerRank,
        totalParticipants: ranked.length,
        targetAchieved,
        motivation: motivationForViewer(ranked, viewerEmployeeId),
        winnerName: winnerLight?.name ?? null,
      },
    });
  }

  const milestones = computeMilestones(campaign.targetPesos, totalProfitPesos);
  const teamBattle = computeTeamBattle(ranked, campaign.targetPesos);
  const dailySeries = computeDailySeries(bookings, campaign.periodStart, campaign.periodEnd, employeeIds, now);
  const achievementMonthLabel = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long" }).format(campaign.periodStart);
  const achievements = deriveAchievements(dailySeries, participants, campaign.targetPesos, achievementMonthLabel);
  const winner = winnerLight;

  const data: CampaignDashboardData = {
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status as "ACTIVE" | "CLOSED",
    periodStart: campaign.periodStart.toISOString(),
    periodEnd: campaign.periodEnd.toISOString(),
    targetPesos: campaign.targetPesos,
    winnerRewardPesos: campaign.winnerRewardPesos,
    participantRewardPesos: campaign.participantRewardPesos,
    heroImageUrl: campaign.heroImageUrl,
    totalProfitPesos,
    totalRevenuePesos,
    totalBookings,
    progressPct: campaign.targetPesos > 0 ? Math.min(100, Math.round((totalProfitPesos / campaign.targetPesos) * 100)) : 0,
    remainingPesos: Math.max(0, campaign.targetPesos - totalProfitPesos),
    targetAchieved,
    targetAchievedAt: campaign.targetAchievedAt ? campaign.targetAchievedAt.toISOString() : null,
    milestones,
    ranked,
    podium: ranked.slice(0, 3),
    teamBattle,
    dailySeries,
    achievements,
    winner,
    winnerFinalized: campaign.status === "CLOSED",
    viewer: { employeeId: viewerEmployeeId, rank: viewerRank, motivation: motivationForViewer(ranked, viewerEmployeeId) },
  };

  return NextResponse.json({ campaign: data });
}
