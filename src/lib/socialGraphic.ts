// Client-only canvas rendering for the Social Media Center's downloadable
// graphics. No image-generation dependency needed — the Canvas API already
// does exact-pixel-dimension PNG output natively, and this app has no
// existing image library (only jsPDF/xlsx, both document formats, not
// pixel graphics) to reuse instead.

export type GraphicFormat = { key: string; label: string; width: number; height: number };

export const GRAPHIC_FORMATS: GraphicFormat[] = [
  { key: "fb-post", label: "Facebook / Instagram Post", width: 1080, height: 1350 },
  { key: "story", label: "Story (FB/IG/TikTok)", width: 1080, height: 1920 },
  { key: "square", label: "Square Post", width: 1080, height: 1080 },
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

export type AvailabilityGraphicInput = {
  headline: string;
  dateLines: string[]; // pre-formatted, e.g. ["Aug 3 (Sat)", "Aug 5 (Mon)", "Aug 12-14"]
  ctaLine: string;
  businessName: string;
  location: string;
  logoImage: HTMLImageElement | null;
};

/** Draws the branded "available dates" graphic onto `canvas` at its current width/height. */
export function drawAvailabilityGraphic(canvas: HTMLCanvasElement, input: AvailabilityGraphicInput) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
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
    // Callers pass lines already carrying their own leading emoji (e.g. a
    // per-stay-type "☀️ Daycation: ..." breakdown) — only add the generic
    // calendar emoji when a line doesn't already have one, so the two
    // conventions don't stack into a doubled-up "📅 ☀️ Daycation" prefix.
    const hasOwnEmoji = /^\p{Emoji}/u.test(d);
    const prefixed = (hasOwnEmoji ? "" : "📅  ") + d;
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

  // CTA + location footer
  ctx.font = `bold ${W * 0.042}px Arial`;
  ctx.fillStyle = "#ffffff";
  const ctaLines = wrapText(ctx, input.ctaLine, W - pad * 2);
  let fy = H - pad - (ctaLines.length - 1) * (W * 0.05) - W * 0.05;
  for (const line of ctaLines) { ctx.fillText(line, pad, fy); fy += W * 0.05; }

  ctx.font = `${W * 0.026}px Arial`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(input.location, pad, H - pad * 0.4);
  ctx.globalAlpha = 1;
}

export type UnitGraphicInput = {
  unitName: string;
  badge: string; // e.g. "AVAILABLE THIS WEEK", "ONLY 2 DATES LEFT"
  dateLines: string[]; // e.g. ["Daycation: Jul 29, 30", "Night: Jul 28, 31"]
  price: string | null;
  ctaLine: string;
  unitPhoto: HTMLImageElement | null;
};

/** Draws a photo-first hero (unit photo + dark gradient overlay for legible text) — falls back to a brand-color gradient when no unit photo is set. */
export function drawUnitGraphic(canvas: HTMLCanvasElement, input: UnitGraphicInput) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
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

  // Badge (top)
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

  // Bottom text block
  ctx.textBaseline = "alphabetic";
  let y = H - pad - W * 0.02;
  ctx.font = `bold ${W * 0.038}px Arial`;
  ctx.fillStyle = "#ffffff";
  const ctaLines = wrapText(ctx, input.ctaLine, W - pad * 2);
  for (let i = ctaLines.length - 1; i >= 0; i--) { ctx.fillText(ctaLines[i], pad, y); y -= W * 0.05; }
  y -= W * 0.02;

  if (input.price) {
    ctx.font = `700 ${W * 0.04}px Arial`;
    ctx.fillText(input.price, pad, y);
    y -= W * 0.06;
  }

  for (let i = input.dateLines.length - 1; i >= 0; i--) {
    ctx.font = `600 ${W * 0.034}px Arial`;
    ctx.fillText("📅  " + input.dateLines[i], pad, y);
    y -= W * 0.05;
  }
  y -= W * 0.02;

  ctx.font = `900 ${W * 0.072}px Arial`;
  ctx.fillText(input.unitName, pad, y);
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

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
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
  }, "image/png");
}
