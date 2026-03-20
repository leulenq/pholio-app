
exports.up = async function(knex) {
  // 1. Add column
  const hasColumn = await knex.schema.hasColumn('profiles', 'onboarding_state_json');
  if (!hasColumn) {
    await knex.schema.table('profiles', function(table) {
      if (knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql') {
        table.jsonb('onboarding_state_json').nullable();
      } else {
        table.text('onboarding_state_json').nullable();
      }
    });


  }

  // 2. Backfill existing rows
  const profiles = await knex('profiles').select('id', 'onboarding_stage');
  const order = ['identity', 'upload', 'confirm', 'goals', 'reveal', 'completing', 'submitted', 'processing', 'processed'];
  
  for (const p of profiles) {
    const stage = p.onboarding_stage || 'identity';
    
    // Infer completed steps
    const completed = [];
    // Handle 'reveal' specially since 'goals' didn't exist before
    // If 'reveal', assume 'identity', 'upload', 'confirm' are done. 'goals' is new so technically NOT done, 
    // but to avoid forcing users back, we might assume it's done or skipped.
    // However, simplest is just strict order index.
    
    // NOTE: 'goals' is inserted between confirm and reveal.
    // Existing users at 'reveal' will have: identity, upload, confirm. 'goals' will NOT be in completed. 
    // This effectively "skips" goals for them, which is fine, or arguably they should see it?
    // Let's rely on standard index logic.
    
    let effectiveOrder = order;
    // Special handling: if existing user is past 'confirm' but 'goals' is new, 
    // we effectively assume they skipped goals or it wasn't required.
    
    const idx = order.indexOf(stage);
    if (idx > -1) {
      for (let i = 0; i < idx; i++) {
         completed.push(order[i]);
      }
    }

    const state = {
      current_step: stage,
      completed_steps: completed,
      step_data: {
          backfilled: true,
          original_stage: stage
      }
    };

    const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
    const jsonValue = isPostgres ? state : JSON.stringify(state);

    await knex('profiles')
      .where({ id: p.id })
      .update({ onboarding_state_json: jsonValue });
  }
};

exports.down = function(knex) {
  return knex.schema.table('profiles', function(table) {
    table.dropColumn('onboarding_state_json');
  });
};
