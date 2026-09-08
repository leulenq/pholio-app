"use strict";
// Read-only executable audit proofs. No app startup, .env, database, or network.
// Loads current production source with explicit in-memory dependency substitutes.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../../..");
function load(file, deps = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const requireStub = (name) => {
    if (Object.hasOwn(deps, name)) return deps[name];
    if (["crypto", "express", "zod", "uuid"].includes(name)) return require(name);
    throw new Error(`Unmocked dependency ${name} in ${file}`);
  };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    console, process: { env: { NODE_ENV: "production" } }, URL, Set, Date,
  }, { filename: file })(requireStub, module, module.exports);
  return module.exports;
}
const permissions = load("src/domains/agency/lib/permissions.js");
const routes = load("src/domains/agency/lib/route-permissions.js");
const guard = load("src/shared/middleware/same-origin-mutation.js");
const noop = () => {};
const auth = load("src/domains/auth/middleware/require-auth.js", {
  "../../../shared/middleware/context": { addMessage: noop },
  "../../../config": { agencyRbacEnforce: true },
  "../../../shared/db/knex": null,
  "../../agency/lib/permissions": permissions,
  "../../agency/services/permissions": {},
  "../../agency/lib/route-permissions": routes,
  "../../agency/services/legal-acceptance": {},
});
function response() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this; },
    json(body) { this.body = body; return this; }, redirect(url) { this.redirectUrl = url; return this; } };
}
async function main() {
  // Proof 1: actual permission resolver never queries changed membership role.
  const queried = [];
  const roleDb = (table) => {
    queried.push(table);
    return { where() { return this; }, select: async () => [] };
  };
  roleDb.schema = { hasTable: async () => true };
  const permissionService = load("src/domains/agency/services/permissions.js", {
    "../../../shared/db/knex": roleDb, "../lib/permissions": permissions,
  });
  const staleSession = { role: "AGENCY", agencyMembershipId: "member", agencyMembershipRole: "ADMIN" };
  const effective = await permissionService.resolveEffectivePermissionsFromSession(staleSession);
  assert(effective.has("org.export_data"));
  assert(!queried.includes("agency_memberships"));
  assert(!permissions.getPresetPermissions("VIEWER").has("org.export_data"));
  console.log("PROVED: stale ADMIN session retains org.export_data; membership role is never loaded.");

  // Proof 2: real legacy route and real requireRole accept VIEWER session.
  const application = { id: "application", agency_id: "agency", profile_id: "profile", status: "pending" };
  const writes = [];
  const legacyDb = (table) => ({
    where() { return this; },
    first: async () => table === "applications" ? application : null,
    update: async (data) => { writes.push({ table, data }); return 1; },
  });
  legacyDb.fn = { now: () => "now" };
  legacyDb.transaction = (fn) => fn(legacyDb);
  const legacy = load("src/domains/agency/routes/roster.js", {
    "../../../shared/db/knex": legacyDb,
    "../../auth/middleware/require-auth": auth,
    "../../../shared/lib/blocked-agencies": {},
    "../../../shared/middleware/context": { addMessage: noop },
    "../../../shared/lib/email": { sendApplicationStatusEmail: noop, sendAgencyInviteEmail: noop },
    "../services/context": { getSessionAgencyId: (session) => session.agencyId },
    "../services/agency-invitations": {},
    "./agency-api-guard": { mountAgencyApiGuard: noop },
    "../services/minor-submission-access": { getApplicationAccessDecision: async () => ({ allowed: true, reason: "adult" }) },
  });
  const legacyRoute = legacy.stack.find((entry) => entry.route?.path.includes(":action")).route;
  const legacyReq = { params: { applicationId: "application", action: "accept" },
    session: { userId: "agency", agencyId: "agency", role: "AGENCY", agencyMembershipRole: "VIEWER" },
    headers: { accept: "application/json" }, get: () => "application/json" };
  const legacyRes = response();
  for (const layer of legacyRoute.stack) await layer.handle(legacyReq, legacyRes, (err) => { if (err) throw err; });
  assert.equal(legacyRes.body.success, true);
  assert.equal(writes[0].data.status, "accepted");
  console.log("PROVED: VIEWER session executes actual legacy accept handler and writes accepted status.");

  // Proof 3: own DENY grant can be removed through real DELETE handler.
  let grants = [{ permission_key: "org.export_data", effect: "DENY" }];
  const deleteDb = (table) => ({
    where() { return this; },
    first: async () => ({ id: "self", agency_id: "agency", membership_role: "ADMIN" }),
    del: async () => { grants = []; return 1; },
  });
  const team = load("src/domains/agency/routes/team-rbac.js", {
    "../../../shared/db/knex": deleteDb,
    "../../auth/middleware/require-auth": auth,
    "../services/context": { getSessionAgencyId: () => "agency", getSessionActorUserId: () => "user" },
    "./agency-api-guard": { mountAgencyApiGuard: noop },
    "../services/audit": { recordAuditEvent: noop },
    "../services/permissions": { loadMembershipGrants: async () => grants },
    "../lib/permissions": permissions,
  });
  const before = permissions.computeEffectivePermissions("ADMIN", grants);
  assert(before.has(routes.resolveRoutePermission("DELETE", "/api/agency/team/self/permissions/org.export_data")));
  assert(!before.has("org.export_data"));
  const deleteRoute = team.stack.find((entry) => entry.route?.path.endsWith("/:permissionKey")).route;
  const deleteRes = response();
  const deleteReq = { session: { userId: "agency", role: "AGENCY", agencyMembershipId: "self", agencyMembershipRole: "ADMIN" },
    params: { membershipId: "self", permissionKey: "org.export_data" }, query: { effect: "DENY" }, get: () => "application/json" };
  for (const layer of deleteRoute.stack) await layer.handle(deleteReq, deleteRes, (err) => { if (err) throw err; });
  assert.equal(deleteRes.body.success, true);
  assert(permissions.computeEffectivePermissions("ADMIN", grants).has("org.export_data"));
  console.log("PROVED: restricted ADMIN deletes own export DENY and regains export permission.");

  // Proof 4: same-origin guard permits headerless foreign-origin legacy login.
  for (const pathname of ["/login", "/api/login"]) {
    let passed = false;
    const res = response();
    guard.sameOriginMutationGuard()({ method: "POST", originalUrl: pathname,
      get: (name) => name === "origin" ? "https://attacker.invalid" : undefined }, res, () => { passed = true; });
    assert.equal(passed, pathname === "/login");
    console.log(`PROVED: ${pathname} foreign-origin form ${passed ? "passes same-origin guard" : "blocked"}.`);
  }

  // Proof 5: actual magic-link validator and reply handlers authorize solely
  // from token + identity. No account status, application status, or limits.
  const replyWrites = [];
  const replyTables = [];
  const replyDb = (table) => {
    replyTables.push(table);
    return { where() { return this; }, join() { return this; }, leftJoin() { return this; },
      select() { return this; },
      first: async () => table === "message_reply_tokens" ? {
        id: "reply", application_id: "withdrawn-application", talent_user_id: "banned-user",
        expires_at: new Date(Date.now() + 60000).toISOString(),
      } : table === "applications as a" ? {
        application_id: "withdrawn-application", talent_user_id: "banned-user", agency_id: "agency",
        // Joined fixture models rows which persist after withdrawal/suspension.
        status: "withdrawn", account_status: "banned",
      } : { id: "message" },
      insert: async (row) => { replyWrites.push(row); return 1; }, update: async () => 1,
    };
  };
  replyDb.fn = { now: () => "now" };
  const replyService = load("src/domains/messaging/services/message-reply-tokens.js", {
    "../../../shared/db/knex": replyDb,
  });
  const replyRouter = load("src/domains/messaging/routes/message-reply.js", {
    "../../../shared/db/knex": replyDb,
    "../../agency/routes/agency-log-activity": noop,
    "../../../shared/services/agency-notifications": { notifyAgencyNewMessage: noop },
    "../services/message-reply-tokens": replyService,
  });
  const replyRoute = replyRouter.stack.find((entry) => entry.route?.path.endsWith("/messages")).route;
  for (let i = 0; i < 25; i++) {
    const req = { params: { token: "known-email-bearer" }, body: { message: "continued contact" } };
    const res = response();
    for (const layer of replyRoute.stack) await layer.handle(req, res, (err) => { if (err) throw err; });
    assert.equal(res.body.success, true);
  }
  assert.equal(replyWrites.length, 25);
  assert(replyWrites.every((row) => row.sender_id === "banned-user" && row.application_id === "withdrawn-application"));
  assert(!replyTables.includes("users"));
  console.log("PROVED: actual magic-link validator/reply handlers write 25 replies for banned-user/withdrawn-application fixture without account/state checks.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
