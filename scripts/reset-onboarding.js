/**
 * Reset Onboarding Script
 * Resets a user's onboarding state for testing the casting call flow
 * 
 * Usage:
 *   node scripts/reset-onboarding.js <email>
 * 
 * Example:
 *   node scripts/reset-onboarding.js user@example.com
 */

require('dotenv').config();
const knex = require('../src/db/knex');

async function resetOnboarding(email) {
  try {
    console.log(`\n🔄 Resetting onboarding for: ${email}\n`);

    // Find user
    const user = await knex('users').where({ email }).first();
    
    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.id}`);

    // Find profile
    const profile = await knex('profiles').where({ user_id: user.id }).first();
    
    if (!profile) {
      console.error(`❌ Profile not found for user: ${email}`);
      process.exit(1);
    }

    console.log(`✅ Found profile: ${profile.id}`);

    // Reset onboarding state
    const initialState = {
      version: 'v2_casting_call',
      current_step: 'entry',
      completed_steps: [],
      step_data: {},
      can_enter_reveal: false,
      started_at: new Date().toISOString()
    };

    await knex('profiles')
      .where({ id: profile.id })
      .update({
        onboarding_completed_at: null,
        onboarding_stage: 'entry',
        onboarding_state_json: initialState,
        updated_at: knex.fn.now()
      });

    console.log(`✅ Reset onboarding state to 'entry'`);

    // Delete existing casting signals (optional - for clean test)
    const deletedSignals = await knex('onboarding_signals')
      .where({ profile_id: profile.id })
      .delete();

    if (deletedSignals > 0) {
      console.log(`✅ Deleted ${deletedSignals} existing signal record(s)`);
    }

    console.log(`\n✨ Onboarding reset complete!`);
    console.log(`\nYou can now test the casting flow:`);
    console.log(`1. Visit http://localhost:3000/apply`);
    console.log(`2. Sign in with: ${email}`);
    console.log(`3. Complete: Entry → Scout → Vibe → Reveal → Complete\n`);

  } catch (error) {
    console.error('❌ Error resetting onboarding:', error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

// Get email from command line
const email = process.argv[2];

if (!email) {
  console.error('\n❌ Usage: node scripts/reset-onboarding.js <email>\n');
  console.error('Example: node scripts/reset-onboarding.js user@example.com\n');
  process.exit(1);
}

resetOnboarding(email);
