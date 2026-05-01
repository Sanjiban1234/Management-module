import fs from 'fs';
import path from 'path';

const jsonPath = 'c:/Users/VICTUS/Downloads/gym-tracker-38810-firebase-adminsdk-fbsvc-c81eb11f66.json';
const envPath = 'c:/Users/VICTUS/Desktop/GYM app/backend/.env';

const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
let envContent = fs.readFileSync(envPath, 'utf8');

// Replace the FIREBASE_PRIVATE_KEY line
const lines = envContent.split('\n');
const newLines = lines.map(line => {
  if (line.startsWith('FIREBASE_PRIVATE_KEY=')) {
    // We want the literal \n characters in the .env file so that env.js replace works
    const escapedKey = json.private_key.replace(/\n/g, '\\n');
    return `FIREBASE_PRIVATE_KEY=${escapedKey}`;
  }
  return line;
});

fs.writeFileSync(envPath, newLines.join('\n'));
console.log('Updated .env with key from JSON');
