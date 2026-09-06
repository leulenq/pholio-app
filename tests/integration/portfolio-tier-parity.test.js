"use strict";

/**
 * Product invariant: the public portfolio page must be identical for every
 * talent regardless of payment tier. Payment may only change what the talent
 * KEEPS (e.g. PDF exports) — never what a visitor (agency or otherwise) sees
 * on the public /portfolio/:slug page. This guards against reintroducing an
 * `is_pro` fork in src/routes/portfolio.js or views/portfolio/show.ejs.
 */

process.env.NODE_ENV = "test";
const path = require("path");
const request = require("supertest");
const ejs = require("ejs");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

jest.setTimeout(60000);

const SHOW_TEMPLATE = path.join(__dirname, "../../views/portfolio/show.ejs");

// Base locals a real render always provides (see src/routes/portfolio.js).
// `is_pro` is included on the mock profiles on purpose — it exercises the
// invariant directly: the template must produce byte-identical output
// whether this field is true, false, or absent.
function renderShow({ isPro, images = [] } = {}) {
  const profile = {
    first_name: isPro ? "Pro" : "Free",
    last_name: "Talent",
    city: "New York, NY",
    slug: `unit-${isPro ? "pro" : "free"}`,
    bio_curated: "A working professional with a diverse editorial and commercial book.",
    hero_image_path: null,
    gender: "Female",
    is_pro: isPro,
    languages: JSON.stringify(["English", "French"]),
    availability_travel: true,
    availability_schedule: "Full-time",
    experience_level: "Experienced",
    training: "Formal training in commercial and editorial technique.",
    portfolio_url: "https://example.com/book",
    instagram_handle: "tierparitytest",
    instagram_url: "https://www.instagram.com/tierparitytest",
    twitter_handle: null,
    twitter_url: null,
    tiktok_handle: null,
    tiktok_url: null,
    nationality: "Canadian",
    union_membership: null,
    ethnicity: null,
    tattoos: true,
    piercings: true,
  };
  return ejs.renderFile(SHOW_TEMPLATE, {
    profile,
    images,
    stats: null,
    ageBand: "18+",
  });
}

async function createProfile({ isPro }) {
  const userId = uuidv4();
  const profileId = uuidv4();

  await knex("users").insert({
    id: userId,
    email: `tier-parity-${userId}@example.com`,
    password_hash: "x",
    role: "TALENT",
  });

  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `tier-parity-${isPro ? "pro" : "free"}-${profileId.slice(0, 8)}`,
    first_name: isPro ? "Pro" : "Free",
    last_name: "Talent",
    city: "New York, NY",
    height_cm: 178,
    bio_raw: "",
    bio_curated: "A working professional with a diverse editorial and commercial book.",
    is_pro: isPro,
    is_public: true,
    date_of_birth: "1990-01-01", // adult, never minor-gated
    phone: "555-0100",
    // Fields that were previously gated behind is_pro in the template —
    // populated identically on both profiles to prove tier no longer matters.
    // (tattoos/piercings are covered by the direct-render suite below instead
    // of here: sqlite3 returns boolean columns as 0/1, not JS `true`/`false`,
    // so a DB round-trip can't exercise the template's `=== true` check the
    // way a real Postgres boolean does.)
    languages: JSON.stringify(["English", "French"]),
    availability_travel: true,
    availability_schedule: "Full-time",
    experience_level: "Experienced",
    training: "Formal training in commercial and editorial technique.",
    nationality: "Canadian",
  });

  await knex("social_accounts").insert({
    id: uuidv4(),
    profile_id: profileId,
    platform: "instagram",
    handle: "tierparitytest",
    url: "https://www.instagram.com/tierparitytest",
  });

  const slug = (await knex("profiles").where({ id: profileId }).first()).slug;
  return { userId, profileId, slug };
}

let proSlug;
let freeSlug;

beforeAll(async () => {
  await knex.migrate.latest();
  proSlug = (await createProfile({ isPro: true })).slug;
  freeSlug = (await createProfile({ isPro: false })).slug;
});

afterAll(async () => {
  await knex.destroy();
});

