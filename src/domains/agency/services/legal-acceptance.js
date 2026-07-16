const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");

const MARKETING_SITE_URL = (
  process.env.MARKETING_SITE_URL || "https://www.pholio.studio"
).replace(/\/$/, "");

const POLICY_DEFINITIONS = Object.freeze([
  {
    key: "terms",
    version: "2026-06-25",
    title: "Terms of Service",
    copy: "I accept the current Terms of Service for my individual agency login.",
    url: `${MARKETING_SITE_URL}/terms`,
  },
  {
    key: "privacy",
    version: "2026-06-25",
    title: "Privacy Policy",
    copy: "I have reviewed how Pholio processes portfolio, submission, and workspace data.",
    url: `${MARKETING_SITE_URL}/privacy`,
  },
  {
    key: "workspaceUse",
    version: "2026-07-12",
    title: "Workspace use",
    copy: "I will use this workspace only for legitimate representation, scouting, and booking operations.",
    url: `${MARKETING_SITE_URL}/terms#agency-workspace-use`,
  },
  {
    key: "decisionPolicy",
    version: "2026-07-12",
    title: "Fair decision-making",
    copy: "I will not use protected traits or inferred sensitive attributes to make representation decisions.",
    url: `${MARKETING_SITE_URL}/terms#agency-fair-decision-making`,
  },
  {
    key: "dataProcessing",
    version: "2026-07-12",
    title: "Data handling and processing terms",
    copy: "I will limit access, downloads, and sharing to authorized agency work and honor withdrawals or revoked consent.",
    url: `${MARKETING_SITE_URL}/privacy#agency-data-processing`,
  },
]);

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function policyDigest(policy) {
  return sha256(
    JSON.stringify({
      key: policy.key,
      version: policy.version,
      title: policy.title,
      copy: policy.copy,
      url: policy.url,
    }),
  );
}

const AGENCY_POLICY_MANIFEST = Object.freeze(
  POLICY_DEFINITIONS.map((policy) =>
    Object.freeze({ ...policy, contentDigest: policyDigest(policy) }),
  ),
);

const AGENCY_POLICY_VERSIONS = Object.freeze(
  Object.fromEntries(
    AGENCY_POLICY_MANIFEST.map(({ key, version }) => [key, version]),
  ),
);

const AGENCY_POLICY_MANIFEST_VERSION = sha256(
  JSON.stringify(
    AGENCY_POLICY_MANIFEST.map(({ key, version, url, contentDigest }) => ({
      key,
      version,
      url,
      contentDigest,
    })),
  ),
);

function legalError(code, message, status = 403) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function isAllowedPolicyUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

function assertConfiguredManifest(manifest = AGENCY_POLICY_MANIFEST) {
  if (
    !Array.isArray(manifest) ||
    manifest.length !== 5 ||
    new Set(manifest.map((policy) => policy.key)).size !== manifest.length ||
    manifest.some(
      (policy) =>
        !policy.key ||
        !policy.version ||
        !policy.title ||
        !policy.copy ||
        !isAllowedPolicyUrl(policy.url) ||
        !/^sha256:[a-f0-9]{64}$/.test(policy.contentDigest || ""),
    )
  ) {
    throw legalError(
      "AGENCY_POLICY_MANIFEST_UNAVAILABLE",
      "Agency policy configuration is unavailable. Workspace access remains closed.",
      503,
    );
  }
  return manifest;
}

function actorFromSession(session = {}) {
  return {
    agencyId: session.agencyId || null,
    memberUserId: session.memberUserId || null,
    membershipId: session.agencyMembershipId || null,
  };
}

async function requireActiveAgencyMember(session, db = knex) {
  const actor = actorFromSession(session);
  if (!actor.agencyId || !actor.memberUserId || !actor.membershipId) {
    throw legalError(
      "ACTIVE_AGENCY_MEMBERSHIP_REQUIRED",
      "An active agency membership is required to access this workspace.",
    );
  }

  const membership = await db("agency_memberships as membership")
    .join("agencies as agency", "agency.id", "membership.agency_id")
    .where({
      "membership.id": actor.membershipId,
      "membership.agency_id": actor.agencyId,
      "membership.user_id": actor.memberUserId,
      "membership.status": "ACTIVE",
      "agency.status": "ACTIVE",
    })
    .select("membership.id")
    .first();

  if (!membership) {
    throw legalError(
      "ACTIVE_AGENCY_MEMBERSHIP_REQUIRED",
      "An active agency membership is required to access this workspace.",
    );
  }
  return actor;
}

