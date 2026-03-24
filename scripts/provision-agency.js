const knex = require("../src/shared/db/knex");
const {
  provisionAgencyForUser,
} = require("../src/domains/agency/services/provisioning");

async function main() {
  const [, , userId, agencyName, website = "", location = ""] = process.argv;

  if (!userId || !agencyName) {
    console.error(
      "Usage: node scripts/provision-agency.js <userId> <agencyName> [website] [location]",
    );
    process.exit(1);
  }

  const agency = await provisionAgencyForUser({
    userId,
    agencyName,
    website: website || null,
    location: location || null,
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        agencyId: agency.id,
        name: agency.name,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[Provision Agency] Error:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await knex.destroy();
  });
