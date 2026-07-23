"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/format";
import { LIKED_TAGS, REWARD_OPTIONS, RECOMMEND_OPTIONS, type RecommendKey, type RewardKey } from "@/lib/feedbackContent";
import { Confetti } from "@/components/guest/Confetti";
import { useCopy } from "@/components/guest/SecureGuideCards";

const RATING_OPTIONS: { value: number; icon: string; label: string }[] = [
  { value: 5, icon: "🤩", label: "Excellent" },
  { value: 4, icon: "😊", label: "Great" },
  { value: 3, icon: "😐", label: "Good" },
  { value: 2, icon: "🙁", label: "Fair" },
  { value: 1, icon: "😞", label: "Poor" },
];

const TOTAL_STEPS = 5;

type Voucher = { voucherCode: string; voucherExpiresAt: string; rewardType: string };

export function FeedbackFormView({ bookingId, unitName, existingVoucher }: { bookingId: string; unitName: string; existingVoucher?: Voucher | null }) {
  const [step, setStep] = useState(1);
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [recommend, setRecommend] = useState<RecommendKey | null>(null);
  const [reward, setReward] = useState<RewardKey | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  function toggleTag(key: string) {
    setTags((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));
  }

  function next() {
    setError("");
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }
  function back() {
    setError("");
    setStep((s) => Math.max(1, s - 1));
  }

  async function submit() {
    if (!reward || !name.trim() || !phone.trim()) {
      setError("Please fill in your name, mobile number, and pick a reward.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/guest/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          overallRating: rating,
          likedTags: tags,
          improveComment: comment || null,
          wouldRecommend: recommend,
          rewardType: reward,
          contactName: name,
          contactPhone: phone,
          contactEmail: email || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Couldn't submit your feedback. Please try again."); return; }
      setJustSubmitted(true);
      setVoucher(j.voucher);
    } catch {
      setError("Couldn't submit your feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const shownVoucher = voucher ?? existingVoucher;
  if (shownVoucher) return <VoucherSuccessScreen voucher={shownVoucher} celebrate={justSubmitted} alreadySubmitted={!justSubmitted} />;

  return (
    <div className="mx-auto max-w-[480px] px-4 py-6 sm:px-6">
      <div className="mb-1 text-center">
        <div className="text-[24px]">⭐</div>
        <h1 className="mt-1 text-[20px] font-extrabold tracking-tight">Tell Us About Your Stay</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--gray)]">
          Your feedback helps us improve. Complete this quick survey and receive a special reward! 🎁
        </p>
      </div>

      {/* Progress bar */}
      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-2)]">
        <div className="h-full rounded-full bg-rausch transition-all duration-500" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
      </div>
      <div className="mt-1.5 text-center text-[11px] font-bold text-[var(--gray)]">Step {step} of {TOTAL_STEPS}</div>

      <div className="mt-6 animate-fade-up" key={step}>
        {step === 1 && (
          <StepShell title="How was your stay?" subtitle={unitName}>
            <div className="space-y-2.5">
              {RATING_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { setRating(o.value); next(); }}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${rating === o.value ? "border-rausch bg-rausch/10" : "border-[var(--line)] hover:bg-[var(--bg-2)]"}`}
                >
                  <span className="text-[28px]">{o.icon}</span>
                  <span className="text-[15px] font-bold">{o.label}</span>
                </button>
              ))}
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="What did you enjoy?" subtitle="Select all that apply">
            <div className="grid grid-cols-2 gap-2.5">
              {LIKED_TAGS.map((t) => {
                const on = tags.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleTag(t.key)}
                    className={`rounded-2xl border px-3 py-3.5 text-left text-[13px] font-bold transition ${on ? "border-rausch bg-rausch/10 text-rausch" : "border-[var(--line)] hover:bg-[var(--bg-2)]"}`}
                  >
                    <span className={`mr-1.5 inline-block h-4 w-4 rounded-md border align-middle ${on ? "border-rausch bg-rausch" : "border-[var(--line)]"}`} />
                    {t.label}
                  </button>
                );
              })}
            </div>
            <NavButtons onBack={back} onNext={next} />
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="Tell Us More" subtitle="What can we improve? (optional)">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Your suggestions help us improve…"
              className="field-input min-h-[120px]"
              maxLength={1000}
            />
            <NavButtons onBack={back} onNext={next} />
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="Would you recommend us?">
            <div className="grid grid-cols-2 gap-2.5">
              {RECOMMEND_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => { setRecommend(o.key); next(); }}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 text-center transition ${recommend === o.key ? "border-rausch bg-rausch/10" : "border-[var(--line)] hover:bg-[var(--bg-2)]"}`}
                >
                  <span className="text-[26px]">{o.icon}</span>
                  <span className="text-[13px] font-bold">{o.label}</span>
                </button>
              ))}
            </div>
            <NavButtons onBack={back} />
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="Claim Your Reward" subtitle="Thank you for your feedback! 🎉">
            <div className="space-y-2.5">
              {REWARD_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  onClick={() => setReward(o.key)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${reward === o.key ? "border-rausch bg-rausch/10" : "border-[var(--line)] hover:bg-[var(--bg-2)]"}`}
                >
                  <span className="text-[24px]">{o.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold">{o.label}</div>
                    {o.note && <div className="text-[11px] text-[var(--gray)]">{o.note}</div>}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              <div>
                <label className="field-label">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="field-input mt-1" placeholder="Juan Dela Cruz" />
              </div>
              <div>
                <label className="field-label">Mobile number</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field-input mt-1" placeholder="09XX XXX XXXX" />
              </div>
              <div>
                <label className="field-label">Email (optional)</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="field-input mt-1" placeholder="you@email.com" />
              </div>
            </div>

            {error && <p className="mt-3 text-[12.5px] font-semibold text-rausch">{error}</p>}

            <div className="mt-4 flex gap-2.5">
              <button onClick={back} className="btn flex-none">Back</button>
              <button onClick={submit} disabled={submitting} className="btn-primary flex-1 justify-center">
                {submitting ? "Submitting…" : "Submit & Claim Reward 🎁"}
              </button>
            </div>
          </StepShell>
        )}
      </div>
    </div>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[17px] font-extrabold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[12.5px] text-[var(--gray)]">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function NavButtons({ onBack, onNext }: { onBack: () => void; onNext?: () => void }) {
  return (
    <div className="mt-5 flex gap-2.5">
      <button onClick={onBack} className="btn flex-none">Back</button>
      {onNext && <button onClick={onNext} className="btn-primary flex-1 justify-center">Continue</button>}
    </div>
  );
}

function VoucherSuccessScreen({ voucher, celebrate = true, alreadySubmitted = false }: { voucher: Voucher; celebrate?: boolean; alreadySubmitted?: boolean }) {
  const { copiedKey, copy } = useCopy();
  const rewardMeta = REWARD_OPTIONS.find((r) => r.key === voucher.rewardType);

  return (
    <div className="mx-auto max-w-[480px] px-4 py-14 text-center">
      {celebrate && <Confetti />}
      <div className="text-5xl">{celebrate ? "🎉" : "✅"}</div>
      <h1 className="mt-3 text-[22px] font-extrabold">{alreadySubmitted ? "You've already submitted feedback" : "Thank You!"}</h1>
      <p className="mt-2 text-[14px] text-[var(--gray)]">
        {alreadySubmitted ? "Here's the reward you unlocked for this stay." : "Your feedback has been received successfully. Your reward has been unlocked!"}
      </p>

      <div className="card mt-6 border-2 border-dashed border-rausch/40 p-5">
        <div className="text-[26px]">{rewardMeta?.icon}</div>
        <div className="mt-1 text-[15px] font-extrabold">{rewardMeta?.label}</div>
        <div className="mt-3 rounded-xl bg-[var(--bg-2)] px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--gray)]">Voucher code</div>
          <div className="mt-0.5 text-[20px] font-extrabold tracking-widest">{voucher.voucherCode}</div>
        </div>
        <button onClick={() => copy("voucher", voucher.voucherCode)} className="btn mt-3 w-full justify-center">
          {copiedKey === "voucher" ? "Copied ✓" : "📋 Copy Code"}
        </button>
        <p className="mt-3 text-[12px] text-[var(--gray)]">Valid until {fmtDate(voucher.voucherExpiresAt, { month: "long", day: "numeric", year: "numeric" })}</p>
      </div>

      <a href="/book" className="btn-primary mt-6 inline-flex">📅 Book Again</a>
    </div>
  );
}
