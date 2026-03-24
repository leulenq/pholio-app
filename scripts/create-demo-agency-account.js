const knex = require("../src/shared/db/knex");
const { createUser: createDbUser } = require("../src/shared/lib/user-helpers");
const {
  provisionAgencyForUser,
} = require("../src/domains/agency/services/provisioning");
const {
  createUser: createFirebaseUser,
  getUserByEmail,
} = require("../src/lib/firebase-admin");

async function main() {
  const email = (process.argv[2] || "demo.agency@pholio.test")
    .toLowerCase()
    .trim();
  const password = process.argv[3] || "DemoAgency123!";
  const agencyName = process.argv[4] || "Northline Demo Agency";
  const firstName = process.argv[5] || "Demo";
  const lastName = process.argv[6] || "Owner";

  let firebaseUser = await getUserByEmail(email);
  if (!firebaseUser) {
    firebaseUser = await createFirebaseUser(email, password, {
      displayName: `${firstName} ${lastName}`.trim(),
    });
  }

  let user = await knex("users").where({ email }).first();
  if (!user) {
    user = await createDbUser({
      firebaseUid: firebaseUser.uid,
      email,
      role: "AGENCY",
      agencyName,
      first_name: firstName,
      last_name: lastName,
    });
  } else {
    await knex("users")
      .where({ id: user.id })
      .update({
        firebase_uid: firebaseUser.uid,
        role: "AGENCY",
        first_name: user.first_name || firstName,
        last_name: user.last_name || lastName,
      });
    user = await knex("users").where({ id: user.id }).first();
  }

  const agency = await provisionAgencyForUser({
    userId: user.id,
    agencyName,
    db: knex,
  });

  await knex("agencies").where({ id: agency.id }).update({
    onboarding_started_at: knex.fn.now(),
    onboarding_completed_at: knex.fn.now(),
    onboarding_completed_by_user_id: user.id,
    updated_at: knex.fn.now(),
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        email,
        password,
        userId: user.id,
        agencyId: agency.id,
        agencyName: agency.name,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[Create Demo Agency Account] Error:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await knex.destroy();
  });
