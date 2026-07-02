const { v4: uuidv4 } = require("uuid");
const knex = require("../src/shared/db/knex");
const {
  upsertUserNotification,
  listUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notifyTalentApplicationStatusChange,
} = require("../src/shared/services/notifications");

describe("notifications service", () => {
  let userId;
  const groupKey = `test_group:${Date.now()}`;

  beforeAll(async () => {
    const hasTable = await knex.schema.hasTable("notifications");
    if (!hasTable) {
      throw new Error("notifications table missing — run migrations first");
    }

    const talent = await knex("users").where({ role: "TALENT" }).first();
    if (!talent) {
      throw new Error("No TALENT user in database — run seed first");
    }
    userId = talent.id;
  });

  afterAll(async () => {
    if (userId) {
      await knex("notifications")
        .where({ user_id: userId, group_key: groupKey })
        .del();
      await knex("notifications")
        .where({ user_id: userId })
        .where("group_key", "like", `${groupKey}%`)
        .del();
    }
  });

  it("groups repeat events by group_key and reopens unread", async () => {
    await knex("notifications").where({ user_id: userId }).del();

    await upsertUserNotification({
      userId,
      type: "agency_profile_view",
      title: "Agency viewed your profile",
      body: "First view",
      routeTarget: "/dashboard/talent/analytics",
      groupKey,
      reopenOnRepeat: true,
    });

    await upsertUserNotification({
      userId,
      type: "agency_profile_view",
      title: "Agency viewed your profile",
      body: "Second view",
      routeTarget: "/dashboard/talent/analytics",
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
});
