// Tiny synthesized sound effects for the gamification UI (Elite Booker
// Challenge, Achievements) — no audio files, just oscillator tones via the
// Web Audio API. Every effect below only ever fires from a real user
// interaction (a click, or a data change that resulted directly from an
// action the user just took), never automatically on page load — so it
// never runs into browser autoplay restrictions.

const STORAGE_KEY = "eva-sound-prefs";

function loadPrefs(): { enabled: boolean; volume: number } {
  if (typeof window === "undefined") return { enabled: true, volume: 0.7 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, volume: 0.7 };
    const parsed = JSON.parse(raw);
    return { enabled: parsed.enabled ?? true, volume: typeof parsed.volume === "number" ? parsed.volume : 0.7 };
  } catch {
    return { enabled: true, volume: 0.7 };
  }
}

let prefs = loadPrefs();
const listeners = new Set<() => void>();

export function getSoundPrefs() {
  return prefs;
}
export function subscribeSoundPrefs(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function persist() {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  listeners.forEach((fn) => fn());
}
export function setSoundEnabled(enabled: boolean) {
  prefs = { ...prefs, enabled };
  persist();
}
export function setSoundVolume(volume: number) {
  prefs = { ...prefs, volume: Math.max(0, Math.min(1, volume)) };
  persist();
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined" || !prefs.enabled) return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, startAt: number, duration: number, gainPeak = 0.08, type: OscillatorType = "triangle") {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + startAt;
  const peak = gainPeak * prefs.volume;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
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

/** A single bright, quick "ding" — coin pickup. */
export function playCoin() {
  tone(1046.5, 0, 0.08, 0.07, "square"); // C6
  tone(1568, 0.04, 0.16, 0.06, "square"); // G6
}

/** A short rising sweep — XP bar filling. */
export function playXpGain() {
  tone(392, 0, 0.09, 0.05); // G4
  tone(523.25, 0.05, 0.09, 0.06); // C5
  tone(659.25, 0.1, 0.14, 0.06); // E5
}

/** A satisfying four-note major arpeggio — quest/milestone complete. */
export function playQuestComplete() {
  tone(523.25, 0, 0.12, 0.07); // C5
  tone(659.25, 0.09, 0.12, 0.07); // E5
  tone(783.99, 0.18, 0.12, 0.07); // G5
  tone(1046.5, 0.27, 0.3, 0.09); // C6
}

/** A low "creak" thud followed by a rising sparkle run — treasure chest opening. */
export function playChestOpen() {
  tone(110, 0, 0.18, 0.09, "sawtooth");
  tone(880, 0.2, 0.08, 0.05, "square");
  tone(1046.5, 0.27, 0.08, 0.05, "square");
  tone(1318.5, 0.34, 0.16, 0.06, "square");
}
