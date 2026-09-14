// TEMP screenshot driver for the deck capture. Delete after use.
import puppeteer from "puppeteer";
import fs from "fs";

const BASE = "http://localhost:5175";
const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const OUT = process.env.SHOT_OUT;
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickText(page, text, { exact = false, selector = "button, a, [role=button], [role=tab], label, li, div, span" } = {}) {
  const ok = await page.evaluate(
    (text, exact, selector) => {
      const els = [...document.querySelectorAll(selector)].filter((el) => {
        const t = (el.innerText || el.getAttribute("aria-label") || "").trim();
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        return exact ? t === text : t.includes(text);
      });
      // prefer the smallest matching element
      els.sort((a, b) => a.innerText.length - b.innerText.length);
      if (!els[0]) return false;
      els[0].scrollIntoView({ block: "center" });
      els[0].click();
      return true;
    },
    text, exact, selector,
  );
  return ok;
}

const contexts = {};
async function ctxFor(as) {
  const key = as || "anon";
  if (contexts[key]) return contexts[key];
  const ctx = await browser.createBrowserContext();
  if (as) {
    const p = await ctx.newPage();
    await p.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
    const creds = { agency: "agency@example.com", talent: "talent@example.com" }[as] || as;
    const r = await p.evaluate(async (email) => {
      const res = await fetch("/api/dev/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "X-Pholio-Request": "same-origin" },
        body: JSON.stringify({ email, password: "password123" }),
      });
      return res.status + " " + (await res.text()).slice(0, 120);
    }, creds);
    console.log("login", as, r);
    await p.close();
  }
  contexts[key] = ctx;
  return ctx;
}

for (const job of jobs) {
  const ctx = await ctxFor(job.as);
  const page = await ctx.newPage();
  const mobile = job.mobile;
  await page.setViewport({
    width: job.width || (mobile ? 390 : 1600),
    height: job.height || (mobile ? 844 : 1000),
    deviceScaleFactor: job.dsf || 2,
    isMobile: !!mobile, hasTouch: !!mobile,
  });
  page.on("console", (m) => { if (m.type() === "error" && job.debug) console.log("  console:", m.text().slice(0, 200)); });
  try {
    await page.goto(job.url.startsWith("http") ? job.url : BASE + job.url, { waitUntil: "networkidle2", timeout: 45000 });
  } catch (e) { console.log("  goto warn", e.message); }
  await sleep(1200);
  await clickText(page, "Accept all", { exact: true, selector: "button" });
  await sleep(300);
  for (const step of job.steps || []) {
    if (step.click) console.log("  click", step.click, await clickText(page, step.click, step));
    if (step.css) { try { await page.click(step.css); console.log("  css", step.css, true); } catch (e) { console.log("  css", step.css, false); } }
    if (step.type) { await page.type(step.type[0], step.type[1]); }
    if (step.eval) console.log("  eval", JSON.stringify(await page.evaluate(step.eval)).slice(0, 2000));
    if (step.scroll !== undefined) await page.evaluate((y) => { window.scrollTo(0, y); document.querySelectorAll("main, [data-scroll], .ag-main").forEach((el) => (el.scrollTop = y)); }, step.scroll);
    if (step.hover) { try { await page.hover(step.hover); } catch {} }
    if (step.key) await page.keyboard.press(step.key);
    if (step.goto) await page.goto(BASE + step.goto, { waitUntil: "networkidle2" });
    await sleep(step.wait ?? 700);
    if (step.shot) { await sleep(900); await page.screenshot({ path: `${OUT}/${step.shot}` }); console.log("shot", step.shot); }
  }
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.evaluate(async () => {
    await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); })));
  });
  await sleep(job.settle ?? 1600);
  if (job.out) {
    await page.screenshot({ path: `${OUT}/${job.out}`, fullPage: !!job.fullPage });
    console.log("shot", job.out, page.url());
  }
  if (job.dump) console.log("  text:", (await page.evaluate(() => document.body.innerText)).slice(0, job.dump));
  await page.close();
}
await browser.close();