function findCurrentAcceptanceBatch(rows, manifest = AGENCY_POLICY_MANIFEST) {
  const batches = new Map();
  for (const row of rows || []) {
    if (!batches.has(row.acceptance_batch_id)) {
      batches.set(row.acceptance_batch_id, []);
    }
    batches.get(row.acceptance_batch_id).push(row);
  }

  const current = Array.from(batches.values())
    .filter((batch) =>
      manifest.every((policy) =>
        batch.some(
          (row) =>
            row.policy_key === policy.key &&
            row.policy_version === policy.version &&
            row.policy_url === policy.url &&
            row.content_digest === policy.contentDigest,
        ),
      ),
    )
    .sort(
      (left, right) =>
        new Date(right[0]?.accepted_at || 0).getTime() -
        new Date(left[0]?.accepted_at || 0).getTime(),
    );

  return current[0] || null;
}

async function getAgencyLegalAcceptance(session, db = knex) {
  const manifest = assertConfiguredManifest();
  const actor = await requireActiveAgencyMember(session, db);
  const rows = await db("agency_member_legal_acceptances")
    .where({
      agency_id: actor.agencyId,
      member_user_id: actor.memberUserId,
      membership_id: actor.membershipId,
    })
    .orderBy("accepted_at", "desc");
  return findCurrentAcceptanceBatch(rows, manifest);
}

async function hasCurrentAgencyLegalAcceptance(session, db = knex) {
  return Boolean(await getAgencyLegalAcceptance(session, db));
}

async function getAgencyLegalStatus(session, db = knex) {
  const manifest = assertConfiguredManifest();
  const batch = await getAgencyLegalAcceptance(session, db);
  return {
    needsAcceptance: !batch,
    acceptedAt: batch?.[0]?.accepted_at || null,
    manifestVersion: AGENCY_POLICY_MANIFEST_VERSION,
    policies: manifest,
    versions: AGENCY_POLICY_VERSIONS,
  };
}

function validateSubmittedManifest(acceptance, manifest = AGENCY_POLICY_MANIFEST) {
  const submitted = acceptance?.acceptances;
  if (
    acceptance?.manifestVersion !== AGENCY_POLICY_MANIFEST_VERSION ||
    !Array.isArray(submitted) ||
    submitted.length !== manifest.length ||
    !manifest.every((policy) =>
      submitted.some(
        (item) =>
          item?.policyKey === policy.key &&
          item?.version === policy.version &&
          item?.contentDigest === policy.contentDigest &&
          item?.accepted === true,
      ),
    )
  ) {
    throw legalError(
      "AGENCY_POLICY_MANIFEST_STALE",
      "The agency policies changed before acceptance was recorded. Review the current versions and try again.",
      409,
    );
  }
}

async function recordAgencyLegalAcceptance(
  session,
  acceptance,
  metadata = {},
  db = knex,
) {
  const manifest = assertConfiguredManifest();
  const actor = await requireActiveAgencyMember(session, db);
  validateSubmittedManifest(acceptance, manifest);

  const acceptanceBatchId = uuidv4();
  const acceptedAt = db.fn.now();
  const rows = manifest.map((policy) => ({
    id: uuidv4(),
    acceptance_batch_id: acceptanceBatchId,
    agency_id: actor.agencyId,
    member_user_id: actor.memberUserId,
    membership_id: actor.membershipId,
    policy_key: policy.key,
    policy_version: policy.version,
    policy_url: policy.url,
    content_digest: policy.contentDigest,
    accepted_at: acceptedAt,
    ip_address: metadata.ipAddress || null,
    user_agent: metadata.userAgent || null,
    created_at: acceptedAt,
  }));

  await db.transaction(async (trx) => {
    // Evidence is append-only: policy changes create a new immutable batch.
    await trx("agency_member_legal_acceptances").insert(rows);
  });

  return getAgencyLegalStatus(session, db);
}

module.exports = {
  AGENCY_POLICY_MANIFEST,
  AGENCY_POLICY_MANIFEST_VERSION,
  AGENCY_POLICY_VERSIONS,
  actorFromSession,
  assertConfiguredManifest,
  requireActiveAgencyMember,
  findCurrentAcceptanceBatch,
  getAgencyLegalAcceptance,
  hasCurrentAgencyLegalAcceptance,
  getAgencyLegalStatus,
  validateSubmittedManifest,
  recordAgencyLegalAcceptance,
};
