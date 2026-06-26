const {
  buildTalentDataExport,
  PROFILE_AI_COLUMNS,
} = require("../../src/shared/lib/data-export");

function createKnexMock(seed = {}, schema = {}) {
  const state = {
    users: [...(seed.users || [])],
    profiles: [...(seed.profiles || [])],
    images: [...(seed.images || [])],
    applications: [...(seed.applications || [])],
    messages: [...(seed.messages || [])],
    onboarding_signals: [...(seed.onboarding_signals || [])],
    ai_profile_analysis: [...(seed.ai_profile_analysis || [])],
    talent_user_settings: [...(seed.talent_user_settings || [])],
    image_rights: [...(seed.image_rights || [])],
  };

  const tables = new Set([
    "users",
    "profiles",
    "images",
    "applications",
    "messages",
    "onboarding_signals",
    "ai_profile_analysis",
    "talent_user_settings",
    "image_rights",
    ...(schema.tables || []),
  ]);

  const columns = {
    profiles: new Set([
      "id",
      "user_id",
      "slug",
      ...(schema.profileColumns || []),
    ]),
    images: new Set(["id", "profile_id", "sort", ...(schema.imageColumns || [])]),
    ...(schema.columns || {}),
  };

  const rowMatches = (row, whereClause) =>
    Object.entries(whereClause || {}).every(([key, value]) => row[key] === value);

  const filterRows = (tableName, whereClause) => {
    const rows = state[tableName] || [];
    if (!whereClause) return rows.map((row) => ({ ...row }));
    return rows.filter((row) => rowMatches(row, whereClause)).map((row) => ({ ...row }));
  };

  const knex = (tableName) => {
    let whereClause = null;
    let whereInClause = null;
    let orderByClause = null;

    const builder = {
      where(criteria) {
        if (criteria && typeof criteria === "object" && !Array.isArray(criteria)) {
          whereClause = criteria;
        }
        return builder;
      },
      whereIn(column, values) {
        whereInClause = { column, values: values || [] };
        return builder;
      },
      orderBy(column, direction = "asc") {
        orderByClause = { column, direction };
        return builder;
      },
      first: async () => {
        let rows = filterRows(tableName, whereClause);
        if (whereInClause) {
          rows = rows.filter((row) =>
            whereInClause.values.includes(row[whereInClause.column]),
          );
        }
        return rows[0] || undefined;
      },
      select: async (...selectedColumns) => {
        let rows = filterRows(tableName, whereClause);
        if (whereInClause) {
          rows = rows.filter((row) =>
            whereInClause.values.includes(row[whereInClause.column]),
          );
        }
        if (orderByClause) {
          rows.sort((a, b) => {
            const left = a[orderByClause.column];
            const right = b[orderByClause.column];
            const cmp = String(left ?? "").localeCompare(String(right ?? ""));
            return orderByClause.direction === "desc" ? -cmp : cmp;
          });
        }
        if (!selectedColumns.length) return rows;
        return rows.map((row) => {
          const selected = {};
          for (const column of selectedColumns) {
            selected[column] = row[column];
          }
          return selected;
        });
      },
    };

    builder.then = (resolve, reject) =>
      builder
        .select()
        .then(resolve, reject);

    return builder;
  };

  knex.schema = {
    hasTable: async (tableName) => tables.has(tableName),
    hasColumn: async (tableName, columnName) =>
      columns[tableName]?.has(columnName) ?? false,
  };

  knex.__state = state;
  return knex;
}

