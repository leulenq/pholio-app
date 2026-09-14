import fs from "fs";
const S = "/Users/lenquanhone/Projects/pholio-app/scratchpad/pitch-deck/ui-stack";
const [code, onlySlug] = process.argv.slice(2);
const people = JSON.parse(fs.readFileSync(S + "/people.json", "utf8"));
const BASE = "http://localhost:3100/api/public/opencall/call/" + code;
let n = 10;
for (const p of people) {
  if (onlySlug && p.slug !== onlySlug) continue;
  n++;
  let cookie = "";
  const H = () => ({ "X-Forwarded-For": `203.0.113.${n}`, Cookie: cookie });
  const take = (r) => { const sc = r.headers.getSetCookie(); if (sc.length) cookie = [cookie, ...sc.map((c) => c.split(";")[0])].filter(Boolean).join("; "); };
  const post = async (path, body) => { const r = await fetch(BASE + path, { method: "POST", headers: { ...H(), "Content-Type": "application/json" }, body: JSON.stringify(body) }); take(r); const j = await r.json(); if (!j.success) console.log(p.slug, path, r.status, JSON.stringify(j).slice(0, 300)); return j; };
  await post("/draft", { answers: { legal_name: `${p.first} ${p.last}`, phone: `+1 (212) 555-01${String(n).padStart(2, "0")}`, date_of_birth: p.dob, gender: p.gender, city: p.city, height: p.height, core_measurements: p.meas, instagram: "@" + p.ig } });
  await post("/draft/email", { email: `${p.first}.${p.last}@example.com`.toLowerCase(), phone: `+1 (212) 555-01${String(n).padStart(2, "0")}` });
  for (const [key, file] of [["digital_headshot", "headshot"], ["digital_full_length", "full"], ["digital_profile", "profile"]]) {
    const fd = new FormData();
    fd.append("media", new Blob([fs.readFileSync(`${S}/photos/${p.slug}/${file}.jpg`)], { type: "image/jpeg" }), `${file}.jpg`);
    const r = await fetch(BASE + "/draft/media/" + key, { method: "POST", headers: H(), body: fd });
    take(r); const j = await r.json(); if (!j.success) console.log(p.slug, key, r.status, JSON.stringify(j).slice(0, 300));
  }
  const d = await (await fetch(BASE + "/draft", { headers: H() })).json();
  if (d.data.blockers?.length) console.log(p.slug, "blockers", JSON.stringify(d.data.blockers));
  const s = await post("/submit", { consent: { confirmed: true, accuracyConfirmed: true, adultAuthorityConfirmed: true, packageFingerprint: d.data.packageFingerprint } });
  console.log(p.slug, JSON.stringify(s));
}
