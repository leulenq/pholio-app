// usage: node api.mjs <as-email> METHOD PATH [jsonBody]
const [email, method, path, body] = process.argv.slice(2);
const BASE = "http://localhost:5175";
const H = { "Content-Type": "application/json", "X-Pholio-Request": "same-origin", Origin: BASE };
let r = await fetch(BASE + "/api/dev/login", { method: "POST", headers: H, body: JSON.stringify({ email, password: "password123" }) });
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
r = await fetch(BASE + path, { method, headers: { ...H, Cookie: cookie }, body: body || undefined });
console.log(r.status, await r.text());
