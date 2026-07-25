"use client";

// A short two-note "pop" synthesized via Web Audio API — no external audio
// asset to host/fetch, and no risk of a missing-file 404 ever silently
// breaking notifications. Mute preference persists across sessions; default
// is unmuted (staff expect to hear a new message land, same as any chat app).
const MUTE_KEY = "chat:sound-muted";

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setSoundMuted(muted: boolean) {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

let ctx: AudioContext | null = null;
function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Two quick tones (rising) — deliberately unmuted only via explicit user
 * preference, never auto-played for a message the current user just sent
 * themselves (see ChatView's shouldNotify — the caller's job, not this
 * function's, since this has no idea who sent what). */
export function playNotificationSound() {
  if (isSoundMuted()) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

  const now = audioCtx.currentTime;
  const notes: [number, number][] = [
    [880, now],
    [1174.66, now + 0.09],
  ];
  for (const [freq, start] of notes) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + 0.18);
  }
}