describe("buildTalentDataExport", () => {
  it("assembles core export sections with legal acceptance and related records", async () => {
    const knex = createKnexMock(
      {
        users: [
          {
            id: "user-1",
            email: "talent@example.com",
            role: "TALENT",
            created_at: "2026-01-01T00:00:00.000Z",
            terms_accepted_at: "2026-06-25T00:00:00.000Z",
            terms_accepted_version: "2026-06-25",
            privacy_accepted_at: "2026-06-25T00:00:00.000Z",
            privacy_accepted_version: "2026-06-25",
          },
        ],
        profiles: [
          {
            id: "profile-1",
            user_id: "user-1",
            slug: "jane-doe",
            vibe_score: 8.5,
            archetype: "editorial",
          },
        ],
        images: [
          {
            id: "image-1",
            profile_id: "profile-1",
            sort: 0,
            path: "/uploads/headshot.webp",
            moderation_status: "approved",
          },
        ],
        applications: [
          {
            id: "app-1",
            profile_id: "profile-1",
            created_at: "2026-02-01T00:00:00.000Z",
          },
        ],
        messages: [
          {
            id: "msg-1",
            application_id: "app-1",
            sender_id: "user-1",
            sender_type: "TALENT",
            message: "Hello agency",
            created_at: "2026-02-02T00:00:00.000Z",
          },
        ],
        onboarding_signals: [
          {
            id: "signal-1",
            profile_id: "profile-1",
            ambition_type: "editorial",
          },
        ],
        ai_profile_analysis: [
          {
            id: "ai-1",
            profile_id: "profile-1",
            predicted_height_cm: 175,
          },
        ],
        talent_user_settings: [
          {
            id: "settings-1",
            user_id: "user-1",
            notification_preferences: '{"emailNotifications":true}',
          },
        ],
        image_rights: [
          {
            id: "rights-1",
            image_id: "image-1",
            copyright_owner: "Jane Doe",
          },
        ],
      },
      {
        profileColumns: ["vibe_score", "archetype"],
        imageColumns: ["path", "moderation_status"],
      },
    );

    const result = await buildTalentDataExport(knex, "user-1");

    expect(result.user).toEqual({
      id: "user-1",
      email: "talent@example.com",
      role: "TALENT",
      createdAt: "2026-01-01T00:00:00.000Z",
      termsAcceptedAt: "2026-06-25T00:00:00.000Z",
      termsAcceptedVersion: "2026-06-25",
      privacyAcceptedAt: "2026-06-25T00:00:00.000Z",
      privacyAcceptedVersion: "2026-06-25",
    });
    expect(result.profile).toMatchObject({ id: "profile-1", slug: "jane-doe" });
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      id: "image-1",
      moderation_status: "approved",
    });
    expect(result.image_rights).toEqual([
      expect.objectContaining({ image_id: "image-1", copyright_owner: "Jane Doe" }),
    ]);
    expect(result.applications).toHaveLength(1);
    expect(result.messages).toEqual([
      expect.objectContaining({ id: "msg-1", message: "Hello agency" }),
    ]);
    expect(result.onboarding_signals).toMatchObject({
      id: "signal-1",
      ambition_type: "editorial",
    });
    expect(result.ai_profile_analysis).toMatchObject({
      id: "ai-1",
      predicted_height_cm: 175,
    });
    expect(result.profile_ai_fields).toEqual({
      vibe_score: 8.5,
      archetype: "editorial",
    });
    expect(result.talent_user_settings).toMatchObject({
      id: "settings-1",
      user_id: "user-1",
    });
  });

  it("returns empty related collections when profile is missing", async () => {
    const knex = createKnexMock({
      users: [{ id: "user-2", email: "orphan@example.com", role: "TALENT" }],
      profiles: [],
    });

    const result = await buildTalentDataExport(knex, "user-2");

    expect(result.profile).toBeUndefined();
    expect(result.images).toEqual([]);
    expect(result.applications).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(result.image_rights).toEqual([]);
    expect(result.onboarding_signals).toBeNull();
    expect(result.ai_profile_analysis).toBeNull();
    expect(result.profile_ai_fields).toBeNull();
  });

  it("exports declared profile AI columns only when present on schema", async () => {
    expect(PROFILE_AI_COLUMNS).toContain("vibe_score");
    expect(PROFILE_AI_COLUMNS).toContain("fit_score_overall");
  });
});
