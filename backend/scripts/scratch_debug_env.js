import dotenv from 'dotenv';
dotenv.config();
const key = process.env.FIREBASE_PRIVATE_KEY;
console.log('Raw key length:', key?.length);
console.log('Contains literal \\n:', key?.includes('\\n'));
console.log('Contains real newline:', key?.includes('\n'));
if (key) {
  const fixed = key.replace(/\\n/g, '\n');
  console.log('Fixed key contains real newline:', fixed.includes('\n'));
  console.log('Fixed key starts with:', fixed.substring(0, 30));
  console.log('Fixed key ends with:', fixed.substring(fixed.length - 30));
}
