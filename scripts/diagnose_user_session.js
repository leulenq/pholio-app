#!/usr/bin/env node
/**
 * Session & Data Diagnostic Script
 *
 * Investigates session leak and data integrity issues
 */

const knex = require('../src/db/knex');

const EMAIL_1 = 'leul.enquanhone@uky.edu';
const EMAIL_2 = 'leulenq@gmail.com';

async function diagnose() {
  console.log('\n🔍 SESSION LEAK DIAGNOSTIC REPORT\n');
  console.log('='.repeat(60));

  try {
    // 1. Check both users
    console.log('\n1️⃣ USER ACCOUNTS:\n');

    const user1 = await knex('users').where({ email: EMAIL_1 }).first();
    const user2 = await knex('users').where({ email: EMAIL_2 }).first();

    console.log(`User 1 (${EMAIL_1}):`);
    if (user1) {
      console.log(`  ✓ EXISTS`);
      console.log(`  ID: ${user1.id}`);
      console.log(`  Firebase UID: ${user1.firebase_uid}`);
      console.log(`  Role: ${user1.role}`);
      console.log(`  Created: ${user1.created_at}`);
    } else {
      console.log(`  ✗ NOT FOUND`);
    }

    console.log(`\nUser 2 (${EMAIL_2}):`);
    if (user2) {
      console.log(`  ✓ EXISTS`);
      console.log(`  ID: ${user2.id}`);
      console.log(`  Firebase UID: ${user2.firebase_uid}`);
      console.log(`  Role: ${user2.role}`);
      console.log(`  Created: ${user2.created_at}`);
    } else {
      console.log(`  ✗ NOT FOUND`);
    }

    // 2. Check profiles
    console.log('\n\n2️⃣ PROFILE DATA:\n');

    if (user1) {
      const profile1 = await knex('profiles').where({ user_id: user1.id }).first();
      console.log(`Profile for ${EMAIL_1}:`);
      if (profile1) {
        console.log(`  ✓ EXISTS (ID: ${profile1.id})`);
        console.log(`  Name: ${profile1.first_name} ${profile1.last_name}`);
        console.log(`  City: ${profile1.city}`);
        console.log(`  Gender: ${profile1.gender || 'NOT SET'}`);
        console.log(`  Height: ${profile1.height_cm}cm`);
        console.log(`  Bust: ${profile1.bust_cm}cm`);
        console.log(`  Waist: ${profile1.waist_cm}cm`);
        console.log(`  Hips: ${profile1.hips_cm}cm`);
        console.log(`  Experience: ${profile1.experience_level || 'NOT SET'}`);
        console.log(`  Onboarding Completed: ${profile1.onboarding_completed_at || 'NOT COMPLETED'}`);
        console.log(`  Slug: ${profile1.slug}`);
      } else {
        console.log(`  ✗ NO PROFILE`);
      }
    }

    if (user2) {
      const profile2 = await knex('profiles').where({ user_id: user2.id }).first();
      console.log(`\nProfile for ${EMAIL_2}:`);
      if (profile2) {
        console.log(`  ✓ EXISTS (ID: ${profile2.id})`);
        console.log(`  Name: ${profile2.first_name} ${profile2.last_name}`);
        console.log(`  City: ${profile2.city}`);
        console.log(`  Gender: ${profile2.gender || 'NOT SET'}`);
        console.log(`  Height: ${profile2.height_cm}cm`);
        console.log(`  Bust: ${profile2.bust_cm}cm`);
        console.log(`  Waist: ${profile2.waist_cm}cm`);
        console.log(`  Hips: ${profile2.hips_cm}cm`);
        console.log(`  Experience: ${profile2.experience_level || 'NOT SET'}`);
        console.log(`  Onboarding Completed: ${profile2.onboarding_completed_at || 'NOT COMPLETED'}`);
        console.log(`  Slug: ${profile2.slug}`);
      } else {
        console.log(`  ✗ NO PROFILE`);
      }
    }

    // 3. Check sessions
    console.log('\n\n3️⃣ ACTIVE SESSIONS:\n');

    const sessions = await knex('sessions')
      .select('*')
      .orderBy('expired', 'desc')
      .limit(20);

    console.log(`Found ${sessions.length} recent sessions:\n`);

    for (const session of sessions) {
      let sessData = {};
      try {
        sessData = typeof session.sess === 'string'
          ? JSON.parse(session.sess)
          : session.sess;
      } catch (e) {
        console.log(`  ⚠️ Session ${session.sid}: Failed to parse`);
        continue;
      }

      if (sessData.userId) {
        const user = await knex('users').where({ id: sessData.userId }).first();
        console.log(`  Session: ${session.sid.substring(0, 20)}...`);
        console.log(`    User ID: ${sessData.userId}`);
        console.log(`    Email: ${user ? user.email : 'UNKNOWN'}`);
        console.log(`    Role: ${sessData.role || 'NOT SET'}`);
        console.log(`    Expires: ${session.expired}`);
        console.log('');
      }
    }

    // 4. Check for duplicate Firebase UIDs
    console.log('\n4️⃣ DUPLICATE CHECK:\n');

    const duplicateUIDs = await knex('users')
      .select('firebase_uid')
      .count('* as count')
      .groupBy('firebase_uid')
      .having('count', '>', 1);

    if (duplicateUIDs.length > 0) {
      console.log(`  ⚠️ FOUND ${duplicateUIDs.length} DUPLICATE FIREBASE UIDs!`);
      for (const dup of duplicateUIDs) {
        console.log(`    Firebase UID: ${dup.firebase_uid} (${dup.count} users)`);
        const users = await knex('users').where({ firebase_uid: dup.firebase_uid });
        users.forEach(u => console.log(`      - ${u.email} (ID: ${u.id})`));
      }
    } else {
      console.log(`  ✓ No duplicate Firebase UIDs`);
    }

    // 5. Check onboarding state
    console.log('\n\n5️⃣ ONBOARDING STATE:\n');

    if (user1) {
      const profile1 = await knex('profiles').where({ user_id: user1.id }).first();
      if (profile1 && profile1.onboarding_state_json) {
        console.log(`Onboarding state for ${EMAIL_1}:`);
        try {
          const state = typeof profile1.onboarding_state_json === 'string'
            ? JSON.parse(profile1.onboarding_state_json)
            : profile1.onboarding_state_json;
          console.log(JSON.stringify(state, null, 2));
        } catch (e) {
          console.log(`  ⚠️ Failed to parse state JSON`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Diagnostic Complete\n');

  } catch (error) {
    console.error('\n❌ Diagnostic Error:', error);
  } finally {
    await knex.destroy();
  }
}

diagnose();