describe("public portfolio renders identically regardless of payment tier", () => {
  test.each([
    ["pro", () => proSlug],
    ["free", () => freeSlug],
  ])("%s profile: full content, linked socials, no tier badge", async (_label, getSlug) => {
    const res = await request(app).get(`/portfolio/${getSlug()}`);
    expect(res.status).toBe(200);
    const body = res.text;

    // Previously is_pro-gated sections must render for every tier.
    expect(body).toContain("Languages");
    expect(body).toContain("Availability");
    expect(body).toContain("Experience");
    expect(body).toContain("Training");
    expect(body).toContain("Additional Information");
    expect(body).toContain("Nationality");

    // Social handles must be hyperlinked for every tier, never plain text.
    expect(body).toContain('<a href="https://www.instagram.com/tierparitytest"');
    expect(body).toContain("Instagram: @tierparitytest");

    // No tier badge / fork markers anywhere.
    expect(body).not.toContain("Studio+");
    expect(body).not.toContain("portfolio-pro-badge");
    expect(body).not.toContain("portfolio-pro-wrapper");
  });

  test("pro and free profiles render the exact same set of sections", async () => {
    const [proRes, freeRes] = await Promise.all([
      request(app).get(`/portfolio/${proSlug}`),
      request(app).get(`/portfolio/${freeSlug}`),
    ]);
    expect(proRes.status).toBe(200);
    expect(freeRes.status).toBe(200);

    const sectionHeadings = (html) =>
      Array.from(html.matchAll(/<h[23][^>]*>([^<]+)<\/h[23]>/g)).map((m) => m[1].trim());

    expect(sectionHeadings(freeRes.text)).toEqual(sectionHeadings(proRes.text));
  });
});

describe("views/portfolio/show.ejs renders byte-identical content for is_pro true/false/absent", () => {
  test("tattoo/piercing, additional-info, and social sections render for every tier", async () => {
    const [proHtml, freeHtml] = await Promise.all([
      renderShow({ isPro: true }),
      renderShow({ isPro: false }),
    ]);

    for (const html of [proHtml, freeHtml]) {
      expect(html).toContain("Physical Characteristics");
      expect(html).toContain("Has visible tattoos");
      expect(html).toContain("Has visible piercings");
      expect(html).toContain("Additional Information");
      expect(html).toContain("Nationality");
      expect(html).toContain('<a href="https://www.instagram.com/tierparitytest"');
      expect(html).toContain("Instagram: @tierparitytest");
      expect(html).not.toContain("Studio+");
      expect(html).not.toContain("portfolio-pro-badge");
      expect(html).not.toContain("portfolio-pro-wrapper");
      expect(html).not.toContain("portfolio-pro-eyebrow");
    }
  });

  test("pro and free renders are identical apart from the name/slug fields that differ by design", async () => {
    const [proHtml, freeHtml] = await Promise.all([
      renderShow({ isPro: true }),
      renderShow({ isPro: false }),
    ]);

    const normalize = (html) =>
      html.replaceAll("Pro Talent", "X").replaceAll("unit-pro", "unit-x").replaceAll("Free Talent", "X").replaceAll("unit-free", "unit-x");

    expect(normalize(freeHtml)).toEqual(normalize(proHtml));
  });

  test("optional sections are omitted (no empty headers) when their fields are absent", async () => {
    const html = await ejs.renderFile(SHOW_TEMPLATE, {
      profile: {
        first_name: "Minimal",
        last_name: "Talent",
        city: "Nowhere",
        slug: "unit-minimal",
        bio_curated: "Bio.",
        hero_image_path: null,
        gender: null,
        languages: null,
        availability_travel: null,
        availability_schedule: null,
        experience_level: null,
        training: null,
        portfolio_url: null,
        instagram_handle: null,
        instagram_url: null,
        twitter_handle: null,
        twitter_url: null,
        tiktok_handle: null,
        tiktok_url: null,
        nationality: null,
        union_membership: null,
        ethnicity: null,
        tattoos: false,
        piercings: false,
      },
      images: [],
      stats: null,
      ageBand: null,
    });

    expect(html).not.toContain("Training");
    expect(html).not.toContain("Portfolio");
    expect(html).not.toContain("Social Media");
    expect(html).not.toContain("Additional Information");
    expect(html).not.toContain("Physical Characteristics");
    expect(html).not.toContain("Studio+");
  });
});
