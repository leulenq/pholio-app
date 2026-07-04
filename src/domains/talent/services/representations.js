"use strict";

const { v4: uuidv4 } = require("uuid");
const { z } = require("zod");

const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullable()
  .optional();
const boundedOptional = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null);

const representationInputBaseSchema = z
  .object({
    agency_id: z.string().uuid().nullable().optional(),
    external_agency_name: boundedOptional(160),
    relationship_type: z.enum(["mother", "placement"]),
    market: boundedOptional(120),
    territory: boundedOptional(120),
    division: boundedOptional(100),
    is_exclusive: z.coerce.boolean().optional().default(false),
    started_on: dateValue,
  })
  .strict();

function validateRepresentation(value, ctx) {
    const hasInternal = Boolean(value.agency_id);
    const hasExternal = Boolean(value.external_agency_name);
    if (hasInternal === hasExternal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["external_agency_name"],
        message: "Choose one internal agency or provide an external agency name",
      });
    }
    if (value.relationship_type === "placement" && !value.market) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["market"],
        message: "Market is required for a placement agency",
      });
    }
}

const representationInputSchema =
  representationInputBaseSchema.superRefine(validateRepresentation);
const representationPatchSchema = representationInputBaseSchema
  .partial()
  .superRefine((value, ctx) => {
    if (
      Object.hasOwn(value, "agency_id") &&
      Object.hasOwn(value, "external_agency_name")
    ) {
      const hasInternal = Boolean(value.agency_id);
      const hasExternal = Boolean(value.external_agency_name);
      if (hasInternal === hasExternal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["external_agency_name"],
          message:
            "Choose one internal agency or provide an external agency name",
        });
      }
    }
  });

function normalizedKey(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en-US");
}

