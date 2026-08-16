const { v4: uuidv4 } = require("uuid");
const knex = require("../src/shared/db/knex");
const { acceptedLegal } = require("./setup/legal-fixture");
const {
  upsertUserNotification,
  listUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notifyTalentApplicationStatusChange,
  notifyTalentNewMessage,
  markMessageNotificationsReadForApplication,
} = require("../src/shared/services/notifications");

describe("notifications service", () => {
  let userId;
  const groupKey = `test_group:${Date.now()}`;

  /* This suite used to throw "notifications table missing — run migrations
     first" and "No TALENT user in database — run seed first" out of beforeAll,
     which made it unpassable on its own: scripts/run-jest.js hands every run a
     fresh, empty SQLite file, so the table and the seed it demanded only ever
     existed when some earlier suite happened to migrate first. It now migrates
     itself (the media-bulk / tracker / availability idiom) and owns its
     fixture user.

     Owning the user also matters for correctness, not just ordering: the tests
     below run `delete from notifications where user_id = ?` to get a clean
     slate. Pointed at the shared seeded talent — as `where({ role: "TALENT" })
     .first()` did — that wipes notification rows belonging to whatever else is
     exercising the same account. */
  beforeAll(async () => {
    await knex.migrate.latest();

    userId = uuidv4();
    await knex("users").insert({
      id: userId,
      email: `notifications-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
      ...acceptedLegal(),
    });
  }, 120000);

  afterAll(async () => {
    if (userId) {
      await knex("notifications").where({ user_id: userId }).del();
      await knex("users").where({ id: userId }).del();
    }
    await knex.destroy();
  });

  it("groups repeat events by group_key and reopens unread", async () => {
    await knex("notifications").where({ user_id: userId }).del();

    await upsertUserNotification({
      userId,
      type: "agency_profile_view",
      title: "Agency viewed your profile",
      body: "First view",
      routeTarget: "/dashboard/talent",
      groupKey,
      reopenOnRepeat: true,
    });

    await upsertUserNotification({
      userId,
      type: "agency_profile_view",
      title: "Agency viewed your profile",
      body: "Second view",
      routeTarget: "/dashboard/talent",
      groupKey,
      reopenOnRepeat: true,
    });

    const { notifications, unreadCount } = await listUserNotifications(userId);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].occurrenceCount).toBe(2);
    expect(notifications[0].grouped).toBe(true);
    expect(unreadCount).toBe(1);
  });

  it("marks one and all notifications read", async () => {
    await knex("notifications").where({ user_id: userId }).del();

    const id = await upsertUserNotification({
      userId,
      type: "confirmation",
      title: "Test",
      body: "Body",
      routeTarget: "/dashboard/talent",
      groupKey: `${groupKey}:read`,
    });

    await markNotificationRead(userId, id);
    let listed = await listUserNotifications(userId);
    expect(listed.unreadCount).toBe(0);
    expect(listed.notifications[0].isRead).toBe(true);

    await upsertUserNotification({
      userId,
      type: "confirmation",
      title: "Test 2",
      body: "Body",
      routeTarget: "/dashboard/talent",
      groupKey: `${groupKey}:read2`,
    });

    await markAllNotificationsRead(userId);
    listed = await listUserNotifications(userId);
    expect(listed.unreadCount).toBe(0);
  });

  it("notifies a development offer as a high-priority New Face outcome", async () => {
    const applicationId = uuidv4();

    await notifyTalentApplicationStatusChange({
      userId,
      applicationId,
      agencyId: "test-agency",
      agencyName: "North Star Models",
      status: "development",
    });

    const row = await knex("notifications")
      .where({
        user_id: userId,
        group_key: `application_status:${applicationId}:development`,
      })
      .first();

    expect(row).toBeDefined();
    expect(row.title).toBe("Development offer");
    expect(row.body).toContain("develop you as a new face");
    expect(row.priority).toBe("high");

    await knex("notifications").where({ id: row.id }).del();
  });

  it("surfaces an inbound agency message on the bell and clears it on thread open", async () => {
    const applicationId = uuidv4();

    const id = await notifyTalentNewMessage({
      userId,
      applicationId,
      agencyId: "agency-x",
      agencyName: "Elite Model Management",
      preview: "Loved your digitals — can you come in Thursday?",
    });
    expect(id).toBeTruthy();

    let row = await knex("notifications")
      .where({ user_id: userId, group_key: `message:${applicationId}` })
      .first();
    expect(row.type).toBe("message_received");
    expect(row.priority).toBe("high");
    expect(row.title).toContain("Elite Model Management");
    expect(row.route_target).toContain(`thread=${applicationId}`);
    expect(row.read_at).toBeNull();

    // Opening the thread clears the bell.
    await markMessageNotificationsReadForApplication(userId, applicationId);
    row = await knex("notifications").where({ id: row.id }).first();
    expect(row.read_at).not.toBeNull();

    // A follow-up reply re-opens the same grouped conversation as unread.
    await notifyTalentNewMessage({
      userId,
      applicationId,
      agencyId: "agency-x",
      agencyName: "Elite Model Management",
      preview: "Following up on times.",
    });
    row = await knex("notifications").where({ id: row.id }).first();
    expect(row.occurrence_count).toBe(2);
    expect(row.read_at).toBeNull();

    await knex("notifications").where({ id: row.id }).del();
  });
});
