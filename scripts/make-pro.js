const knex = require('../src/db/knex');

async function setPro() {
  try {
    const profile = await knex('profiles').first();
    console.log(`Updating profile ${profile.id} to PRO...`);
    
    await knex('profiles')
      .where({ id: profile.id })
      .update({ is_pro: true });
      
    console.log('✅ User is now Studio+');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

setPro();
