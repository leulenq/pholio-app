#!/usr/bin/env node

/**
 * Helper script to add Firebase configuration to .env file
 * Usage: node scripts/setup-firebase-env.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('🔥 Firebase Environment Configuration Setup');
  console.log('============================================\n');

  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  let envExists = false;

  // Read existing .env if it exists
  if (fs.existsSync(envPath)) {
    envExists = true;
    envContent = fs.readFileSync(envPath, 'utf8');
    console.log('✅ Found existing .env file');
  } else {
    console.log('📝 Creating new .env file');
  }

  // Extract Firebase config from service account JSON (if provided)
  console.log('\n📋 Firebase Configuration');
  console.log('You can either:');
  console.log('1. Provide the service account JSON (paste the entire JSON)');
  console.log('2. Enter values manually\n');

  const useJson = await question('Do you want to paste the service account JSON? (y/N): ');
  
  let firebaseConfig = {};

  if (useJson.toLowerCase() === 'y') {
    console.log('\n📋 Paste the service account JSON (press Enter after pasting, then Ctrl+D or Ctrl+Z to finish):');
    let jsonInput = '';
    
    for await (const line of rl) {
      jsonInput += line + '\n';
    }
    
    try {
      const serviceAccount = JSON.parse(jsonInput);
      firebaseConfig = {
        projectId: serviceAccount.project_id,
        privateKey: serviceAccount.private_key,
        clientEmail: serviceAccount.client_email,
        clientId: serviceAccount.client_id,
        authDomain: `${serviceAccount.project_id}.firebaseapp.com`
      };
      console.log('\n✅ Successfully parsed service account JSON');
    } catch (error) {
      console.error('\n❌ Error parsing JSON:', error.message);
      console.log('Falling back to manual entry...\n');
    }
  }

  // Get remaining values
  if (!firebaseConfig.projectId) {
    firebaseConfig.projectId = await question('Firebase Project ID: ') || '';
  }

  if (!firebaseConfig.privateKey) {
    console.log('\n📋 Firebase Private Key:');
    console.log('Paste the full private key (including -----BEGIN/END PRIVATE KEY-----):');
    let privateKeyLines = [];
    let emptyLines = 0;
    
    for await (const line of rl) {
      if (line.trim() === '') {
        emptyLines++;
        if (emptyLines >= 2) break;
      } else {
        emptyLines = 0;
        privateKeyLines.push(line);
      }
      if (line.includes('-----END PRIVATE KEY-----')) break;
    }
    firebaseConfig.privateKey = privateKeyLines.join('\n');
  }

  if (!firebaseConfig.clientEmail) {
    firebaseConfig.clientEmail = await question('Firebase Client Email: ') || '';
  }

  if (!firebaseConfig.clientId) {
    firebaseConfig.clientId = await question('Firebase Client ID: ') || '';
  }

  if (!firebaseConfig.authDomain) {
    const authDomain = await question(`Firebase Auth Domain [${firebaseConfig.projectId}.firebaseapp.com]: `);
    firebaseConfig.authDomain = authDomain || `${firebaseConfig.projectId}.firebaseapp.com`;
  }

  // Get API Key (must be from Firebase Console)
  console.log('\n🔑 Firebase Web API Key:');
  console.log('This is different from the service account key.');
  console.log('Get it from: Firebase Console > Project Settings > General > Your apps > Web API Key\n');
  firebaseConfig.apiKey = await question('Firebase Web API Key: ') || '';

  // Format private key for .env (escape newlines)
  const privateKeyEscaped = firebaseConfig.privateKey ? 
    firebaseConfig.privateKey.replace(/\n/g, '\\n').replace(/"/g, '\\"') : '';

  // Build Firebase config section
  const firebaseSection = `
# Firebase Configuration
FIREBASE_PROJECT_ID=${firebaseConfig.projectId}
FIREBASE_PRIVATE_KEY="${privateKeyEscaped}"
FIREBASE_CLIENT_EMAIL=${firebaseConfig.clientEmail}
FIREBASE_CLIENT_ID=${firebaseConfig.clientId}
FIREBASE_AUTH_DOMAIN=${firebaseConfig.authDomain}
FIREBASE_API_KEY=${firebaseConfig.apiKey}
`;

  // Check if Firebase config already exists in .env
  if (envContent.includes('FIREBASE_PROJECT_ID')) {
    console.log('\n⚠️  Firebase configuration already exists in .env');
    const replace = await question('Do you want to replace it? (y/N): ');
    
    if (replace.toLowerCase() === 'y') {
      // Remove old Firebase config
      envContent = envContent.replace(/\n?# Firebase Configuration[\s\S]*?FIREBASE_API_KEY=.*\n?/g, '');
      envContent += firebaseSection;
    } else {
      console.log('Keeping existing Firebase configuration.');
      rl.close();
      return;
    }
  } else {
    // Append Firebase config
    envContent += firebaseSection;
  }

  // Write .env file
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('\n✅ Firebase configuration added to .env file!');
  console.log(`📁 Location: ${envPath}`);
  
  if (!firebaseConfig.apiKey) {
    console.log('\n⚠️  WARNING: FIREBASE_API_KEY is missing!');
    console.log('You must add it manually to .env for client-side authentication to work.');
    console.log('Get it from: Firebase Console > Project Settings > General > Your apps');
  }

  rl.close();
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