function scopeKey(market, territory) {
  return `${normalizedKey(market)}|${normalizedKey(territory)}`;
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function toApi(row) {
  return {
    id: row.id,
    agency_id: row.agency_id || null,
    agency_name: row.agency_name || row.external_agency_name || null,
    external_agency_name: row.external_agency_name || null,
    relationship_type: row.relationship_type,
    market: row.market || null,
    territory: row.territory || null,
    division: row.division || null,
    is_exclusive: Boolean(row.is_exclusive),
    status: row.status,
    started_on: dateOnly(row.started_on),
    ended_on: dateOnly(row.ended_on),
  };
}

function baseQuery(db, profileId) {
  return db("talent_representations as tr")
    .leftJoin("agencies as a", "tr.agency_id", "a.id")
    .where("tr.profile_id", profileId)
    .select("tr.*", "a.name as agency_name");
}

async function listRepresentations(db, profileId, { includeHistory = true } = {}) {
  let query = baseQuery(db, profileId);
  if (!includeHistory) query = query.where("tr.status", "active");
  const rows = await query.orderByRaw(
    "case when tr.status = 'active' then 0 else 1 end, case when tr.relationship_type = 'mother' then 0 else 1 end, tr.started_on asc, tr.created_at asc",
  );
  return rows.map(toApi);
}

async function loadRow(db, profileId, representationId) {
  return db("talent_representations")
    .where({ id: representationId, profile_id: profileId })
    .first();
}

function rowFromInput(profileId, input, existing = {}) {
  const pick = (key, fallback = null) =>
    Object.hasOwn(input, key) ? input[key] : existing[key] ?? fallback;
  const agencyId = pick("agency_id");
  const externalName =
    agencyId === null
      ? pick("external_agency_name")
      : null;
  const market = pick("market");
  const territory = pick("territory");
  return {
    profile_id: profileId,
    agency_id: agencyId,
    external_agency_name: externalName,
    external_agency_key: agencyId === null ? normalizedKey(externalName) : null,
    relationship_type: pick("relationship_type", "placement"),
    market,
    territory,
    scope_key: scopeKey(market, territory),
    division: pick("division"),
    is_exclusive: Boolean(pick("is_exclusive", false)),
    started_on: pick("started_on", dateOnly(existing.started_on)),
    status: "active",
    ended_on: null,
    source: "profile",
  };
}

async function syncLegacyCurrentAgency(db, profileId) {
  const primary = await baseQuery(db, profileId)
    .where("tr.status", "active")
    .orderByRaw(
      "case when tr.relationship_type = 'mother' then 0 else 1 end, tr.started_on asc, tr.created_at asc",
    )
    .first();
  const name = primary
    ? primary.agency_name || primary.external_agency_name || null
    : null;
  await db("profiles")
    .where({ id: profileId })
    .update({ current_agency: name, updated_at: db.fn.now() });
  return name;
}

async function createRepresentation(db, profileId, input) {
  const parsed = representationInputSchema.parse(input);
  const id = uuidv4();
  await db("talent_representations").insert({
    id,
    ...rowFromInput(profileId, parsed),
    created_at: db.fn.now(),
    updated_at: db.fn.now(),
  });
  await syncLegacyCurrentAgency(db, profileId);
  const row = await baseQuery(db, profileId).where("tr.id", id).first();
  return toApi(row);
}

async function updateRepresentation(db, profileId, representationId, input) {
  const existing = await loadRow(db, profileId, representationId);
  if (!existing) return null;
  const candidate = rowFromInput(profileId, input, existing);
  const parsed = representationInputSchema.parse({
    agency_id: candidate.agency_id,
    external_agency_name: candidate.external_agency_name,
    relationship_type: candidate.relationship_type,
    market: candidate.market,
    territory: candidate.territory,
    division: candidate.division,
    is_exclusive: candidate.is_exclusive,
    started_on: candidate.started_on,
  });
  await db("talent_representations")
    .where({ id: representationId, profile_id: profileId })
    .update({
      ...rowFromInput(profileId, parsed, existing),
      updated_at: db.fn.now(),
    });
  await syncLegacyCurrentAgency(db, profileId);
  const row = await baseQuery(db, profileId)
    .where("tr.id", representationId)
    .first();
  return toApi(row);
}

async function endRepresentation(db, profileId, representationId, endedOn) {
  const endedDate = endedOn || new Date().toISOString().slice(0, 10);
  const count = await db("talent_representations")
    .where({ id: representationId, profile_id: profileId, status: "active" })
    .update({
      status: "ended",
      ended_on: endedDate,
      updated_at: db.fn.now(),
    });
  if (!count) return false;
  await syncLegacyCurrentAgency(db, profileId);
  return true;
}

async function replaceActiveRepresentations(db, profileId, inputs) {
  const parsed = z
    .array(z.unknown())
    .max(20)
    .parse(inputs)
    .map((input) => {
      const editable =
        input && typeof input === "object"
          ? {
              agency_id: input.agency_id,
              external_agency_name: input.external_agency_name,
              relationship_type: input.relationship_type,
              market: input.market,
              territory: input.territory,
              division: input.division,
              is_exclusive: input.is_exclusive,
              started_on: input.started_on,
            }
          : {};
      return representationInputSchema.parse(editable);
    });
  if (
    parsed.filter(
      (representation) => representation.relationship_type === "mother",
    ).length > 1
  ) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["representations"],
        message: "Only one active mother agency is allowed",
      },
    ]);
  }
  return db.transaction(async (trx) => {
    const existing = await trx("talent_representations")
      .where({ profile_id: profileId, status: "active" })
      .select("*");
    const existingById = new Map(existing.map((row) => [String(row.id), row]));
    const retainedIds = new Set();

    for (const [index, raw] of inputs.entries()) {
      const id = raw.id ? String(raw.id) : null;
      const value = parsed[index];
      if (id) {
        const current = existingById.get(id);
        if (!current) {
          const error = new Error("Representation not found");
          error.code = "REPRESENTATION_NOT_FOUND";
          throw error;
        }
        await trx("talent_representations")
          .where({ id, profile_id: profileId })
          .update({
            ...rowFromInput(profileId, value, current),
            updated_at: trx.fn.now(),
          });
        retainedIds.add(id);
      } else {
        const newId = uuidv4();
        await trx("talent_representations").insert({
          id: newId,
          ...rowFromInput(profileId, value),
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
        retainedIds.add(newId);
      }
    }

    const endedOn = new Date().toISOString().slice(0, 10);
    for (const row of existing) {
      if (retainedIds.has(String(row.id))) continue;
      await trx("talent_representations")
        .where({ id: row.id, profile_id: profileId })
        .update({
          status: "ended",
          ended_on: endedOn,
          updated_at: trx.fn.now(),
        });
    }
    const currentAgency = await syncLegacyCurrentAgency(trx, profileId);
    const all = await listRepresentations(trx, profileId);
    return {
      active: all.filter((row) => row.status === "active"),
      history: all.filter((row) => row.status === "ended"),
      current_agency: currentAgency,
    };
  });
}

async function syncStructuredRepresentationFromLegacy(db, profileId, rawName) {
  const structured = await db("talent_representations")
    .where({ profile_id: profileId, status: "active", source: "profile" })
    .first();
  if (structured) return syncLegacyCurrentAgency(db, profileId);

  const legacyRows = await db("talent_representations").where({
    profile_id: profileId,
    status: "active",
    source: "legacy",
  });
  const name = String(rawName || "").trim();
  const endedOn = new Date().toISOString().slice(0, 10);

  if (!name) {
    if (legacyRows.length) {
      await db("talent_representations")
        .where({ profile_id: profileId, status: "active", source: "legacy" })
        .update({
          status: "ended",
          ended_on: endedOn,
          updated_at: db.fn.now(),
        });
    }
    return syncLegacyCurrentAgency(db, profileId);
  }

  const first = legacyRows[0];
  if (first) {
    await db("talent_representations")
      .where({ id: first.id, profile_id: profileId })
      .update({
        external_agency_name: name,
        external_agency_key: normalizedKey(name),
        updated_at: db.fn.now(),
      });
  } else {
    await db("talent_representations").insert({
      id: uuidv4(),
      profile_id: profileId,
      agency_id: null,
      external_agency_name: name,
      external_agency_key: normalizedKey(name),
      relationship_type: "mother",
      market: null,
      territory: null,
      scope_key: "|",
      division: null,
      is_exclusive: false,
      status: "active",
      started_on: null,
      ended_on: null,
      source: "legacy",
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
  }
  return syncLegacyCurrentAgency(db, profileId);
}

module.exports = {
  representationInputSchema,
  representationPatchSchema,
  listRepresentations,
  createRepresentation,
  updateRepresentation,
  endRepresentation,
  replaceActiveRepresentations,
  syncLegacyCurrentAgency,
  syncStructuredRepresentationFromLegacy,
};
