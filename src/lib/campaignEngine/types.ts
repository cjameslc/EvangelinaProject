// Shared shapes for the Sales Championship campaign engine — deliberately
// separate from gamification.ts's Elite Booker Challenge (completed-booking
// count, unlimited-month tiers) since this is a different ranking metric
// (real profit), a different reward structure (single winner + flat
// participant reward), and a different lifecycle (one campaign per period,
// closes and freezes at period end). See campaign.ts's own doc comment for
// the full reasoning.

export type CampaignBooking = {
  bookerId: string | null;
  date: Date;
  amount: number;
  paid: boolean;
  dpAmount: number | null;
  refundedAt: Date | null;
};

export type CampaignParticipantInput = {
  employeeId: string;
  name: string;
  role: string;
  avatarColor: string;
  avatarUrl: string | null;
  side: string; // "A" | "B"
};

export type BookerTotals = {
  employeeId: string;
  profitPesos: number;
  revenuePesos: number;
  bookingCount: number;
};

export type RankedParticipant = CampaignParticipantInput &
  BookerTotals & {
    rank: number;
    trendPct: number | null;
  };

export type Milestone = {
  fraction: number;
  pesos: number;
  label: string;
  emoji: string;
  unlocked: boolean;
};

export type TeamBattleSide = {
  side: string;
  members: RankedParticipant[];
  totalProfitPesos: number;
  totalRevenuePesos: number;
  totalBookings: number;
  avgProfitPerBooker: number;
  avgProfitPerBooking: number;
  contributionPct: number;
};

export type DailyPoint = {
  dateIso: string;
  totalProfitPesos: number;
  byEmployee: Record<string, number>;
};

export type Achievement = {
  id: string;
  emoji: string;
  message: string;
  dateIso: string;
};

export type CampaignStatus = "ACTIVE" | "CLOSED";

export type CampaignDashboardData = {
  campaignId: string;
  name: string;
  status: CampaignStatus;
  periodStart: string;
  periodEnd: string;
  targetPesos: number;
  winnerRewardPesos: number;
  participantRewardPesos: number;
  heroImageUrl: string | null;
  totalProfitPesos: number;
  totalRevenuePesos: number;
  totalBookings: number;
  progressPct: number;
  remainingPesos: number;
  targetAchieved: boolean;
  targetAchievedAt: string | null;
  milestones: Milestone[];
  ranked: RankedParticipant[];
  podium: RankedParticipant[];
  teamBattle: { A: TeamBattleSide; B: TeamBattleSide; leadingSide: string | null } | null;
  dailySeries: DailyPoint[];
  achievements: Achievement[];
  winner: { employeeId: string; name: string; profitPesos: number } | null;
  winnerFinalized: boolean; // true once the campaign is CLOSED
  viewer: { employeeId: string | null; rank: number | null; motivation: string | null };
};
