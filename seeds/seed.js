const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

/**
 * @param {import('knex')} knex
 */
exports.seed = async function seed(knex) {
  // Delete existing data (optional - comment out if you want to keep existing data)
  await knex("agency_memberships")
    .del()
    .catch(() => {});
  await knex("agencies")
    .del()
    .catch(() => {});
  await knex("commissions").del();
  await knex("images").del();
  await knex("profiles").del();
  await knex("users").del();

  const passwordHash = await bcrypt.hash("password123", 10);

  // Create agency account
  const agencyId = uuidv4();
  await knex("users").insert({
    id: agencyId,
    email: "agency@example.com",
    password_hash: passwordHash,
    role: "AGENCY",
  });

  await knex("agencies").insert({
    id: agencyId,
    name: "Pholio Partner Agency",
    status: "ACTIVE",
  });

  await knex("agency_memberships").insert({
    id: uuidv4(),
    agency_id: agencyId,
    user_id: agencyId,
    membership_role: "OWNER",
    status: "ACTIVE",
  });

  // Create talent account (demo: Mia Voss, Studio+)
  const talentId = uuidv4();
  await knex("users").insert({
    id: talentId,
    email: "talent@example.com",
    password_hash: passwordHash,
    role: "TALENT",
  });

  const profileId = uuidv4();
  await knex("profiles").insert({
    id: profileId,
    user_id: talentId,
    slug: "mia-voss",
    first_name: "Mia",
    last_name: "Voss",
    city: "Los Angeles, CA",
    height_cm: 178,
    weight_kg: 57,
    bust_cm: 81,
    waist_cm: 61,
    hips_cm: 88,
    dress_size: "4",
    shoe_size: "8 US",
    hair_color: "Dark Brown",
    hair_length: "Long",
    eye_color: "Hazel",
    skin_tone: "Medium",
    gender: "Female",
    date_of_birth: "1997-04-12",
    experience_level: "Experienced",
    specialties: JSON.stringify(["Editorial", "Commercial", "Runway"]),
    languages: JSON.stringify(["English", "French"]),
    instagram_handle: "miavoss",
    portfolio_url: "https://miavoss.com",
    twitter_handle: "miavoss",
    bio_raw:
      "LA-based editorial and commercial model with six years of campaign and runway experience.",
    bio_curated:
      "Mia Voss is a Los Angeles-based editorial and commercial model with over six years of campaign and runway experience. Known for her ability to shift between high-fashion editorial and warm commercial presence, she is represented across three continents.",
    training:
      "Formal training in editorial modeling and runway technique. Workshops with Elite Model Management NY (2019), IMG Paris (2021).",
    union_membership: null,
    tattoos: false,
    piercings: false,
    availability_travel: true,
    availability_schedule: "Full-time",
    emergency_contact_name: "Sophie Voss",
    emergency_contact_phone: "+1 (310) 555-0182",
    emergency_contact_relationship: "Sister",
    is_pro: true,
    partner_agency_id: null,
    onboarding_completed_at: new Date().toISOString(),
  });

  const miaImages = [
    {
      label: "Headshot",
      sort: 1,
      path: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1000&q=80",
    },
    {
      label: "Editorial",
      sort: 2,
      path: "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1000&q=80",
    },
    {
      label: "Runway",
      sort: 3,
      path: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1000&q=80",
    },
    {
      label: "Commercial",
      sort: 4,
      path: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1000&q=80",
    },
    {
      label: "Editorial 2",
      sort: 5,
      path: "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=1000&q=80",
    },
    {
      label: "Lifestyle",
      sort: 6,
      path: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1000&q=80",
    },
  ];
  for (const img of miaImages) {
    await knex("images").insert({
      id: uuidv4(),
      profile_id: profileId,
      ...img,
    });
  }

  // Create Elara Keats placeholder account (for demo)
  const elaraUserId = uuidv4();
  await knex("users").insert({
    id: elaraUserId,
    email: "elara@example.com",
    password_hash: passwordHash,
    role: "TALENT",
  });

  // Create Elara Keats profile (placeholder/demo account)
  const elaraProfileId = uuidv4();
  await knex("profiles").insert({
    id: elaraProfileId,
    user_id: elaraUserId,
    slug: "elara-k",
    first_name: "Elara",
    last_name: "Keats",
    city: "Los Angeles, CA",
    height_cm: 180,
    // measurements column was removed - using individual bust/waist/hips instead
    bio_raw:
      "Elara is a collaborative creative professional with a background in editorial campaigns and on-set leadership. Based in Los Angeles, she balances editorial edge with commercial versatility.",
    bio_curated:
      "Elara Keats brings a polished presence to every production. Based in Los Angeles, she balances editorial edge with commercial versatility. Standing at 5'11\" with measurements of 32-25-35, she brings a commanding presence to both high-fashion editorials and commercial campaigns.",
    is_pro: false,
    pdf_theme: null,
    pdf_customizations: null,
    partner_agency_id: null,
    // New comprehensive fields
    gender: "Female",
    date_of_birth: "1995-06-15",
    weight_kg: 58,
    dress_size: "4",
    hair_length: "Long",
    skin_tone: "Fair",
    languages: JSON.stringify(["English", "Spanish"]),
    availability_travel: true,
    availability_schedule: "Full-time",
    experience_level: "Experienced",
    training: "Formal training in editorial modeling and commercial acting.",
    portfolio_url: "https://elarakeats.portfolio.com",
    instagram_handle: "elarakeats",
    twitter_handle: "elarakeats",
    tiktok_handle: "elarakeats",
    reference_name: null,
    reference_email: null,
    reference_phone: null,
    // reference_relationship was removed in migration 20250106000000
    emergency_contact_name: "Jane Doe",
    emergency_contact_phone: "+1 (555) 123-4567",
    emergency_contact_relationship: "Parent",
    // nationality was removed in migration 20250106000000
    union_membership: null,
    ethnicity: null,
    tattoos: false,
    piercings: false,
    phone: null,
    bust_cm: 32,
    waist_cm: 25,
    hips_cm: 35,
    shoe_size: "9 US",
    eye_color: "Brown",
    hair_color: "Blonde",
    specialties: JSON.stringify(["Editorial", "Commercial"]),
  });

  // Create Elara Keats images (using Unsplash URLs for demo)
  const elaraImages = [
    {
      id: uuidv4(),
      profile_id: elaraProfileId,
      path: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1000&q=80",
      label: "Headshot",
      sort: 1,
    },
    {
      id: uuidv4(),
      profile_id: elaraProfileId,
      path: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1000&q=80",
      label: "Editorial",
      sort: 2,
    },
    {
      id: uuidv4(),
      profile_id: elaraProfileId,
      path: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=80",
      label: "Runway",
      sort: 3,
    },
    {
      id: uuidv4(),
      profile_id: elaraProfileId,
      path: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1000&q=80",
      label: "Portfolio",
      sort: 4,
    },
  ];

  for (const img of elaraImages) {
    await knex("images").insert(img);
  }
};
