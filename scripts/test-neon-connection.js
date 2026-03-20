#!/usr/bin/env node

/**
 * Test Neon Database Connection
 * 
 * This script tests the connection to your Neon database and verifies
 * that the configuration is correct.
 */

require('dotenv').config();
const knex = require('knex');
const config = require('../knexfile');

async function testConnection() {
  console.log('🔍 Testing Neon database connection...');
  console.log('');

  // Check environment variables
  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL is not set in environment variables');
    console.error('   Please set DATABASE_URL in your .env file');
    process.exit(1);
  }

  if (process.env.DB_CLIENT !== 'pg') {
    console.warn('⚠️  Warning: DB_CLIENT is not set to "pg"');
    console.warn(`   Current value: ${process.env.DB_CLIENT || 'not set'}`);
    console.warn('   For Neon, DB_CLIENT should be "pg"');
    console.log('');
  }

  // Check if DATABASE_URL looks like a Neon URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl.includes('neon.tech') && !dbUrl.includes('neon.tech')) {
    console.warn('⚠️  Warning: DATABASE_URL does not appear to be a Neon URL');
    console.warn('   Neon URLs typically contain "neon.tech"');
    console.log('');
  }

  // Check for SSL mode
  if (!dbUrl.includes('sslmode=require')) {
    console.warn('⚠️  Warning: DATABASE_URL does not include sslmode=require');
    console.warn('   Neon requires SSL connections. Add ?sslmode=require to your connection string');
    console.log('');
  }

  console.log('📋 Configuration:');
  console.log(`   DB_CLIENT: ${process.env.DB_CLIENT || 'not set (defaults to sqlite3)'}`);
  console.log(`   DATABASE_URL: ${dbUrl.replace(/:[^:@]+@/, ':****@')}`); // Hide password
  console.log('');

  // Test connection
  let db;
  try {
    console.log('🔄 Attempting to connect to database...');
    db = knex(config);

    // Test query
    const result = await db.raw('SELECT version(), current_database(), current_user');
    const version = result.rows[0].version;
    const database = result.rows[0].current_database;
    const user = result.rows[0].current_user;

    console.log('✅ Connection successful!');
    console.log('');
    console.log('📊 Database Information:');
    console.log(`   PostgreSQL Version: ${version.split(' ')[0]} ${version.split(' ')[1]}`);
    console.log(`   Database: ${database}`);
    console.log(`   User: ${user}`);
    console.log('');

    // Check if tables exist
    console.log('🔍 Checking for existing tables...');
    const tables = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    if (tables.rows.length > 0) {
      console.log(`   Found ${tables.rows.length} table(s):`);
      tables.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
      console.log('');
      console.log('💡 Tip: If tables already exist, migrations may have been run already');
    } else {
      console.log('   No tables found. Run migrations with: npm run migrate');
    }
    console.log('');

    console.log('🎉 Database connection test passed!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Run migrations: npm run migrate');
    console.log('2. (Optional) Seed database: npm run seed');
    console.log('3. Start server: npm start');

  } catch (error) {
    console.error('❌ Connection failed!');
    console.error('');
    console.error('Error details:');
    console.error(`   ${error.message}`);
    console.error('');
    
    if (error.code === 'ENOTFOUND') {
      console.error('💡 This usually means:');
      console.error('   - The hostname in DATABASE_URL is incorrect');
      console.error('   - There is a network connectivity issue');
      console.error('   - The Neon project might be paused (it will auto-resume)');
    } else if (error.code === '28P01') {
      console.error('💡 This usually means:');
      console.error('   - The username or password in DATABASE_URL is incorrect');
      console.error('   - Check your Neon dashboard for the correct credentials');
    } else if (error.code === '3D000') {
      console.error('💡 This usually means:');
      console.error('   - The database name in DATABASE_URL does not exist');
      console.error('   - Check your Neon dashboard for the correct database name');
    } else if (error.message.includes('SSL')) {
      console.error('💡 This usually means:');
      console.error('   - SSL is required but not enabled');
      console.error('   - Add ?sslmode=require to your DATABASE_URL');
    }

    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Verify your DATABASE_URL in the Neon dashboard');
    console.error('2. Check that your Neon project is active (not paused)');
    console.error('3. Ensure sslmode=require is in your connection string');
    console.error('4. Review the NEON_SETUP.md guide for more help');

    process.exit(1);
  } finally {
    if (db) {
      await db.destroy();
    }
  }
}

// Run the test
testConnection().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

