// Renders og.png (1200×630), the image shown when the course is shared.
// Usage: node scripts/make-og.mjs   (uses an installed Chrome; set PW_CHANNEL to change it)
import { chromium } from "@playwright/test";

const html = `<!doctype html><html><body style="margin:0"><div style="width:1200px;height:630px;box-sizing:border-box;padding:70px 80px;
  background:radial-gradient(circle at 84% 22%,rgba(62,142,126,.30),transparent 30rem),linear-gradient(135deg,#081722,#0b1e2d 65%,#103044);
  color:#fff;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;position:relative;overflow:hidden">
  <div style="color:#e4a340;font-weight:800;letter-spacing:.18em;font-size:22px;text-transform:uppercase">ML 101 · a short course in how machines learn</div>
  <div style="font-family:Cambria,Georgia,serif;font-weight:700;font-size:104px;line-height:1.02;letter-spacing:-.045em;margin-top:34px">See the knobs.<br><span style="color:#e4a340">Understand the machine.</span></div>
  <div style="color:#b8c7d1;font-size:30px;margin-top:34px;max-width:820px;line-height:1.4">Nine short lessons and nine live labs, from fitting a line to language models.</div>
  <svg viewBox="0 0 360 220" width="360" height="220" style="position:absolute;right:70px;bottom:60px">
    <path d="M10 20 C40 190 170 205 350 170" fill="none" stroke="#6b8797" stroke-width="5" stroke-linecap="round"/>
    <path d="M10 20 L52 118 L100 164 L160 186 L226 190" fill="none" stroke="#e4a340" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="226" cy="190" r="13" fill="#e4a340"/>
  </svg></div></body></html>`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: "og.png" });
await browser.close();
console.log("wrote og.png");
