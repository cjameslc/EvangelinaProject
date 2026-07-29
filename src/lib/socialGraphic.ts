// Client-only canvas rendering for the Social Media Center's downloadable
// graphics. The Canvas API already does exact-pixel-dimension image output
// natively; jsPDF and qrcode (both already dependencies, already used
// elsewhere in this app — SecureGuideCards.tsx for QR, the /api/social/export
// route for PDF) cover the PDF/QR pieces without adding anything new.

export type GraphicFormat = { key: string; label: string; width: number; height: number };

export const GRAPHIC_FORMATS: GraphicFormat[] = [
  { key: "ig-feed", label: "Instagram Feed", width: 1080, height: 1080 },
  { key: "ig-portrait", label: "Instagram Portrait", width: 1080, height: 1350 },
  { key: "ig-story", label: "Instagram / TikTok Story", width: 1080, height: 1920 },
  { key: "fb-post", label: "Facebook Post", width: 1080, height: 1350 },
  { key: "tiktok", label: "TikTok", width: 1080, height: 1920 },
  { key: "threads", label: "Threads", width: 1080, height: 1350 },
  { key: "square", label: "Square Post", width: 1080, height: 1080 },
];

export type QualityTier = { key: string; label: string; scale: number; quality: number };

export const QUALITY_TIERS: QualityTier[] = [
  { key: "standard", label: "Standard", scale: 1, quality: 0.8 },
  { key: "high", label: "High", scale: 1.5, quality: 0.9 },
  { key: "ultra", label: "Ultra HD", scale: 2, quality: 0.95 },
];

// The app's own UI font (Manrope, via next/font) isn't reachable from
// Canvas — next/font generates a scoped/hashed family name, not the literal
// string "Manrope" that ctx.font needs. So exported graphics load their own
// pair of real webfonts directly: Fraunces (a serif with real optical-size
// italics) for the display headline, Manrope for everything else, so the
// export reads like a designed piece rather than a screenshot of the app's
// own UI chrome.
//
// Self-hosted from public/fonts/, not a Google Fonts <link> — this app's
// CSP (next.config.mjs) is `font-src 'self' data:` / `style-src 'self'
// 'unsafe-inline'`, so an external fonts.googleapis.com stylesheet is
// silently blocked by the browser (confirmed via a real console CSP
// violation during testing) and the canvas draw falls back to Georgia/
// Arial with no error. Loading local files via the FontFace constructor
// stays same-origin, needs no CSP change, and has no external runtime
// dependency. Each file is the variable-font instance covering its whole
// weight range (Google serves the same file for 300/600/900 — confirmed by
// diffing the actual CSS response), loaded once with `weight: "300 900"`
// so any ctx.font weight in that range resolves against it.
let fontsPromise: Promise<void> | null = null;
export function ensureGraphicFonts(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    const faces = [
      new FontFace("Fraunces", "url(/fonts/Fraunces-Variable.woff2)", { weight: "300 900", style: "normal" }),
      new FontFace("Fraunces", "url(/fonts/Fraunces-Italic.woff2)", { weight: "500", style: "italic" }),
      new FontFace("Manrope", "url(/fonts/Manrope-Variable.woff2)", { weight: "500 800", style: "normal" }),
    ];
    await Promise.all(
      faces.map((f) =>
        f.load()
          .then((loaded) => { document.fonts.add(loaded); })
          .catch(() => null)
      )
    );
    await document.fonts.ready.catch(() => null);
  })();
  return fontsPromise;
}
const serif = (weight: number | string, px: number, italic = false) => `${italic ? "italic " : ""}${weight} ${px}px "Fraunces", Georgia, serif`;
const sans = (weight: number | string, px: number) => `${weight} ${px}px "Manrope", Arial, sans-serif`;

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Cover-fit an image into a rect, clipped to a rounded-rect mask. */
function drawPhotoCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, r: number) {
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  const imgRatio = img.width / img.height;
  const rectRatio = w / h;
  let dw = w, dh = h, dx = x, dy = y;
  if (imgRatio > rectRatio) { dh = h; dw = h * imgRatio; dx = x - (dw - w) / 2; }
  else { dw = w; dh = w / imgRatio; dy = y - (dh - h) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

type SectionIcon = "sun" | "moon" | "clock";

/** Small procedural line icons — no image assets, so nothing here is ever
 * an invented/stock photo, just simple geometric glyphs (sun/moon/clock)
 * matching each stay type. */
function drawSectionIcon(ctx: CanvasRenderingContext2D, icon: SectionIcon, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.11);
  ctx.lineCap = "round";
  if (icon === "sun") {
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const x1 = cx + Math.cos(a) * r * 0.62, y1 = cy + Math.sin(a) * r * 0.62;
      const x2 = cx + Math.cos(a) * r * 0.92, y2 = cy + Math.sin(a) * r * 0.92;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  } else if (icon === "moon") {
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath(); ctx.arc(cx + r * 0.28, cy - r * 0.16, r * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // small 4-point star accent
    const sx = cx - r * 0.38, sy = cy + r * 0.42, sr = r * 0.16;
    ctx.beginPath();
    ctx.moveTo(sx, sy - sr); ctx.lineTo(sx + sr * 0.3, sy - sr * 0.3); ctx.lineTo(sx + sr, sy); ctx.lineTo(sx + sr * 0.3, sy + sr * 0.3);
    ctx.lineTo(sx, sy + sr); ctx.lineTo(sx - sr * 0.3, sy + sr * 0.3); ctx.lineTo(sx - sr, sy); ctx.lineTo(sx - sr * 0.3, sy - sr * 0.3);
    ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.34, cy + r * 0.12); ctx.stroke();
  }
  ctx.restore();
}

/** Draws text with manual per-character tracking — Canvas has no native
 * letter-spacing property, used for the small uppercase labels (masthead
 * name, pill tag, section labels) that need that editorial, tracked-out
 * feel. `x`/`y` are the same baseline/align semantics as fillText. */
function drawLetterSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, trackingPx: number) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + trackingPx;
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export type GraphicResult = { hiddenDateCount: number };

