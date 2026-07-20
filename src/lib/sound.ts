// Tiny synthesized sound effects for the gamification UI (Elite Booker
// Challenge, Achievements) — no audio files, just a few oscillator tones via
// the Web Audio API. Only ever fires from a real click (never on page load),
// so it never runs into browser autoplay restrictions, and a user who
// doesn't want sound just... doesn't click on it again.
let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, startAt: number, duration: number, gainPeak = 0.08) {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + startAt;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Short ascending two-note "pop" — for tapping a locked/unlocked badge. */
export function playPop() {
  tone(660, 0, 0.12);
  tone(880, 0.06, 0.14);
}

/** Bigger three-note "level up" fanfare — for the current Elite tier badge. */
export function playFanfare() {
  tone(523.25, 0, 0.14); // C5
  tone(659.25, 0.1, 0.14); // E5
  tone(783.99, 0.2, 0.28, 0.1); // G5
}
