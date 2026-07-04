"use strict";

const MARILYN_DESCRIPTION =
  "Founded in Paris in 1985, Marilyn Agency represents women, men, celebrities, and new faces across editorial, runway, and luxury fashion. The house is known for developing internationally visible talent and maintaining a Paris-led point of view with New York reach.";

const LUMEN_DESCRIPTION =
  "Lumen Model Management is a boutique New York agency focused on editorial, runway, commercial, and development talent. The team scouts selective new faces and builds polished books for luxury campaigns, fashion week packages, and brand lookbooks.";

function boards(knex, value) {
  const serialized = JSON.stringify(value);
  const client = knex.client.config.client;
  const isPostgres = client === "pg" || client === "postgresql";
  return isPostgres ? knex.raw("?::jsonb", [serialized]) : serialized;
}

/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasAgencies = await knex.schema.hasTable("agencies");
  if (!hasAgencies) return;

  await knex("agencies")
    .where({ name: "Marilyn Agency" })
    .update({
      location: "Paris, France",
      website: "https://marilynagency.com",
      description: MARILYN_DESCRIPTION,
      logo_path: "/agency-logos/marilyn-agency.svg",
      brand_color: "#050505",
      open_boards: boards(knex, ["Women", "Men", "Celebrities", "New Faces"]),
      updated_at: knex.fn.now(),
    });

  await knex("agencies")
    .where({ name: "Lumen Model Management" })
    .update({
      location: "New York, NY",
      website: "https://lumenmodels.com",
      description: LUMEN_DESCRIPTION,
      logo_path: "/agency-logos/lumen-model-management.svg",
      brand_color: "#B8956A",
      open_boards: boards(knex, ["Women", "Men", "Runway", "Development"]),
      updated_at: knex.fn.now(),
    });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasAgencies = await knex.schema.hasTable("agencies");
  if (!hasAgencies) return;

  await knex("agencies")
    .where({ name: "Marilyn Agency" })
    .update({
      description: null,
      logo_path: null,
      brand_color: null,
      open_boards: boards(knex, ["Women", "Men", "New Faces"]),
      updated_at: knex.fn.now(),
    });

  await knex("agencies")
    .where({ name: "Lumen Model Management" })
    .update({
      description: null,
      logo_path: null,
      brand_color: null,
      open_boards: null,
      updated_at: knex.fn.now(),
    });
};
