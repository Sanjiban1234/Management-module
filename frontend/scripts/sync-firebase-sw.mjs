import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(currentFilePath);
const projectRoot = path.resolve(scriptDirectory, "..");
const templatePath = path.join(projectRoot, "firebase-messaging-sw.template.js");
const outputPath = path.join(projectRoot, "public", "firebase-messaging-sw.js");
const envPath = path.join(projectRoot, ".env");

function parseEnvFile(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith("#"))
    .reduce((accumulator, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^"|"$/g, "");
      accumulator[key] = value;
      return accumulator;
    }, {});
}

const envValues = fs.existsSync(envPath)
  ? parseEnvFile(fs.readFileSync(envPath, "utf8"))
  : {};

const resolved = {
  VITE_FIREBASE_API_KEY:
    process.env.VITE_FIREBASE_API_KEY || envValues.VITE_FIREBASE_API_KEY || "",
  VITE_FIREBASE_AUTH_DOMAIN:
    process.env.VITE_FIREBASE_AUTH_DOMAIN || envValues.VITE_FIREBASE_AUTH_DOMAIN || "",
  VITE_FIREBASE_PROJECT_ID:
    process.env.VITE_FIREBASE_PROJECT_ID || envValues.VITE_FIREBASE_PROJECT_ID || "",
  VITE_FIREBASE_STORAGE_BUCKET:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || envValues.VITE_FIREBASE_STORAGE_BUCKET || "",
  VITE_FIREBASE_MESSAGING_SENDER_ID:
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    envValues.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    "",
  VITE_FIREBASE_APP_ID:
    process.env.VITE_FIREBASE_APP_ID || envValues.VITE_FIREBASE_APP_ID || ""
};

let output = fs.readFileSync(templatePath, "utf8");

for (const [key, value] of Object.entries(resolved)) {
  output = output.replaceAll(`__${key}__`, value);
}

fs.writeFileSync(outputPath, output);
console.log(`Synced Firebase messaging service worker to ${outputPath}`);
