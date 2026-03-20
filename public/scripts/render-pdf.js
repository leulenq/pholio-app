#!/usr/bin/env node
const path = require('path');
const puppeteer = require('puppeteer');

async function renderCompCard({ url, output, name = 'Talent', tier = 'free' }) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const targetUrl = `${url}?name=${encodeURIComponent(name)}&tier=${tier}`;
  await page.goto(targetUrl, { waitUntil: 'networkidle0' });
  const pdfPath = output || path.resolve(process.cwd(), `ZipSite_CompCard_${name.replace(/\s+/g, '')}.pdf`);
  await page.pdf({
    path: pdfPath,
    printBackground: true,
    width: '5.5in',
    height: '8.5in',
    margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
    scale: 1
  });
  await browser.close();
  console.log(`Saved PDF to ${pdfPath}`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node scripts/render-pdf.js <comp-card-url> [output] [name] [tier]');
    process.exit(1);
  }
  const [url, output, name, tier] = args;
  renderCompCard({ url, output, name, tier }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = renderCompCard;
