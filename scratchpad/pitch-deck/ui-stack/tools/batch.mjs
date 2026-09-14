// usage: node batch.mjs <email> <calls.json>  calls: [[METHOD, PATH, body?], ...]
import fs from "fs";
const [email, file] = process.argv.slice(2);
const BASE = "http://localhost:5175";
const H = { "Content-Type": "application/json", "X-Pholio-Request": "same-origin", Origin: BASE };
let r = await fetch(BASE + "/api/dev/login", { method: "POST", headers: H, body: JSON.stringify({ email, password: "password123" }) });
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
for (const [m, p, b] of JSON.parse(fs.readFileSync(file, "utf8"))) {
  r = await fetch(BASE + p, { method: m, headers: { ...H, Cookie: cookie }, body: b ? JSON.stringify(b) : undefined });
  console.log(r.status, m, p, (await r.text()).slice(0, 300));
}
