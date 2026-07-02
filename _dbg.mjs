import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
for (const emu of [ {w:390, mobile:true}, {w:390, mobile:false} ]) {
  const page = await browser.newPage();
  await page.setViewport({ width: emu.w, height: 844, deviceScaleFactor: 2, isMobile: emu.mobile, hasTouch: emu.mobile });
  await page.goto('http://localhost:5173/onboarding?preview=measurements.hair', { waitUntil: 'domcontentloaded' });
  for (const t of [2000, 6000, 12000]) {
    await new Promise(r => setTimeout(r, t === 2000 ? 2000 : 4000));
    const state = await page.evaluate(() => ({
      tiles: document.querySelectorAll('.color-tile').length,
      greet: !!document.querySelector('img[alt*="photo"], .cinematic-greet, [class*="greet"]'),
      text: (document.body.innerText || '').slice(0, 80).replace(/\n/g, ' | '),
    }));
    console.log(`mobile=${emu.mobile} t=${t}`, JSON.stringify(state));
  }
  await page.close();
}
await browser.close();
