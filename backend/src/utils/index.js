import crypto from "crypto";

// --- httpError.js ---
export class HttpError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

// --- random.js ---
export function generateSecureToken(size = 24) {
  return crypto.randomBytes(size).toString("hex");
}

export function generateTemporaryPassword() {
  return `Gym!${crypto.randomBytes(6).toString("hex")}`;
}

// --- date.js ---
export function getNowUtc() {
  return new Date();
}

export function toUtcIso(date) {
  return date.toISOString();
}

export function toUtcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function normalizeDateOnly(value) {
  if (!value) {
    return null;
  }

  return value.slice(0, 10);
}

export function isMembershipExpired(endDate, now = getNowUtc()) {
  if (!endDate) {
    return false;
  }

  const normalizedEnd = `${normalizeDateOnly(endDate)}T23:59:59.999Z`;
  return new Date(normalizedEnd) < now;
}

export function daysUntil(dateString, now = getNowUtc()) {
  const target = new Date(`${normalizeDateOnly(dateString)}T23:59:59.999Z`);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getUtcHour(isoString) {
  return new Date(isoString).getUTCHours();
}
