import { pickStable } from "./pick";

// Small curated set — deliberately not fetched from a third-party quotes
// API (one more external dependency/failure point for very little value
// here). Picked deterministically per booking (stable across re-renders/
// page loads for the same guest, not flickering on every visit).
const TRAVEL_QUOTES = [
  { text: "The world is a book, and those who do not travel read only one page.", author: "Saint Augustine" },
  { text: "To travel is to live.", author: "Hans Christian Andersen" },
  { text: "Not all those who wander are lost.", author: "J.R.R. Tolkien" },
  { text: "Wherever you go becomes a part of you somehow.", author: "Anita Desai" },
  { text: "Travel far enough, you meet yourself.", author: "David Mitchell" },
  { text: "Adventure may hurt you, but monotony will kill you.", author: "Unknown" },
  { text: "Take only memories, leave only footprints.", author: "Chief Seattle" },
];

export function pickTravelQuote(seed: string): { text: string; author: string } {
  return pickStable(TRAVEL_QUOTES, seed) ?? TRAVEL_QUOTES[0];
}
