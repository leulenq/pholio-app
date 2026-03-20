
const knex = require('knex')(require('../knexfile'));

async function inspect() {
  try {
    const columns = await knex('profiles').columnInfo();
    console.log('--- Profiles Table Columns ---');
    console.log(JSON.stringify(columns, null, 2));
    
    // Also check if 'hero_image_path' exists
    if (columns.hero_image_path) {
        console.log('✅ hero_image_path exists');
    } else {
        console.log('❌ hero_image_path MISSING');
    }

    // Check for other fields mentioned in backend mapping
    const fields = [
        'bio_raw', 'bio_curated', 'city', 'height_cm', 'weight_kg', 
        'seeking_representation', 'current_agency', 'gender', 'role',
        'availability_travel', 'tattoos', 'piercings', 'languages'
    ];
    
    console.log('\n--- Field Checks ---');
    fields.forEach(f => {
        if (columns[f]) console.log(`✅ ${f}`);
        else console.log(`❌ ${f} MISSING`);
    });

  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}

inspect();