export type AvailabilityGraphicInput = {
  headline: string; // e.g. "Available Dates" or "Fully Booked"
  subheadline: string; // e.g. "for July 2026"
  intro?: string | null;
  sections: AvailabilityDateSection[];
  ctaLine: string;
  businessName: string;
  location: string;
  logoImage: HTMLImageElement | null;
  /** A REAL unit photo (never a stock/invented image) — the property's
   * best-availability unit is picked by the caller. Omitted entirely (no
   * placeholder drawn) when no real photo exists, rather than fabricating
   * one. */
  heroPhoto?: HTMLImageElement | null;
  heroLabel?: string | null;
  watermarkText?: string | null;
  contactLine?: string | null;
  qrImage?: HTMLImageElement | null;
  /** Brand Kit colors — default to the original hardcoded rausch pink /
   * deep maroon when not set, so every existing call site keeps working
   * unchanged for an admin who hasn't configured a Brand Kit. */
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

export type AvailabilityDateSection = {
  label: string; // "Daycation", "Night Stay", "21-Hour Stay"
  icon: SectionIcon;
  dates: string; // pre-summarized, e.g. "Jul 29-31, Aug 2, Aug 4"
  blurb: string; // short marketing line for this stay type
};

const SECTION_ACCENTS: Record<SectionIcon, { bg: string; fg: string }> = {
  sun: { bg: "#F6DFC9", fg: "#C97A2B" },
  moon: { bg: "#DCE6D6", fg: "#5E7A54" },
  clock: { bg: "#F2E2B8", fg: "#B4862E" },
};

/** Draws the branded "available dates" graphic onto `canvas` at its current
 * width/height — an editorial, magazine-style layout (warm neutral ground,
 * a real unit photo, icon-labeled stay-type sections) rather than the
 * original flat brand-gradient template. */
export function drawAvailabilityGraphic(canvas: HTMLCanvasElement, input: AvailabilityGraphicInput): GraphicResult {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { hiddenDateCount: 0 };
  const W = canvas.width;
  const H = canvas.height;
  const pad = W * 0.075;
  const primary = input.primaryColor || "#FF385C";
  const cream = "#FBF3EA";
  const ink = "#2B231D";
  const muted = "#8A7F73";

  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  let y = pad;

  // Every W-relative size in the header/headline/intro block below is
  // scaled by `hs` — sized as-is, the block was tuned against tall formats
  // (portrait 1080x1350, story 1080x1920) where H comfortably exceeds W.
  // On the square format (1080x1080) the identical sizes ate over half the
  // canvas height before the card even started, collapsing it to negative
  // height (confirmed via a real exported PNG — the card's content was
  // silently painted over by the footer bar). `hs` compresses the header
  // block on squarer formats so the card — the functionally important
  // part, the actual dates — always gets its space; taller formats keep
  // the original, more spacious sizing.
  const hs = H / W < 1.15 ? 0.72 : 1;
  const S = (frac: number) => W * frac * hs;

  // Header — logo + business name, small and quiet (the headline does the
  // work below), set in Manrope with letter-spacing for a masthead feel.
  const logoSize = S(0.075);
  if (input.logoImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pad + logoSize / 2, y + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(input.logoImage, pad, y, logoSize, logoSize);
    ctx.restore();
  }
  ctx.fillStyle = ink;
  ctx.font = sans(800, S(0.026));
  ctx.textBaseline = "middle";
  drawLetterSpaced(ctx, input.businessName.toUpperCase(), pad + logoSize + W * 0.028, y + logoSize / 2, W * 0.0012);
  ctx.textBaseline = "alphabetic";
  y += logoSize + S(0.05);

  // Headline — serif display word in the brand color, italic subheadline
  // (month) directly beneath, the same "editorial masthead" pairing as the
  // reference: a characterful display face used with restraint, not the
  // app's own UI sans everywhere.
  ctx.fillStyle = primary;
  ctx.font = serif(900, S(0.088));
  const headlineLines = wrapText(ctx, input.headline, W - pad * 2);
  const headlineLH = S(0.084);
  for (const line of headlineLines) { y += headlineLH; ctx.fillText(line, pad, y); }
  y += S(0.006);
  ctx.fillStyle = ink;
  ctx.font = serif(500, S(0.042), true);
  y += S(0.05);
  ctx.fillText(input.subheadline, pad, y);
  y += S(0.042);

  // Intro line — the actual marketing copy, not filler.
  if (input.intro) {
    ctx.font = sans(500, S(0.025));
    ctx.fillStyle = muted;
    const introLines = wrapText(ctx, input.intro, W - pad * 2).slice(0, 2);
    for (const line of introLines) { y += S(0.033); ctx.fillText(line, pad, y); }
    y += S(0.016);
  }
  y += S(0.02);

  // Hero photo — a real unit photo only; if none exists, no placeholder is
  // drawn (see AvailabilityGraphicInput.heroPhoto doc), the layout just
  // gives that space to the card below instead. Height is budget-aware,
  // not a flat H-ratio: a flat ratio sized for tall formats (portrait/
  // story) left negative room for the card on the square format (photo +
  // fixed-size header text exceeded H entirely — confirmed via a real
  // exported PNG where the card collapsed to zero height and its content
  // silently ended up painted over by the footer bar). The card's minimum
  // is reserved first; the photo only gets whatever's left over, and is
  // skipped rather than drawn as a broken sliver if that's too little.
  const footerH = W * 0.15;
  const footerGap = W * 0.035;
  const minCardH = W * 0.27;
  const spaceForPhotoAndCard = H - pad - footerH - footerGap - y;
  const heroH = Math.min(H * 0.24, spaceForPhotoAndCard - minCardH);
  if (input.heroPhoto && heroH >= W * 0.12) {
    const heroW = W - pad * 2;
    ctx.save();
    ctx.shadowColor = "rgba(43,35,29,0.18)";
    ctx.shadowBlur = W * 0.02;
    ctx.shadowOffsetY = W * 0.008;
    drawPhotoCover(ctx, input.heroPhoto, pad, y, heroW, heroH, W * 0.03);
    ctx.restore();
    if (input.heroLabel) {
      const labelPad = W * 0.018;
      ctx.font = sans(700, W * 0.024);
      const lw = ctx.measureText(input.heroLabel).width + labelPad * 2;
      const lh = W * 0.045;
      const lx = pad + W * 0.02, ly = y + heroH - lh - W * 0.02;
      ctx.fillStyle = "rgba(20,16,13,0.55)";
      roundedRectPath(ctx, lx, ly, lw, lh, lh / 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(input.heroLabel, lx + labelPad, ly + lh / 2);
      ctx.textBaseline = "alphabetic";
    }
    y += heroH + W * 0.04;
  }

  // Card — the date sections, each icon-labeled and with a real marketing
  // line, not just a bare date list.
  const cardTop = y;
  const cardBottom = H - pad - footerH - footerGap;
  ctx.save();
  ctx.shadowColor = "rgba(43,35,29,0.08)";
  ctx.shadowBlur = W * 0.018;
  ctx.shadowOffsetY = W * 0.006;
  ctx.fillStyle = "#ffffff";
  roundedRectPath(ctx, pad, cardTop, W - pad * 2, cardBottom - cardTop, W * 0.03);
  ctx.fill();
  ctx.restore();

  // "AVAILABLE DATES" pill tag, top-left of the card.
  const pillPadX = W * 0.024, pillH = W * 0.042;
  ctx.font = sans(800, W * 0.022);
  const pillLabel = "AVAILABLE DATES";
  const pillTrack = W * 0.0012;
  const pillW = ctx.measureText(pillLabel).width + pillLabel.length * pillTrack + pillPadX * 2;
  const pillX = pad + W * 0.045, pillY = cardTop - pillH / 2;
  ctx.fillStyle = primary;
  roundedRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  drawLetterSpaced(ctx, pillLabel, pillX + pillPadX, pillY + pillH / 2, pillTrack);
  ctx.textBaseline = "alphabetic";

  const cardX = pad + W * 0.045;
  const cardInnerW = W - pad * 2 - W * 0.09;
  let sy = cardTop + W * 0.06;
  const bottomLimit = cardBottom - W * 0.025;
  let hiddenCount = 0;

  if (input.sections.length === 0) {
    ctx.font = serif(600, W * 0.036, true);
    ctx.fillStyle = ink;
    const lines = wrapText(ctx, "Fully booked — message us to join the waitlist for the next open date.", cardInnerW);
    for (const line of lines) { sy += W * 0.05; ctx.fillText(line, cardX, sy); }
  } else {
    for (let i = 0; i < input.sections.length; i++) {
      const s = input.sections[i];
      const accent = SECTION_ACCENTS[s.icon];
      ctx.font = sans(700, W * 0.032);
      const dateLines = wrapText(ctx, s.dates, cardInnerW - W * 0.11);
      ctx.font = sans(500, W * 0.024);
      // One line, not two — this needs to hold up in a compact card (the
      // square export format leaves the card noticeably less room than
      // portrait/story), and a real marketing line only needs one line to
      // read as intentional rather than an essay.
      const blurbLines = wrapText(ctx, s.blurb, cardInnerW - W * 0.11).slice(0, 1);
      const iconR = W * 0.027;
      const rowH = iconR * 2 + W * 0.006;
      const blockH = rowH + dateLines.length * (W * 0.038) + blurbLines.length * (W * 0.03) + W * 0.014;
      if (sy + blockH > bottomLimit) { hiddenCount = input.sections.length - i; break; }

      const iconCx = cardX + iconR, iconCy = sy + iconR;
      ctx.fillStyle = accent.bg;
      ctx.beginPath(); ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2); ctx.fill();
      drawSectionIcon(ctx, s.icon, iconCx, iconCy, iconR, accent.fg);

      const textX = cardX + iconR * 2 + W * 0.024;
      ctx.font = sans(800, W * 0.024);
      ctx.fillStyle = ink;
      ctx.textBaseline = "middle";
      drawLetterSpaced(ctx, s.label.toUpperCase(), textX, iconCy, W * 0.001);
      ctx.textBaseline = "alphabetic";
      sy += rowH + W * 0.012;

      ctx.font = sans(700, W * 0.032);
      ctx.fillStyle = ink;
      for (const line of dateLines) { sy += W * 0.038; ctx.fillText(line, textX, sy); }
      sy += W * 0.006;

      ctx.font = sans(500, W * 0.024);
      ctx.fillStyle = muted;
      for (const line of blurbLines) { sy += W * 0.03; ctx.fillText(line, textX, sy); }

      if (i < input.sections.length - 1) {
        sy += W * 0.02;
        ctx.strokeStyle = "rgba(43,35,29,0.09)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cardX, sy); ctx.lineTo(cardX + cardInnerW, sy); ctx.stroke();
        sy += W * 0.02;
      }
    }
    if (hiddenCount > 0) {
      ctx.font = serif(500, W * 0.026, true);
      ctx.fillStyle = muted;
      sy += W * 0.036;
      ctx.fillText(`+ ${hiddenCount} more — message us for the full list`, cardX, sy);
    }
  }

  // Footer — solid brand-color CTA bar, matching the reference's contact
  // strip but in the property's own accent rather than a neutral card.
  const fTop = H - pad - footerH;
  ctx.fillStyle = primary;
  roundedRectPath(ctx, pad, fTop, W - pad * 2, footerH, W * 0.03);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = sans(800, W * 0.032);
  ctx.textBaseline = "middle";
  const ctaLines = wrapText(ctx, input.ctaLine, W - pad * 2 - W * 0.06);
  const ctaLH = W * 0.04;
  let cy = fTop + footerH / 2 - ((ctaLines.length - 1) * ctaLH) / 2 - (input.contactLine || input.location ? W * 0.018 : 0);
  for (const line of ctaLines) { ctx.fillText(line, pad + W * 0.03, cy); cy += ctaLH; }
  const footerText = input.contactLine ? `${input.location} · ${input.contactLine}` : input.location;
  if (footerText) {
    ctx.font = sans(500, W * 0.022);
    ctx.globalAlpha = 0.85;
    ctx.fillText(footerText, pad + W * 0.03, cy + W * 0.006);
    ctx.globalAlpha = 1;
  }
  ctx.textBaseline = "alphabetic";

  drawQr(ctx, input.qrImage, W, H, pad);
  drawWatermark(ctx, input.watermarkText, W, H, ink);

  return { hiddenDateCount: hiddenCount };
}

export type UnitGraphicInput = {
  unitName: string;
  badge: string; // e.g. "AVAILABLE THIS WEEK", "ONLY 2 DATES LEFT"
  dateLines: string[]; // e.g. ["Daycation: Jul 29, 30", "Night: Jul 28, 31"]
  price: string | null;
  ctaLine: string;
  unitPhoto: HTMLImageElement | null;
  logoImage?: HTMLImageElement | null;
  watermarkText?: string | null;
  contactLine?: string | null;
  qrImage?: HTMLImageElement | null;
  /** Brand Kit colors — default to the original hardcoded rausch pink /
   * deep maroon when not set. */
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

/** Draws a photo-first hero (unit photo + dark gradient overlay for legible text) — falls back to a brand-color gradient when no unit photo is set. */
export function drawUnitGraphic(canvas: HTMLCanvasElement, input: UnitGraphicInput): GraphicResult {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { hiddenDateCount: 0 };
  const W = canvas.width;
  const H = canvas.height;
  const pad = W * 0.08;
  const primary = input.primaryColor || "#FF385C";
  const secondary = input.secondaryColor || "#B0203A";

  if (input.unitPhoto) {
    // Cover-fit the photo, cropping to the canvas aspect ratio.
    const imgRatio = input.unitPhoto.width / input.unitPhoto.height;
    const canvasRatio = W / H;
    let dw = W, dh = H, dx = 0, dy = 0;
    if (imgRatio > canvasRatio) {
      dh = H; dw = H * imgRatio; dx = (W - dw) / 2;
    } else {
      dw = W; dh = W / imgRatio; dy = (H - dh) / 2;
    }
    ctx.drawImage(input.unitPhoto, dx, dy, dw, dh);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, primary);
    grad.addColorStop(1, secondary);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Dark gradient overlay, strongest at the bottom where the text sits —
  // exactly the "dark gradient overlay for readability" the spec calls for.
  const overlay = ctx.createLinearGradient(0, H * 0.35, 0, H);
  overlay.addColorStop(0, "rgba(0,0,0,0)");
  overlay.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);
  // A light top scrim too, so a badge/logo placed up top stays legible
  // against a bright sky/wall in the photo.
  const topOverlay = ctx.createLinearGradient(0, 0, 0, H * 0.25);
  topOverlay.addColorStop(0, "rgba(0,0,0,0.35)");
  topOverlay.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topOverlay;
  ctx.fillRect(0, 0, W, H * 0.25);

  // Badge (top-left)
  ctx.font = sans(800, W * 0.036);
  const badgeW = ctx.measureText(input.badge).width + W * 0.06;
  ctx.fillStyle = primary;
  const br = W * 0.02;
  const bx = pad, by = pad;
  ctx.beginPath();
  ctx.moveTo(bx + br, by);
  ctx.arcTo(bx + badgeW, by, bx + badgeW, by + W * 0.07, br);
  ctx.arcTo(bx + badgeW, by + W * 0.07, bx, by + W * 0.07, br);
  ctx.arcTo(bx, by + W * 0.07, bx, by, br);
  ctx.arcTo(bx, by, bx + badgeW, by, br);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(input.badge, bx + W * 0.03, by + W * 0.035);

  // Logo (top-right), mirroring the badge on the opposite side.
  if (input.logoImage) {
    const logoSize = W * 0.11;
    const lx = W - pad - logoSize, ly = pad;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx + logoSize / 2, ly + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(input.logoImage, lx, ly, logoSize, logoSize);
    ctx.restore();
  }

  // Bottom text block — built top-to-bottom as a list of draw operations so
  // a long dateLines list can be wrapped and truncated against a real top
  // boundary (previously: a fixed single line per entry with no wrapping or
  // limit, so a long per-stay-type date string could run off the canvas
  // edge, or enough entries could run the whole block up past the badge).
  ctx.textBaseline = "alphabetic";
  const topLimit = H * 0.3;
  const dateLineH = W * 0.05;
  const dateFont = sans(600, W * 0.034);

  let y = H - pad - W * 0.02;
  ctx.font = sans(800, W * 0.038);
  ctx.fillStyle = "#ffffff";
  const ctaLines = wrapText(ctx, input.ctaLine, W - pad * 2);
  for (let i = ctaLines.length - 1; i >= 0; i--) { ctx.fillText(ctaLines[i], pad, y); y -= W * 0.05; }
  y -= W * 0.02;

  if (input.contactLine) {
    ctx.font = sans(600, W * 0.028);
    ctx.globalAlpha = 0.9;
    ctx.fillText(input.contactLine, pad, y);
    ctx.globalAlpha = 1;
    y -= W * 0.045;
  }

  if (input.price) {
    ctx.font = sans(800, W * 0.04);
    ctx.fillText(input.price, pad, y);
    y -= W * 0.06;
  }

  ctx.font = dateFont;
  let hiddenDateCount = 0;
  const wrappedEntries: string[][] = [];
  let usedHeight = 0;
  for (let i = 0; i < input.dateLines.length; i++) {
    // A plain bullet, not an emoji — Canvas fillText's emoji support is
    // unreliable cross-platform (confirmed: on at least one real
    // environment this rendered as a broken OS fallback "calendar icon"
    // glyph instead of 📅), so this app never draws emoji into canvas text.
    const wrapped = wrapText(ctx, "•  " + input.dateLines[i], W - pad * 2);
    const entryHeight = wrapped.length * dateLineH;
    if (y - usedHeight - entryHeight < topLimit) { hiddenDateCount = input.dateLines.length - i; break; }
    wrappedEntries.push(wrapped);
    usedHeight += entryHeight;
  }
  if (hiddenDateCount > 0) {
    ctx.font = serif(500, W * 0.028, true);
    ctx.fillText(`+ ${hiddenDateCount} more`, pad, y - usedHeight);
    usedHeight += W * 0.045;
    ctx.font = dateFont;
  }
  for (let i = wrappedEntries.length - 1; i >= 0; i--) {
    const lines = wrappedEntries[i];
    for (let j = lines.length - 1; j >= 0; j--) {
      ctx.fillText(lines[j], pad, y);
      y -= dateLineH;
    }
  }
  // The "+N more" line (if drawn) was positioned relative to the
  // pre-loop y but never decremented y itself — account for its own
  // line height here, plus a small visual gap, before the unit name.
  if (hiddenDateCount > 0) y -= W * 0.045;
  y -= W * 0.02;

  // Unit name — wrapped (previously a single unwrapped fillText call at a
  // large font size, so anything longer than a short name ran straight off
  // the right edge of the canvas uncropped, confirmed via a real exported
  // image). Shrinks to a smaller size first if even wrapped text wouldn't
  // fit above the top boundary, rather than always wrapping to N lines at
  // full size and potentially colliding with the badge.
  const nameMaxWidth = W - pad * 2;
  let nameFontPx = W * 0.072;
  let nameLines: string[];
  for (;;) {
    ctx.font = serif(900, nameFontPx);
    nameLines = wrapText(ctx, input.unitName, nameMaxWidth);
    const neededHeight = nameLines.length * nameFontPx * 1.05;
    if (y - neededHeight >= topLimit || nameFontPx <= W * 0.04) break;
    nameFontPx -= W * 0.008;
  }
  for (let i = nameLines.length - 1; i >= 0; i--) {
    ctx.fillText(nameLines[i], pad, y);
    y -= nameFontPx * 1.05;
  }

  drawQr(ctx, input.qrImage, W, H, pad);
  drawWatermark(ctx, input.watermarkText, W, H);

  return { hiddenDateCount };
}

/** Small QR code, bottom-right corner, above the watermark if both are on. */
function drawQr(ctx: CanvasRenderingContext2D, qrImage: HTMLImageElement | null | undefined, W: number, H: number, pad: number) {
  if (!qrImage) return;
  const size = W * 0.14;
  const x = W - pad - size;
  const y = H - pad - size;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x - W * 0.01, y - W * 0.01, size + W * 0.02, size + W * 0.02);
  ctx.drawImage(qrImage, x, y, size, size);
  ctx.restore();
}

