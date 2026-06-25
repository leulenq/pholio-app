import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--window-size=1500,1000'] });
const page = await browser.newPage();
await page.setViewport({ width: 1480, height: 980, deviceScaleFactor: 2 });

// Login via the SPA
await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('input[type="email"]', { timeout: 20000 });
await page.type('input[type="email"]', 'agency@example.com');
await page.type('input[type="password"]', 'password123');
await Promise.all([
  page.click('button[type="submit"]'),
  page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
]);
await new Promise(r => setTimeout(r, 4000));
console.log('after login url:', page.url());

await page.goto('http://localhost:5173/dashboard/agency', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));
console.log('overview url:', page.url());
await page.screenshot({ path: '/tmp/overview-top.png', clip: { x: 0, y: 0, width: 1480, height: 700 } });
await page.screenshot({ path: '/tmp/overview-full.png', fullPage: true });
await browser.close();
console.log('done');
