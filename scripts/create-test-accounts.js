/**
 * Create Test Accounts Script
 * Creates 2 test accounts: Free and Studio+
 */

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const knexConfig = require('../knexfile');
const knex = require('knex')(knexConfig);

async function createTestAccounts() {
  try {
    console.log('🔧 Creating test accounts...\n');

    // Hash the password
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // ============================================
    // 1. FREE ACCOUNT
    // ============================================
    console.log('📝 Creating FREE account...');

    const freeUserId = uuidv4();
    const freeProfileId = uuidv4();

    // Check if free account exists
    const existingFree = await knex('users').where('email', 'test-free@pholio.com').first();

    if (existingFree) {
      console.log('⚠️  Free account already exists. Skipping...');
    } else {
      // Create user
      await knex('users').insert({
        id: freeUserId,
        email: 'test-free@pholio.com',
        password_hash: passwordHash,
        role: 'TALENT',
        firebase_uid: null,
        created_at: new Date()
      });

      // Create profile
      await knex('profiles').insert({
        id: freeProfileId,
        user_id: freeUserId,
        slug: 'test-free',
        first_name: 'Free',
        last_name: 'User',
        city: 'New York',
        height_cm: 175,
        bio_raw: 'Test free account for development',
        bio_curated: 'Test free account for development',
        hero_image_path: null,
        is_pro: false,
        created_at: new Date(),
        updated_at: new Date()
      });

      console.log('✅ Free account created!');
      console.log('   Email: test-free@pholio.com');
      console.log('   Password: Password123!');
      console.log('   Slug: /talent/test-free\n');
    }

    // ============================================
    // 2. STUDIO+ ACCOUNT
    // ============================================
    console.log('📝 Creating STUDIO+ account...');

    const studioUserId = uuidv4();
    const studioProfileId = uuidv4();

    // Check if studio account exists
    const existingStudio = await knex('users').where('email', 'test-studio@pholio.com').first();

    if (existingStudio) {
      console.log('⚠️  Studio+ account already exists. Skipping...');
    } else {
      // Create user
      await knex('users').insert({
        id: studioUserId,
        email: 'test-studio@pholio.com',
        password_hash: passwordHash,
        role: 'TALENT',
        firebase_uid: null,
        created_at: new Date()
      });

      // Create profile
      await knex('profiles').insert({
        id: studioProfileId,
        user_id: studioUserId,
        slug: 'test-studio',
        first_name: 'Studio',
        last_name: 'Plus',
        city: 'Los Angeles',
        height_cm: 180,
        bio_raw: 'Test Studio+ account for development',
        bio_curated: 'Test Studio+ account for development',
        hero_image_path: null,
        is_pro: true,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Create active subscription
      await knex('subscriptions').insert({
        id: uuidv4(),
        user_id: studioUserId,
        stripe_customer_id: `cus_test_${studioUserId.substring(0, 8)}`,
        stripe_subscription_id: `sub_test_${studioUserId.substring(0, 8)}`,
        stripe_price_id: 'price_test_studio_plus',
        status: 'active',
        trial_start: null,
        trial_end: null,
        current_period_start: new Date(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        cancel_at_period_end: false,
        canceled_at: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      console.log('✅ Studio+ account created!');
      console.log('   Email: test-studio@pholio.com');
      console.log('   Password: Password123!');
      console.log('   Slug: /talent/test-studio');
      console.log('   Subscription: Active Studio+\n');
    }

    console.log('✨ Test accounts setup complete!\n');
    console.log('==========================================');
    console.log('LOGIN CREDENTIALS:');
    console.log('==========================================');
    console.log('FREE ACCOUNT:');
    console.log('  Email: test-free@pholio.com');
    console.log('  Password: Password123!');
    console.log('  Profile: http://localhost:3000/talent/test-free');
    console.log('  Dashboard: http://localhost:5173/dashboard/talent');
    console.log('');
    console.log('STUDIO+ ACCOUNT:');
    console.log('  Email: test-studio@pholio.com');
    console.log('  Password: Password123!');
    console.log('  Profile: http://localhost:3000/talent/test-studio');
    console.log('  Dashboard: http://localhost:5173/dashboard/talent');
    console.log('==========================================\n');

  } catch (error) {
    console.error('❌ Error creating test accounts:', error);
    throw error;
  } finally {
    await knex.destroy();
  }
}

// Run the script
createTestAccounts()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
