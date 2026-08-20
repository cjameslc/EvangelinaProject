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

// ---------------------------------------------------------------------
// Wire types — what actually goes over the JSON response, after masking.
// Every function above this line (rankParticipants, computeTeamBattle,
// motivationForViewer, deriveAchievements, computeWinner, ...) operates on
// real numbers and is unaffected by any of this — masking is a final,
// one-way transform applied in mask.ts, only in the API route, only to
// build the response for a specific viewer. See mask.ts's own doc comment.
//
// A money field's wire type is `number | string`: a real number for an
// admin or for a participant's own row, or a pre-formatted teaser string
// (e.g. "₱8X,XXX+") for everyone else — never a real number a non-admin
// client could read off the network response, React state, or dev tools.
// ---------------------------------------------------------------------

export type MoneyDisplay = number | string;

export type WireParticipant = CampaignParticipantInput & {
  profitPesos: MoneyDisplay;
  revenuePesos: MoneyDisplay;
  bookingCount: number;
  rank: number;
  trendPct: number | null;
  /** Relative leaderboard-bar fill (0-100), precomputed server-side from
   * only as much precision as was already revealed elsewhere (the real
   * value for an admin/self row, the same masked-band floor used in the
   * teaser text otherwise) — never derived client-side from raw pesos, so
   * the bar itself can't be used to back into a tighter number than the
   * text already discloses. */
  barPct: number;
};

export type WireTeamBattleSide = {
  side: string;
  members: WireParticipant[];
  totalProfitPesos: MoneyDisplay;
  totalRevenuePesos: MoneyDisplay;
  totalBookings: number;
  avgProfitPerBooker: MoneyDisplay;
  avgProfitPerBooking: MoneyDisplay;
  contributionPct: number;
};

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
  ranked: WireParticipant[];
  podium: WireParticipant[];
  teamBattle: { A: WireTeamBattleSide; B: WireTeamBattleSide; leadingSide: string | null } | null;
  /** "profit" (admin) — dailySeries values are real cumulative pesos.
   * "rank" (everyone else) — same shape, but each value is that
   * employee's 1-based leaderboard rank on that day, never a peso figure. */
  dailySeriesMode: "profit" | "rank";
  dailySeries: DailyPoint[];
  achievements: Achievement[];
  winner: { employeeId: string; name: string; profitPesos: MoneyDisplay } | null;
  winnerFinalized: boolean; // true once the campaign is CLOSED
  viewerIsAdmin: boolean;
  viewer: { employeeId: string | null; rank: number | null; motivation: string | null };
};
