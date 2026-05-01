import { z } from "zod";

import { auth, db } from "../config/firebaseAdmin.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/index.js";
import { normalizeDateOnly, getNowUtc, toUtcIso } from "../utils/index.js";
import { generateSecureToken, generateTemporaryPassword } from "../utils/index.js";

const memberInputSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  membership_plan: z.string().min(2),
  membership_start_date: z.string().optional(),
  membership_end_date: z.string().optional(),
  payment_status: z.enum(["paid", "pending", "overdue"]).default("pending"),
  password: z.string().min(6).or(z.literal("")).optional()
});

const memberUpdateSchema = memberInputSchema.partial();

function mapMemberDocument(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}

function isMemberArchived(member = {}) {
  return member.archived === true;
}

export async function listMembers() {
  const snapshot = await db
    .collection("members")
    .orderBy("membership_end_date", "asc")
    .get();

  return snapshot.docs.map(mapMemberDocument).filter((member) => !isMemberArchived(member));
}

export async function getMemberById(memberId) {
  const snapshot = await db.collection("members").doc(memberId).get();

  if (!snapshot.exists) {
    throw new HttpError(404, "Member not found.");
  }

  const member = mapMemberDocument(snapshot);
  if (isMemberArchived(member)) {
    throw new HttpError(404, "Member not found.");
  }

  return member;
}

export async function createMember(payload) {
  const data = memberInputSchema.parse(payload);
  const nowIso = toUtcIso(getNowUtc());

  const start = data.membership_start_date || normalizeDateOnly(new Date().toISOString());
  const end = data.membership_end_date || normalizeDateOnly(new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString());

  try {
    const userRecord = await auth.createUser({
      email: data.email,
      password: data.password || generateTemporaryPassword(),
      displayName: data.name
    });

    const memberRecord = {
      id: userRecord.uid,
      name: data.name,
      email: data.email,
      membership_plan: data.membership_plan,
      membership_start_date: start,
      membership_end_date: end,
      payment_status: data.payment_status,
      qr_token: generateSecureToken(),
      device_tokens: [],
      archived: false,
      archived_at: null,
      created_at: nowIso,
      updated_at: nowIso
    };

    await db.collection("members").doc(userRecord.uid).set(memberRecord);

    return memberRecord;
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpError(409, "A Firebase user with this email already exists.");
    }

    if (error instanceof z.ZodError) {
      throw new HttpError(400, "Invalid member payload.", error.flatten());
    }

    throw error;
  }
}

export async function updateMember(memberId, payload) {
  let data;

  try {
    data = memberUpdateSchema.parse(payload);
  } catch (error) {
    throw new HttpError(400, "Invalid member payload.", error.flatten?.());
  }

  const memberRef = db.collection("members").doc(memberId);
  const memberDoc = await memberRef.get();

  if (!memberDoc.exists) {
    throw new HttpError(404, "Member not found.");
  }
  if (isMemberArchived(memberDoc.data())) {
    throw new HttpError(404, "Member not found.");
  }

  const updates = {
    updated_at: toUtcIso(getNowUtc())
  };

  if (data.name !== undefined) {
    updates.name = data.name;
  }

  if (data.email !== undefined) {
    updates.email = data.email;
  }

  if (data.membership_plan !== undefined) {
    updates.membership_plan = data.membership_plan;
  }

  if (data.membership_start_date !== undefined) {
    updates.membership_start_date = normalizeDateOnly(data.membership_start_date);
  }

  if (data.membership_end_date !== undefined) {
    updates.membership_end_date = normalizeDateOnly(data.membership_end_date);
  }

  if (data.payment_status !== undefined) {
    updates.payment_status = data.payment_status;
  }

  await memberRef.update(updates);

  const authUpdates = {};
  if (data.email !== undefined) {
    authUpdates.email = data.email;
  }
  if (data.name !== undefined) {
    authUpdates.displayName = data.name;
  }
  if (data.password !== undefined) {
    authUpdates.password = data.password;
  }

  if (Object.keys(authUpdates).length) {
    await auth.updateUser(memberId, authUpdates);
  }

  return {
    id: memberId,
    ...memberDoc.data(),
    ...updates
  };
}

export async function deleteMember(memberId) {
  const memberRef = db.collection("members").doc(memberId);
  const memberDoc = await memberRef.get();

  if (!memberDoc.exists) {
    throw new HttpError(404, "Member not found.");
  }
  if (isMemberArchived(memberDoc.data())) {
    return { success: true, archived: true };
  }

  const archivedAt = toUtcIso(getNowUtc());
  await Promise.all([
    memberRef.update({
      archived: true,
      archived_at: archivedAt,
      updated_at: archivedAt
    }),
    auth.updateUser(memberId, { disabled: true })
  ]);

  return { success: true, archived: true };
}

export async function saveDeviceToken({ uid, role, token }) {
  const collectionName = role === "admin" ? "admins" : "members";
  const docRef = db.collection(collectionName).doc(uid);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new HttpError(404, "User profile not found.");
  }
  if (role === "member" && isMemberArchived(snapshot.data())) {
    throw new HttpError(403, "This member account has been archived.");
  }

  const existing = snapshot.data().device_tokens || [];
  const uniqueTokens = Array.from(new Set([...existing, token]));

  await docRef.update({
    device_tokens: uniqueTokens,
    updated_at: toUtcIso(getNowUtc())
  });

  return { success: true };
}

export async function getExpiringMembers() {
  const now = getNowUtc();
  const today = now.toISOString().slice(0, 10);
  const limitDate = new Date(now);
  limitDate.setUTCDate(limitDate.getUTCDate() + env.membershipExpiryAlertDays);

  const snapshot = await db
    .collection("members")
    .where("membership_end_date", ">=", today)
    .where("membership_end_date", "<=", limitDate.toISOString().slice(0, 10))
    .orderBy("membership_end_date", "asc")
    .get();

  return snapshot.docs.map(mapMemberDocument).filter((member) => !isMemberArchived(member));
}

export async function extendMemberMembership(memberId, days) {
  const memberRef = db.collection("members").doc(memberId);
  const memberDoc = await memberRef.get();

  if (!memberDoc.exists) {
    throw new HttpError(404, "Member not found.");
  }
  if (isMemberArchived(memberDoc.data())) {
    throw new HttpError(404, "Member not found.");
  }
  if (isMemberArchived(memberDoc.data())) {
    throw new HttpError(404, "Member not found.");
  }

  const currentEndDate = new Date(memberDoc.data().membership_end_date);
  const now = new Date();
  
  // Use current end date if it's in the future, otherwise use today
  const baseDate = currentEndDate > now ? currentEndDate : now;
  const newEndDate = new Date(baseDate);
  newEndDate.setUTCDate(newEndDate.getUTCDate() + days);

  const updates = {
    membership_end_date: newEndDate.toISOString().slice(0, 10),
    payment_status: "paid",
    updated_at: toUtcIso(getNowUtc())
  };

  await memberRef.update(updates);

  return {
    id: memberId,
    ...memberDoc.data(),
    ...updates
  };
}

export async function logFitnessStats(memberId, { weight, height, bmi, date }) {
  const finalDate = date || toUtcIso(getNowUtc());
  const log = {
    weight,
    height,
    bmi,
    created_at: finalDate
  };

  const logRef = await db.collection("members").doc(memberId).collection("fitness_logs").add(log);
  return { id: logRef.id, ...log };
}

export async function getFitnessLogs(memberId) {
  const snapshot = await db
    .collection("members")
    .doc(memberId)
    .collection("fitness_logs")
    .orderBy("created_at", "desc")
    .limit(30)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
