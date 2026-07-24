const { chromium } = require('playwright');
const XLSX = require('./node_modules/xlsx');
const fs = require('fs');

const SCRATCH = '/private/tmp/claude-501/-Users-james-Downloads-evangelinas-staycation-2/d0c21391-934c-48b9-90e5-85a96dea06fd/scratchpad';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await page.goto('https://evangelinas-p.vercel.app/bookings', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const dateSelect = page.locator('select').nth(2);
  await dateSelect.selectOption({ label: 'All dates' });
  await page.waitForTimeout(2000);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: /Transfer to Excel/i }).click(),
  ]);
  const xlsxPath = `${SCRATCH}/full-export.xlsx`;
  await download.saveAs(xlsxPath);

  await page.waitForTimeout(1000);
  const cards = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('div.card.p-3'));
    return els.map((card) => {
      const nameEl = card.querySelector('p.font-semibold.truncate');
      const pills = Array.from(card.querySelectorAll('span')).map((s) => s.textContent.trim()).filter(Boolean);
      return { name: nameEl ? nameEl.textContent.trim() : null, pills, fullText: card.innerText };
    });
  });
  await browser.close();

  const PLATFORMS = ['TikTok', 'Airbnb', 'Facebook', 'Direct'];
  const withFee = cards.filter((r) => r.fullText.includes('Fee'));
  const seen = new Map();
  for (const r of withFee) {
    const inMatch = r.fullText.match(/In\s+([A-Za-z]+ \d{1,2}, \d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)/);
    const feeMatch = r.fullText.match(/Fee\s*₱([\d,]+)/);
    const key = `${r.name}|${feeMatch ? feeMatch[1] : '?'}|${inMatch ? inMatch[1] : '?'}`;
    if (seen.has(key)) continue;
    const platform = r.pills.find((p) => PLATFORMS.some((pl) => p.includes(pl)));
    seen.set(key, { name: r.name, fee: feeMatch ? feeMatch[1] : null, checkIn: inMatch ? inMatch[1] : null, platform: platform || null });
  }
  const domRecords = [...seen.values()];
  console.log('unique DOM records:', domRecords.length);

  const buf = fs.readFileSync(xlsxPath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const excelRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }).slice(1);
  console.log('excel rows:', excelRows.length);

  const domIndex = new Map();
  for (const r of domRecords) {
    const key = `${r.name}|${r.fee}|${r.checkIn}`;
    if (!domIndex.has(key)) domIndex.set(key, []);
    domIndex.get(key).push(r);
  }
  let matched = 0, unmatched = 0;
  const merged = [];
  for (const row of excelRows) {
    const [guestName, source, unit, phone, checkIn, checkInTime, checkOut, checkOutTime, totalFee, dpAmount, fpAmount, paymentStatus, remainingBalance, dpReceivedBy, fpReceivedBy] = row;
    const feeCommaKey = `${guestName}|${Number(totalFee).toLocaleString('en-US')}|${checkIn}`;
    let candidates = domIndex.get(feeCommaKey) || [];
    if (candidates.length === 0) {
      candidates = domRecords.filter((r) => r.name === guestName && r.fee === Number(totalFee).toLocaleString('en-US'));
    }
    const platformRaw = candidates[0] ? candidates[0].platform : null;
    const platform = platformRaw ? (platformRaw.includes('TikTok') ? 'TikTok' : platformRaw.includes('Airbnb') ? 'Airbnb' : platformRaw.includes('Facebook') ? 'Facebook' : platformRaw.includes('Direct') ? 'Direct' : null) : null;
    if (platform) matched++; else unmatched++;
    merged.push({ guestName, source, unit, phone, checkIn, checkInTime, checkOut, checkOutTime, totalFee, dpAmount, fpAmount, paymentStatus, remainingBalance, dpReceivedBy, fpReceivedBy, platform });
  }
  console.log('matched:', matched, 'unmatched:', unmatched);
  fs.writeFileSync(`${SCRATCH}/full-merged.json`, JSON.stringify(merged, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
