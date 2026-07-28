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
  headline: string;
  dateLines: string[]; // pre-formatted, e.g. ["Aug 3 (Sat)", "Aug 5 (Mon)", "Aug 12-14"]
  ctaLine: string;
  businessName: string;
  location: string;
  logoImage: HTMLImageElement | null;
  watermarkText?: string | null;
  contactLine?: string | null;
  qrImage?: HTMLImageElement | null;
};

/** Draws the branded "available dates" graphic onto `canvas` at its current width/height. */
export function drawAvailabilityGraphic(canvas: HTMLCanvasElement, input: AvailabilityGraphicInput): GraphicResult {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { hiddenDateCount: 0 };
  const W = canvas.width;
  const H = canvas.height;
  const pad = W * 0.08;

  // Background — brand gradient (rausch -> deep maroon), matching the
  // app's own accent color rather than a generic template look.
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#FF385C");
  grad.addColorStop(1, "#B0203A");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Soft decorative circles for texture, kept subtle.
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(W * 0.85, H * 0.1, W * 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W * 0.1, H * 0.92, W * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  let y = pad;

  // Logo + business name
  const logoSize = W * 0.11;
  if (input.logoImage) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pad + logoSize / 2, y + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(input.logoImage, pad, y, logoSize, logoSize);
    ctx.restore();
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${W * 0.032}px Arial`;
  ctx.textBaseline = "middle";
  ctx.fillText(input.businessName, pad + logoSize + W * 0.03, y + logoSize / 2);
  y += logoSize + W * 0.08;

  // Headline
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${W * 0.075}px Arial`;
  const headlineLines = wrapText(ctx, input.headline, W - pad * 2);
  const headlineLH = W * 0.09;
  for (const line of headlineLines) { ctx.fillText(line, pad, y + W * 0.06); y += headlineLH; }
  y += W * 0.03;

  // Card behind the dates list, for contrast/legibility
  const cardTop = y;
  const cardBottom = H - pad - W * 0.16;
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  const r = W * 0.03;
  ctx.beginPath();
  ctx.moveTo(pad + r, cardTop);
  ctx.arcTo(W - pad, cardTop, W - pad, cardBottom, r);
  ctx.arcTo(W - pad, cardBottom, pad, cardBottom, r);
  ctx.arcTo(pad, cardBottom, pad, cardTop, r);
  ctx.arcTo(pad, cardTop, W - pad, cardTop, r);
  ctx.closePath();
  ctx.fill();

  let dy = cardTop + W * 0.07;
  ctx.font = `700 ${W * 0.038}px Arial`;
  ctx.fillStyle = "#ffffff";
  const lineH = W * 0.058;
  const textIndent = pad + W * 0.04;
  const innerWidth = W - pad - textIndent;
  const bottomLimit = cardBottom - W * 0.03;

  let hiddenCount = 0;
  for (let i = 0; i < input.dateLines.length; i++) {
    const d = input.dateLines[i];
    // A plain bullet, not an emoji — Canvas fillText's emoji support is
    // unreliable cross-platform (confirmed on a real environment: renders
    // as a broken OS fallback glyph instead of the intended emoji), so
    // this app never draws emoji into canvas text. Callers may still pass
    // their own leading emoji in `d` from older data — stripped here so it
    // never reaches the canvas either.
    const stripped = d.replace(/^\p{Emoji}️?\s*/u, "");
    const prefixed = "•  " + stripped;
    // Wrapped per-entry — a long date-range list (many stay-type openings
    // in a month) would otherwise run off the right edge of the canvas
    // instead of staying inside the card, exactly the kind of thing that
    // makes a "ready-to-post, no editing needed" image not actually so.
    const wrapped = wrapText(ctx, prefixed, innerWidth);
    if (dy + wrapped.length * lineH > bottomLimit) { hiddenCount = input.dateLines.length - i; break; }
    for (const sub of wrapped) { ctx.fillText(sub, textIndent, dy); dy += lineH; }
  }
  if (hiddenCount > 0) {
    ctx.font = `italic ${W * 0.03}px Arial`;
    ctx.fillText(`+ ${hiddenCount} more — message us for the full list`, textIndent, dy);
  }

  // CTA + contact + location footer
  ctx.font = `bold ${W * 0.042}px Arial`;
  ctx.fillStyle = "#ffffff";
  const ctaLines = wrapText(ctx, input.ctaLine, W - pad * 2);
  let fy = H - pad - (ctaLines.length - 1) * (W * 0.05) - W * 0.05;
  for (const line of ctaLines) { ctx.fillText(line, pad, fy); fy += W * 0.05; }

  ctx.font = `${W * 0.026}px Arial`;
  ctx.globalAlpha = 0.85;
  const footerText = input.contactLine ? `${input.location} · ${input.contactLine}` : input.location;
  ctx.fillText(footerText, pad, H - pad * 0.4);
  ctx.globalAlpha = 1;

  drawQr(ctx, input.qrImage, W, H, pad);
  drawWatermark(ctx, input.watermarkText, W, H);

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
};

/** Draws a photo-first hero (unit photo + dark gradient overlay for legible text) — falls back to a brand-color gradient when no unit photo is set. */
export function drawUnitGraphic(canvas: HTMLCanvasElement, input: UnitGraphicInput): GraphicResult {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { hiddenDateCount: 0 };
  const W = canvas.width;
  const H = canvas.height;
  const pad = W * 0.08;

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
    grad.addColorStop(0, "#FF385C");
    grad.addColorStop(1, "#B0203A");
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
  ctx.font = `800 ${W * 0.036}px Arial`;
  const badgeW = ctx.measureText(input.badge).width + W * 0.06;
  ctx.fillStyle = "#FF385C";
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
  const dateFont = `600 ${W * 0.034}px Arial`;

  let y = H - pad - W * 0.02;
  ctx.font = `bold ${W * 0.038}px Arial`;
  ctx.fillStyle = "#ffffff";
  const ctaLines = wrapText(ctx, input.ctaLine, W - pad * 2);
  for (let i = ctaLines.length - 1; i >= 0; i--) { ctx.fillText(ctaLines[i], pad, y); y -= W * 0.05; }
  y -= W * 0.02;

  if (input.contactLine) {
    ctx.font = `600 ${W * 0.028}px Arial`;
    ctx.globalAlpha = 0.9;
    ctx.fillText(input.contactLine, pad, y);
    ctx.globalAlpha = 1;
    y -= W * 0.045;
  }

  if (input.price) {
    ctx.font = `700 ${W * 0.04}px Arial`;
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
    ctx.font = `italic ${W * 0.028}px Arial`;
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
    ctx.font = `900 ${nameFontPx}px Arial`;
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

/** Faint diagonal watermark text, low-opacity so it never competes with the real content. */
function drawWatermark(ctx: CanvasRenderingContext2D, text: string | null | undefined, W: number, H: number) {
  if (!text) return;
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${W * 0.05}px Arial`;
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
