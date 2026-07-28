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
  const maxLines = Math.floor((cardBottom - dy - W * 0.03) / lineH);
  const shown = input.dateLines.slice(0, maxLines);
  for (const d of shown) {
    ctx.fillText("📅  " + d, pad + W * 0.04, dy);
    dy += lineH;
  }
  if (input.dateLines.length > shown.length) {
    ctx.font = `italic ${W * 0.03}px Arial`;
    ctx.fillText(`+ ${input.dateLines.length - shown.length} more — message us for the full list`, pad + W * 0.04, dy);
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
