import { db } from "../config/firebaseAdmin.js";
import { getNowUtc, toUtcIso } from "../utils/index.js";

export async function logActivity({
  action,
  actorUid,
  actorEmail,
  actorRole,
  targetUid = null,
  targetName = null,
  details = {}
}) {
  const payload = {
    action,
    actor_uid: actorUid || null,
    actor_email: actorEmail || null,
    actor_role: actorRole || null,
    target_uid: targetUid,
    target_name: targetName,
    details,
    created_at: toUtcIso(getNowUtc())
  };

  await db.collection("activity_logs").add(payload);
}

export async function logActivitySafe(payload) {
  try {
    await logActivity(payload);
  } catch (error) {
    // Logging should never block core app flows.
    console.error("Failed to write activity log", error);
  }
}

export async function listActivityLogs(limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const snapshot = await db
    .collection("activity_logs")
    .orderBy("created_at", "desc")
    .limit(safeLimit)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
}
