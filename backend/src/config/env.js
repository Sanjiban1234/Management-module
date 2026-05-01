import dotenv from "dotenv";

dotenv.config();

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  port: parseNumber(process.env.PORT, 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  allowExpiredCheckin: parseBoolean(process.env.ALLOW_EXPIRED_CHECKIN, false),
  requirePaidMembership: parseBoolean(process.env.REQUIRE_PAID_MEMBERSHIP, false),
  duplicateScanWindowSeconds: parseNumber(
    process.env.DUPLICATE_SCAN_WINDOW_SECONDS,
    15
  ),
  membershipExpiryAlertDays: parseNumber(
    process.env.MEMBERSHIP_EXPIRY_ALERT_DAYS,
    7
  ),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  gymQrToken: process.env.GYM_QR_TOKEN || "GYM_ENTRANCE_001"
};

