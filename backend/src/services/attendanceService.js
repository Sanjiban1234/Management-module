import { z } from "zod";

import { db } from "../config/firebaseAdmin.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/index.js";
import {
  getNowUtc,
  isMembershipExpired,
  toUtcDateKey,
  toUtcIso
} from "../utils/index.js";

const scanSchema = z.object({
  scanned_qr_token: z.string().min(8)
});

export function parseAttendanceScanPayload(payload) {
  try {
    return scanSchema.parse(payload);
  } catch (error) {
    throw new HttpError(400, "Invalid attendance scan payload.", error.flatten?.());
  }
}

function enforceMembership(memberData) {
  if (!env.allowExpiredCheckin && isMembershipExpired(memberData.membership_end_date)) {
    throw new HttpError(403, "Membership has expired.");
  }

  if (
    env.requirePaidMembership &&
    memberData.payment_status &&
    memberData.payment_status !== "paid"
  ) {
    throw new HttpError(403, "Membership payment is not in good standing.");
  }
}

function enforceQrToken(scannedQrToken) {
  if (env.gymQrToken !== scannedQrToken) {
    throw new HttpError(403, "Invalid Gym QR code scanned.");
  }
}

function isDuplicateScan(lastActionTime, now) {
  if (!lastActionTime) {
    return false;
  }

  const lastActionMs = new Date(lastActionTime).getTime();
  const nowMs = now.getTime();
  return nowMs - lastActionMs < env.duplicateScanWindowSeconds * 1000;
}

export async function handleAttendanceScan({ memberId, scannedQrToken }) {
  const memberRef = db.collection("members").doc(memberId);
  const attendanceCollection = db.collection("attendance");

  return db.runTransaction(async (transaction) => {
    const memberDoc = await transaction.get(memberRef);

    if (!memberDoc.exists) {
      throw new HttpError(404, "Member profile not found.");
    }

    const memberData = memberDoc.data();
    const now = getNowUtc();
    const nowIso = toUtcIso(now);
    const todayKey = toUtcDateKey(now);

    enforceQrToken(scannedQrToken);
    enforceMembership(memberData);

    const [activeAttendanceSnapshot, latestAttendanceSnapshot] = await Promise.all([
      transaction.get(
        attendanceCollection
          .where("member_id", "==", memberId)
          .where("status", "==", "active")
          .limit(1)
      ),
      transaction.get(
        attendanceCollection
          .where("member_id", "==", memberId)
          .orderBy("last_action_time", "desc")
          .limit(1)
      )
    ]);

    const activeAttendanceDoc = activeAttendanceSnapshot.docs[0];
    const latestAttendanceDoc = latestAttendanceSnapshot.docs[0];

    if (latestAttendanceDoc && isDuplicateScan(latestAttendanceDoc.data().last_action_time, now)) {
      throw new HttpError(429, "Duplicate scan detected. Please wait before scanning again.");
    }

    if (activeAttendanceDoc) {
      const attendanceData = activeAttendanceDoc.data();
      const updatedAttendance = {
        ...attendanceData,
        id: activeAttendanceDoc.id,
        check_out_time: nowIso,
        last_action_time: nowIso,
        status: "completed",
        updated_at: nowIso
      };

      transaction.update(activeAttendanceDoc.ref, {
        check_out_time: nowIso,
        last_action_time: nowIso,
        status: "completed",
        updated_at: nowIso
      });

      return {
        action: "checked_out",
        attendance: updatedAttendance
      };
    }

    const newAttendanceRef = attendanceCollection.doc();
    const newAttendance = {
      id: newAttendanceRef.id,
      member_id: memberId,
      member_name: memberData.name,
      check_in_time: nowIso,
      check_out_time: null,
      last_action_time: nowIso,
      date: todayKey,
      status: "active",
      qr_token_snapshot: scannedQrToken,
      created_at: nowIso,
      updated_at: nowIso
    };

    transaction.set(newAttendanceRef, newAttendance);

    return {
      action: "checked_in",
      attendance: newAttendance
    };
  });
}

export async function handleManualCheckIn({ memberId }) {
  const memberRef = db.collection("members").doc(memberId);
  const attendanceCollection = db.collection("attendance");

  return db.runTransaction(async (transaction) => {
    const memberDoc = await transaction.get(memberRef);

    if (!memberDoc.exists) {
      throw new HttpError(404, "Member profile not found.");
    }

    const memberData = memberDoc.data();
    const now = getNowUtc();
    const nowIso = toUtcIso(now);
    const todayKey = toUtcDateKey(now);

    enforceMembership(memberData);

    const [activeAttendanceSnapshot] = await Promise.all([
      transaction.get(
        attendanceCollection
          .where("member_id", "==", memberId)
          .where("status", "==", "active")
          .limit(1)
      )
    ]);

    const activeAttendanceDoc = activeAttendanceSnapshot.docs[0];

    if (activeAttendanceDoc) {
      const attendanceData = activeAttendanceDoc.data();
      const updatedAttendance = {
        ...attendanceData,
        id: activeAttendanceDoc.id,
        check_out_time: nowIso,
        last_action_time: nowIso,
        status: "completed",
        updated_at: nowIso
      };

      transaction.update(activeAttendanceDoc.ref, {
        check_out_time: nowIso,
        last_action_time: nowIso,
        status: "completed",
        updated_at: nowIso
      });

      return {
        action: "checked_out",
        attendance: updatedAttendance
      };
    }

    const newAttendanceRef = attendanceCollection.doc();
    const newAttendance = {
      id: newAttendanceRef.id,
      member_id: memberId,
      member_name: memberData.name,
      check_in_time: nowIso,
      check_out_time: null,
      last_action_time: nowIso,
      date: todayKey,
      status: "active",
      qr_token_snapshot: "MANUAL_BY_ADMIN",
      created_at: nowIso,
      updated_at: nowIso
    };

    transaction.set(newAttendanceRef, newAttendance);

    return {
      action: "checked_in",
      attendance: newAttendance
    };
  });
}

export async function listAttendance({ memberId, date, status }) {
  let query = db.collection("attendance");

  if (memberId) {
    query = query.where("member_id", "==", memberId);
  }

  if (date) {
    query = query.where("date", "==", date);
  }

  if (status) {
    query = query.where("status", "==", status);
  }

  const snapshot = await query.orderBy("check_in_time", "desc").get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
}

