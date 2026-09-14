// TEMP open-call flow walker for the deck capture. Delete after use.
import puppeteer from "puppeteer";
const BASE = "http://localhost:5175";
const [code, prefix, mode] = process.argv.slice(2); // mode: dry | mobile | desktop
const OUT = process.env.SHOT_OUT;
const P = process.env.PHOTOS || "/Users/lenquanhone/Projects/pholio-app/scratchpad/pitch-deck/ui-stack/photos/elena-marchetti/";
const email = process.env.EMAIL || (mode === "mobile" ? "elena.marchetti@example.com" : `elena.draft.${mode}@example.com`);
const values = {
  "Legal name": process.env.NAME || "Elena Marchetti", "Date of birth": "2004-03-22", "City": "Queens, NY",
  "Height (cm)": "176", "Measurements": "32-24-35", "Instagram": process.env.IG || "elena.marchetti",
  "Portfolio link": "", "Email address": email, "Phone number": process.env.PHONE || "(917) 555-0142",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
const mobile = mode !== "desktop";
await page.setViewport({ width: mobile ? 390 : 1600, height: mobile ? 844 : 1000, deviceScaleFactor: mode === "dry" ? 1 : mobile ? 3 : 2, isMobile: mobile, hasTouch: mobile });
await page.goto(`${BASE}/opencall/${code}`, { waitUntil: "networkidle2" });
await sleep(2000);
await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(e=>e.innerText.trim()==="Accept all"); b&&b.click();});
await sleep(600);
const shoot = async (name) => {
  if (mode === "dry") return;
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 6000); }))); });
  await sleep(900);
  await page.screenshot({ path: `${OUT}/${prefix}${name}.png` });
  console.log("shot", prefix + name);
};
const setVal = (label, v) => page.evaluate((label, v) => {
  const el = document.querySelector(`input[aria-label="${label}"], textarea[aria-label="${label}"]`);
  if (!el) return false;
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}, label, v);
const clickBtn = (text) => page.evaluate((text) => {
  const b = [...document.querySelectorAll("button,[role=radio],[role=checkbox],label")].filter((e) => (e.innerText || "").trim().toLowerCase().startsWith(text.toLowerCase()) && e.getBoundingClientRect().width);
  if (!b.length) return false; b[b.length - 1].click(); return true;
}, text);
const want = (process.env.SHOTS || "").split(",");
for (let i = 0; i < 14; i++) {
  const info = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 700),
    labels: [...document.querySelectorAll("input,textarea")].map((e) => `${e.type}:${e.getAttribute("aria-label")}`),
    buttons: [...document.querySelectorAll("button,[role=checkbox],[role=radio]")].map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 50)),
  }));
  const prog = (info.text.match(/(\d+) of (\d+)/i) || [])[0];
  console.log(`--- ${prog}`, info.labels.join(" | "), "|| buttons:", info.buttons.join(" / "));
  if (mode === "dry" || process.env.DUMP) console.log(info.text.replace(/\n+/g, " ⏎ ").slice(0, 500));
  const tag = `s${String(i + 1).padStart(2, "0")}`;
  if (/Application sent|is with/.test(info.text) && !prog) { await shoot("sent"); break; }
  if (want.includes(tag + "-empty")) await shoot(`${tag}-empty`);
  const files = await page.$$('input[type="file"]');
  if (files.length) {
    if (want.includes(tag + "-empty")) {}
    const order = ["headshot.jpg", "full.jpg", "profile.jpg"];
    for (let f = 0; f < files.length; f++) { await files[f].uploadFile(P + order[f]); await sleep(2500); }
    await sleep(3000);
  }
  for (const l of info.labels) { const label = l.split(":").slice(1).join(":"); if (values[label]) console.log(" set", label, await setVal(label, values[label])); }
  if (info.buttons.some((b) => /^woman|^female/i.test(b))) console.log(" gender", await clickBtn(info.buttons.find((b) => /^woman|^female/i.test(b))));
  const att = info.buttons.find((b) => /^I am 18/i.test(b)); if (att) console.log(" attest", await clickBtn(att));
  if (/Send application/.test(info.buttons.join())) {
    const boxes = await page.evaluate(() => { const bs=[...document.querySelectorAll('[role="checkbox"]')]; const before=bs.map(b=>b.getAttribute("aria-checked")); bs.forEach(b=>{ if (b.getAttribute("aria-checked")!=="true") b.click(); }); return before; });
    await sleep(600);
    console.log(" after", await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"]')].map(b=>b.getAttribute("aria-checked"))));
    await page.evaluate(() => window.scrollTo(0, 0));
    console.log(" consent boxes", boxes.length);
  }
  await sleep(700);
  if (want.includes(tag)) await shoot(tag);
  if (want.includes(tag + "-bottom")) { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(500); await shoot(tag + "-bottom"); }
  if (mode === "dry" && /Send application/.test(info.buttons.join())) { await sleep(500); console.log(await page.evaluate(() => document.body.innerText.slice(0, 2500))); break; }
  if (process.env.STOP === tag) break;
  if (values[info.labels[0]?.split(":")[1]] === "" ) { console.log(" skip", await clickBtn("Skip this one")); }
  else console.log(" advance", await clickBtn(/Send application/.test(info.buttons.join()) ? "Send application" : "Continue"));
  await sleep(2200);
  if (process.env.DUMP) console.log(await page.evaluate(() => (document.querySelector(".oc__error")||{}).innerText));
}
await browser.close();
