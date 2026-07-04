import puppeteer from 'puppeteer';
const OUT = process.env.OUT;
const STEPS = [['measurements.hair','hair'],['measurements.eyes','eyes'],['measurements.shoe','shoe']];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument(() => {
  try { window.localStorage.setItem('pholio_cookie_consent_v1', JSON.stringify({ necessary: true, analytics: false, updatedAt: '2026-07-02' })); } catch (e) {}
});
for (const [step, name] of STEPS) {
  await page.goto(`http://localhost:5173/onboarding?preview=${step}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  try { await page.waitForSelector(name === 'shoe' ? '.csm-dial-val--shoe' : '.color-tile', { timeout: 12000 }); } catch (e) { console.log(`WAIT-FAIL ${name}`); }
  await new Promise(r => setTimeout(r, 900));
  if (name !== 'shoe') { const t = await page.$$('.color-tile'); if (t[1]) await t[1].click(); }
  else { const a = await page.$$('.csm-dial-arrow'); if (a[1]) await a[1].click(); }
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => { for (const el of document.querySelectorAll('div')) { const s = el.getAttribute('style') || ''; if (s.includes('9999') && s.includes('position: fixed')) el.remove(); } });
  await page.screenshot({ path: `${OUT}/mobile2__${name}.png` });
  console.log(`shot ${name}`);
}
await browser.close();