/** Faint diagonal watermark text, low-opacity so it never competes with the
 * real content. `color` must be picked per background — white reads on
 * drawUnitGraphic's photo/dark-overlay background, but would be invisible
 * on drawAvailabilityGraphic's light cream ground (the same white-on-light
 * contrast mistake already fixed once elsewhere in this app). */
function drawWatermark(ctx: CanvasRenderingContext2D, text: string | null | undefined, W: number, H: number, color: string = "#ffffff") {
  if (!text) return;
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = color;
  ctx.font = sans(800, W * 0.05);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 8);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Renders a QR code for `link` and loads it as a drawable image — same
 * dynamic-import + toDataURL + loadImage() pattern already used for the
 * guest guide's WiFi QR (SecureGuideCards.tsx), reused here so this app
 * never needs two different QR code code-paths. */
export async function buildQrImage(link: string): Promise<HTMLImageElement | null> {
  if (!link) return null;
  const QRCode = await import("qrcode");
  const dataUrl = await QRCode.toDataURL(link, { margin: 1, width: 240 }).catch(() => null);
  if (!dataUrl) return null;
  return loadImage(dataUrl);
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string, mimeType: string = "image/png", quality?: number) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, mimeType, quality);
}

/** Wraps a rendered canvas as a single full-bleed page in a PDF — jsPDF is
 * already a dependency (used for the Available Dates tab's calendar-table
 * PDF export, a different document); this is the simpler "one image, one
 * page" case via its own addImage API, no new dependency. */
export async function exportCanvasAsPdf(canvas: HTMLCanvasElement, filename: string) {
  const { jsPDF } = await import("jspdf");
  const w = canvas.width;
  const h = canvas.height;
  const doc = new jsPDF({ orientation: w > h ? "l" : "p", unit: "px", format: [w, h] });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
  doc.save(filename);
}
