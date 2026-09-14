const puppeteer = require('/Users/lenquanhone/Projects/pholio-app/node_modules/puppeteer');
const fs = require('fs'); const path = require('path');
const only = process.argv.slice(2);
const files = JSON.parse(fs.readFileSync('deck/canvas.json')).artboards.map(a => a.file);
(async () => {
  fs.mkdirSync('render', { recursive: true });
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
  for (const [i, f] of files.entries()) {
    const n = String(i + 1).padStart(2, '0');
    if (only.length && !only.includes(n)) continue;
    const h = fs.readFileSync('deck/' + f, 'utf8').replace('<script src="./support.js"></script>', '').replace(/<\/?x-dc>|<\/?helmet>/g, '').replace(/src="([a-z0-9-]+\.jpg)"/g, 'src="../img/$1"');
    fs.writeFileSync('render/tmp.html', h);
    await p.goto('file://' + path.resolve('render/tmp.html'), { waitUntil: 'networkidle0' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `render/${n}.png` });
  }
  await b.close();
})();
