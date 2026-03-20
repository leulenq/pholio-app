/**
 * Migration: Fix Measurements Type & Convert JSON Fields to JSONB
 * 
 * 1. Change measurements (bust, waist, hips) from INTEGER to DECIMAL(4,1) to support half-step values
 * 2. Convert JSON fields from TEXT to JSONB for proper JSON storage and querying
 * 
 * IMPORTANT: This migration validates and cleans invalid JSON before converting column types
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // Check if we're using PostgreSQL (JSONB is PostgreSQL-specific)
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  // Step 1: Fix measurements (this should work fine as INTEGER -> DECIMAL is safe)
  await knex.schema.table('profiles', (table) => {
    // Fix 1: Change measurements to DECIMAL to support 0.5 increments
    table.decimal('bust', 4, 1).nullable().alter();
    table.decimal('waist', 4, 1).nullable().alter();
    table.decimal('hips', 4, 1).nullable().alter();
  });
  
  // Step 2: Clean and convert JSON fields (PostgreSQL only)
  if (isPostgres) {
    const jsonFields = ['specialties', 'languages', 'comfort_levels', 'experience_details', 'previous_representations'];
    
    for (const field of jsonFields) {
      console.log(`[Migration] Processing ${field}...`);
      
      // Step 2a: Find all rows with this field populated
      const rows = await knex('profiles')
        .select('id', field)
        .whereNotNull(field)
        .where(field, '!=', '');
      
      console.log(`[Migration] Found ${rows.length} rows with ${field} to validate`);
      
      // Step 2b: Validate JSON and clean invalid entries (while column is still TEXT)
      let validCount = 0;
      let invalidCount = 0;
      
      for (const row of rows) {
        const value = row[field];
        
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          // Empty value - set to NULL
          await knex('profiles')
            .where({ id: row.id })
            .update({ [field]: null });
          continue;
        }
        
        // Convert to string if needed (might already be string from DB)
        const stringValue = typeof value === 'string' ? value : String(value);
        
        try {
          // Validate JSON by parsing it
          JSON.parse(stringValue);
          // Valid JSON - leave it as is for now, will convert in next step
          validCount++;
        } catch (parseErr) {
          // Invalid JSON - log warning and set to NULL
          console.warn(`[Migration] Invalid JSON in ${field} for profile ${row.id}, setting to NULL. Value preview: ${stringValue.substring(0, 100)}...`);
          await knex('profiles')
            .where({ id: row.id })
            .update({ [field]: null });
          invalidCount++;
        }
      }
      
      console.log(`[Migration] ${field}: ${validCount} valid entries, ${invalidCount} set to NULL (invalid JSON)`);
      
      // Step 2c: Now alter the column type to JSONB
      // All remaining values should be valid JSON or NULL at this point
      await knex.schema.raw(`
        ALTER TABLE profiles
        ALTER COLUMN ${field} TYPE jsonb 
        USING CASE
          WHEN ${field} IS NULL THEN NULL
          WHEN ${field} = '' THEN NULL
          ELSE ${field}::text::jsonb
        END
      `);
      
      console.log(`[Migration] Successfully converted ${field} to JSONB`);
    }
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  await knex.schema.table('profiles', (table) => {
    // Revert measurements back to INTEGER
    table.integer('bust').nullable().alter();
    table.integer('waist').nullable().alter();
    table.integer('hips').nullable().alter();
    
    if (isPostgres) {
      // Revert JSONB fields back to TEXT
      // Note: JSONB -> TEXT conversion preserves the JSON string representation
      table.text('specialties').nullable().alter();
      table.text('languages').nullable().alter();
      table.text('comfort_levels').nullable().alter();
      table.text('experience_details').nullable().alter();
      table.text('previous_representations').nullable().alter();
    }
  });
  
  // Convert JSONB back to TEXT strings for PostgreSQL
  if (isPostgres) {
    const jsonFields = ['specialties', 'languages', 'comfort_levels', 'experience_details', 'previous_representations'];
    
    for (const field of jsonFields) {
      await knex.raw(`
        UPDATE profiles
        SET ${field} = CASE
          WHEN ${field} IS NULL THEN NULL
          ELSE ${field}::text
        END
        WHERE ${field} IS NOT NULL
      `);
    }
  }
};
