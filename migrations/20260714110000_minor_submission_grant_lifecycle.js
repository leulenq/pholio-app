"use strict";

const MINOR_GRANT_TTL_DAYS = 365;

function isMinorAt(dateOfBirth, at) {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  const when = new Date(at || Date.now());
  if (!Number.isFinite(dob.getTime()) || !Number.isFinite(when.getTime())) {
    return false;
  }
  let age = when.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    when.getUTCMonth() < dob.getUTCMonth() ||
    (when.getUTCMonth() === dob.getUTCMonth() &&
      when.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age < 18;
}

exports.up = async function up(knex) {
  if (await knex.schema.hasTable("minor_agency_consents")) {
    await knex.schema.alterTable("minor_agency_consents", (table) => {
      table.dropUnique(
        ["profile_id", "agency_id"],
        "uq_minor_agency_consents_profile_agency",
      );
    });

    const grantColumns = {
      authorization_expires_at: await knex.schema.hasColumn(
        "minor_agency_consents",
        "authorization_expires_at",
      ),
      revocation_reason: await knex.schema.hasColumn(
        "minor_agency_consents",
        "revocation_reason",
      ),
    };
    await knex.schema.alterTable("minor_agency_consents", (table) => {
      if (!grantColumns.authorization_expires_at) {
        table.timestamp("authorization_expires_at").nullable().index();
      }
      if (!grantColumns.revocation_reason) {
        table.string("revocation_reason", 80).nullable();
      }
    });
    await knex.raw(
      "create unique index if not exists uq_minor_agency_consents_request on minor_agency_consents (consent_request_id)",
    );
    await knex.raw(
      "create index if not exists idx_minor_agency_consent_access on minor_agency_consents (profile_id, agency_id, revoked_at, authorization_expires_at)",
    );

    const grants = await knex("minor_agency_consents")
      .whereNull("authorization_expires_at")
      .select("id", "verified_at");
    for (const grant of grants) {
      const expiresAt = new Date(grant.verified_at || Date.now());
      expiresAt.setUTCDate(expiresAt.getUTCDate() + MINOR_GRANT_TTL_DAYS);
      await knex("minor_agency_consents")
        .where({ id: grant.id })
        .update({ authorization_expires_at: expiresAt.toISOString() });
    }
  }

  const applicationColumns = {
    minor_at_submission: await knex.schema.hasColumn(
      "applications",
      "minor_at_submission",
    ),
    guardian_consent_grant_id: await knex.schema.hasColumn(
      "applications",
      "guardian_consent_grant_id",
    ),
    guardian_consent_expires_at: await knex.schema.hasColumn(
      "applications",
      "guardian_consent_expires_at",
    ),
    minor_access_revoked_at: await knex.schema.hasColumn(
      "applications",
      "minor_access_revoked_at",
    ),
    minor_access_revocation_reason: await knex.schema.hasColumn(
      "applications",
      "minor_access_revocation_reason",
    ),
  };
  await knex.schema.alterTable("applications", (table) => {
    if (!applicationColumns.minor_at_submission) {
      table.boolean("minor_at_submission").notNullable().defaultTo(false);
    }
    if (!applicationColumns.guardian_consent_grant_id) {
      table
        .uuid("guardian_consent_grant_id")
        .nullable()
        .references("id")
        .inTable("minor_agency_consents")
        .onDelete("RESTRICT");
    }
    if (!applicationColumns.guardian_consent_expires_at) {
      table.timestamp("guardian_consent_expires_at").nullable();
    }
    if (!applicationColumns.minor_access_revoked_at) {
      table.timestamp("minor_access_revoked_at").nullable();
    }
    if (!applicationColumns.minor_access_revocation_reason) {
      table.string("minor_access_revocation_reason", 80).nullable();
    }
  });
  await knex.raw(
    "create index if not exists idx_applications_minor_access on applications (agency_id, minor_at_submission, minor_access_revoked_at)",
  );
  await knex.raw(
    "create index if not exists idx_applications_guardian_consent_grant on applications (guardian_consent_grant_id)",
  );

  if (await knex.schema.hasTable("talent_submission_packages")) {
    const packageColumns = {
      guardian_consent_grant_id: await knex.schema.hasColumn(
        "talent_submission_packages",
        "guardian_consent_grant_id",
      ),
      guardian_consent_expires_at: await knex.schema.hasColumn(
        "talent_submission_packages",
        "guardian_consent_expires_at",
      ),
    };
    await knex.schema.alterTable("talent_submission_packages", (table) => {
      if (!packageColumns.guardian_consent_grant_id) {
        table
          .uuid("guardian_consent_grant_id")
          .nullable()
          .references("id")
          .inTable("minor_agency_consents")
          .onDelete("RESTRICT");
      }
      if (!packageColumns.guardian_consent_expires_at) {
        table.timestamp("guardian_consent_expires_at").nullable();
      }
    });
    await knex.raw(
      "create index if not exists idx_submission_packages_guardian_grant on talent_submission_packages (guardian_consent_grant_id)",
    );
  }

  if (await knex.schema.hasTable("application_submission_consent_events")) {
    const hasGrant = await knex.schema.hasColumn(
      "application_submission_consent_events",
      "guardian_consent_grant_id",
    );
    if (!hasGrant) {
      await knex.schema.alterTable(
        "application_submission_consent_events",
        (table) => {
          table
            .uuid("guardian_consent_grant_id")
            .nullable()
            .references("id")
            .inTable("minor_agency_consents")
            .onDelete("RESTRICT");
        },
      );
    }
    await knex.raw(
      "create index if not exists idx_submission_events_guardian_grant on application_submission_consent_events (guardian_consent_grant_id)",
    );
  }

  // Historical submissions fail closed. Bind an exact grant only when the
  // immutable submission event identifies the verified request that created it.
  const rows = await knex("applications as a")
    .join("profiles as p", "p.id", "a.profile_id")
    .select(
      "a.id",
      "a.created_at",
      "a.status",
      "p.date_of_birth",
    );
  for (const row of rows) {
    if (!isMinorAt(row.date_of_birth, row.created_at)) continue;

    const event = await knex("application_submission_consent_events")
      .where({ application_id: row.id })
      .whereNotNull("guardian_consent_request_id")
      .orderBy("created_at", "desc")
      .first("guardian_consent_request_id");
    const grant = event
      ? await knex("minor_agency_consents")
          .where({ consent_request_id: event.guardian_consent_request_id })
          .first("id", "authorization_expires_at", "revoked_at")
      : null;
    const valid =
      grant &&
      !grant.revoked_at &&
      new Date(grant.authorization_expires_at).getTime() > Date.now();
    await knex("applications")
      .where({ id: row.id })
      .update({
        minor_at_submission: true,
        guardian_consent_grant_id: grant?.id || null,
        guardian_consent_expires_at: grant?.authorization_expires_at || null,
        minor_access_revoked_at: valid ? null : knex.fn.now(),
        minor_access_revocation_reason: valid
          ? null
          : "legacy_missing_or_expired_guardian_grant",
        ...(valid ? {} : { status: "withdrawn" }),
      });
    if (!valid) {
      if (await knex.schema.hasTable("application_note_audit_events")) {
        await knex("application_note_audit_events")
          .where({ application_id: row.id })
          .update({ before_note: null, after_note: null });
      }
      for (const table of [
        "application_notes",
        "application_tags",
        "messages",
        "message_reply_tokens",
        "reminders",
        "interviews",
        "board_applications",
        "application_activities",
        "application_submission_boards",
      ]) {
        if (await knex.schema.hasTable(table)) {
          await knex(table).where({ application_id: row.id }).delete();
        }
      }
      if (await knex.schema.hasTable("talent_submission_packages")) {
        await knex("talent_submission_packages")
          .where({ application_id: row.id })
          .update({
            payload: JSON.stringify({
              redacted: true,
              reason: "legacy_missing_or_expired_guardian_grant",
            }),
            revoked_at: knex.fn.now(),
            redacted_at: knex.fn.now(),
            redaction_reason: "legacy_missing_or_expired_guardian_grant",
          });
      }
      if (await knex.schema.hasTable("notifications")) {
        await knex("notifications")
          .where({ source_type: "application", source_id: row.id })
          .delete();
      }
    }
    if (grant && (await knex.schema.hasTable("talent_submission_packages"))) {
      await knex("talent_submission_packages")
        .where({ application_id: row.id })
        .update({
          guardian_consent_grant_id: grant.id,
          guardian_consent_expires_at: grant.authorization_expires_at,
        });
    }
    if (event && grant) {
      await knex("application_submission_consent_events")
        .where({ application_id: row.id })
        .update({ guardian_consent_grant_id: grant.id });
    }
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable("application_submission_consent_events")) {
    if (
      await knex.schema.hasColumn(
        "application_submission_consent_events",
        "guardian_consent_grant_id",
      )
    ) {
      await knex.schema.alterTable(
        "application_submission_consent_events",
        (table) => {
          table.dropColumn("guardian_consent_grant_id");
        },
      );
    }
  }
  if (await knex.schema.hasTable("talent_submission_packages")) {
    await knex.schema.alterTable("talent_submission_packages", (table) => {
      table.dropColumn("guardian_consent_grant_id");
      table.dropColumn("guardian_consent_expires_at");
    });
  }
  await knex.schema.alterTable("applications", (table) => {
    table.dropColumn("guardian_consent_grant_id");
    table.dropColumn("guardian_consent_expires_at");
    table.dropColumn("minor_access_revoked_at");
    table.dropColumn("minor_access_revocation_reason");
    table.dropColumn("minor_at_submission");
  });
  if (await knex.schema.hasTable("minor_agency_consents")) {
    await knex.schema.alterTable("minor_agency_consents", (table) => {
      table.dropUnique(
        ["consent_request_id"],
        "uq_minor_agency_consents_request",
      );
      table.dropColumn("authorization_expires_at");
      table.dropColumn("revocation_reason");
      table.unique(
        ["profile_id", "agency_id"],
        "uq_minor_agency_consents_profile_agency",
      );
    });
  }
};

exports.MINOR_GRANT_TTL_DAYS = MINOR_GRANT_TTL_DAYS;
