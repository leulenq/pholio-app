"use strict";

const knex = require("../src/shared/db/knex");
const { v4: uuidv4 } = require("uuid");

const TALENT_EMAIL = "talent@example.com";
const DAYS = 30;

function eventRow(profileId, eventType, createdAt, metadata, ipAddress) {
  return {
    id: uuidv4(),
    profile_id: profileId,
    event_type: eventType,
    event_source: "web",
    metadata: JSON.stringify(metadata),
    ip_address: ipAddress,
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    created_at: createdAt.toISOString(),
  };
}

async function seedAnalyticsData() {
  try {
    const user = await knex("users").where({ email: TALENT_EMAIL }).first();
    const profile = user
      ? await knex("profiles").where({ user_id: user.id }).first()
      : null;

    if (!profile) {
      throw new Error(
        `Mia Voss demo profile was not found for ${TALENT_EMAIL}. Run npm run seed first.`,
      );
    }

    const now = new Date();
    const currentUtcMidnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const visitorIds = Array.from({ length: 18 }, () => uuidv4());
    const referrers = [
      null,
      null,
      "https://instagram.com",
      "https://google.com",
      "https://tiktok.com",
    ];
    const sessions = [];
    const events = [];

    for (let daysBack = DAYS - 1; daysBack >= 0; daysBack -= 1) {
      const dayIndex = DAYS - 1 - daysBack;
      const dayStart = currentUtcMidnight - daysBack * 24 * 60 * 60 * 1000;
      const weekday = new Date(dayStart).getUTCDay();
      const weekendLift = weekday === 0 || weekday === 6 ? 2 : 0;
      const dailyVisits = 4 + Math.floor(dayIndex / 5) + weekendLift;

      for (let visitIndex = 0; visitIndex < dailyVisits; visitIndex += 1) {
        const visitorIndex = (dayIndex * 3 + visitIndex) % visitorIds.length;
        const visitorId = visitorIds[visitorIndex];
        const referrer = referrers[(dayIndex + visitIndex) % referrers.length];
        const ipAddress = `198.51.100.${20 + visitorIndex}`;
        const normalVisitTime =
          dayStart +
          (9 + (visitIndex % 11)) * 60 * 60 * 1000 +
          ((dayIndex * 7 + visitIndex * 11) % 60) * 60 * 1000;
        const viewTime =
          daysBack === 0
            ? new Date(
                now.getTime() -
                  (dailyVisits - visitIndex + 3) * 2 * 60 * 1000,
              )
            : new Date(normalVisitTime);
        const sessionId = uuidv4();

        sessions.push({
          id: sessionId,
          profile_id: profile.id,
          visitor_id: visitorId,
          started_at: viewTime.toISOString(),
          last_activity_at: new Date(
            viewTime.getTime() + 4 * 60 * 1000,
          ).toISOString(),
          ip_address: ipAddress,
          user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
          referrer,
          is_returning: dayIndex > 0 || visitorIndex < dayIndex,
        });

        events.push(
          eventRow(
            profile.id,
            "view",
            viewTime,
            { source: "web", slug: profile.slug, referrer },
            ipAddress,
          ),
        );

        if (visitIndex % 2 === 0) {
          events.push(
            eventRow(
              profile.id,
              "bio_read",
              new Date(viewTime.getTime() + 60 * 1000),
              { duration: 12 + visitIndex },
              ipAddress,
            ),
          );
        }

        if (visitIndex % 4 === 0) {
          events.push(
            eventRow(
              profile.id,
              "social_click",
              new Date(viewTime.getTime() + 2 * 60 * 1000),
              { platform: "instagram" },
              ipAddress,
            ),
          );
        }

        if (visitIndex % 5 === 0) {
          events.push(
            eventRow(
              profile.id,
              "portfolio_click",
              new Date(viewTime.getTime() + 3 * 60 * 1000),
              { target: "portfolio" },
              ipAddress,
            ),
          );
        }

        if (visitIndex % 2 === 1) {
          events.push(
            eventRow(
              profile.id,
              "scroll_depth",
              new Date(viewTime.getTime() + 4 * 60 * 1000),
              { percent: visitIndex % 3 === 0 ? 100 : 75 },
              ipAddress,
            ),
          );
        }
      }
    }

    await knex.transaction(async (trx) => {
      await trx("analytics").where({ profile_id: profile.id }).delete();
      await trx("visitor_sessions").where({ profile_id: profile.id }).delete();
      await trx.batchInsert("visitor_sessions", sessions, 100);
      await trx.batchInsert("analytics", events, 100);
    });

    const outboundClicks = events.filter((event) =>
      ["social_click", "portfolio_click"].includes(event.event_type),
    ).length;

    console.log(`Seeded website analytics for ${profile.first_name} ${profile.last_name}.`);
    console.log({
      profile: profile.slug,
      visits: sessions.length,
      uniqueVisitors: visitorIds.length,
      pageViews: sessions.length,
      outboundClicks,
      days: DAYS,
    });
  } catch (error) {
    console.error("Analytics seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await knex.destroy();
  }
}

seedAnalyticsData();
