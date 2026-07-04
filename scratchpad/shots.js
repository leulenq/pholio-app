#!/usr/bin/env node
/**
 * Onboarding screenshot harness — captures each preview step and logs console errors.
 * Usage: NODE_PATH=/path/to/pholio-app/node_modules node scratchpad/shots.js scratchpad/shots
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE = process.env.ONBOARDING_URL || 'http://localhost:5174/onboarding';
const OUT_DIR = process.argv[2] || 'scratchpad/shots';

const STEPS = [
  { id: '01-entry', preview: 'entry' },
  { id: '02-birthdate', preview: 'birthdate' },
  { id: '03-gender', preview: 'gender' },
  { id: '04-digitals', preview: 'scout' },
  { id: '05-height', preview: 'measurements.height' },
  { id: '06-stat-bust', preview: 'measurements.bust_cm' },
  { id: '07-review', preview: 'measurements.review' },
  { id: '08-lanes', preview: 'profile.1' },
  { id: '09-market', preview: 'profile.2' },
  { id: '10-finishing', preview: 'finishing' },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), step: null });
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push({ text: err.message, step: null });
  });

  let failedSteps = 0;

  for (const step of STEPS) {
    const url = `${BASE}?preview=${step.preview}`;
    consoleErrors.forEach((e) => { if (!e.step) e.step = step.id; });
    const before = consoleErrors.length;

    console.log(`→ ${step.id}: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('.cinematic-container, .cinematic-question, .action-dock', { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 1500));
      const out = path.join(OUT_DIR, `${step.id}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`  saved ${out}`);
    } catch (err) {
      failedSteps += 1;
      console.error(`  FAILED: ${err.message}`);
    }

    const stepErrors = consoleErrors.slice(before).filter((e) => !e.step);
    stepErrors.forEach((e) => { e.step = step.id; });
    if (stepErrors.length) {
      console.log(`  console errors (${stepErrors.length}):`);
      stepErrors.forEach((e) => console.log(`    - ${e.text}`));
    }
  }

  await browser.close();

  const unique = [...new Map(consoleErrors.map((e) => [`${e.step}:${e.text}`, e])).values()];
  if (unique.length) {
    console.log('\n══ Console errors summary ══');
    unique.forEach((e) => console.log(`[${e.step}] ${e.text}`));
    process.exitCode = 1;
  } else if (failedSteps) {
    console.log(`\n✗ ${failedSteps} step(s) failed to capture.`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ No console errors across all shots.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
