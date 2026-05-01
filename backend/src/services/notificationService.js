import { z } from "zod";

import { db, messaging } from "../config/firebaseAdmin.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/index.js";
import { daysUntil, getNowUtc } from "../utils/index.js";

const announcementSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2)
});

function collectDeviceTokens(documents) {
  const tokenSet = new Set();
  for (const document of documents) {
    const tokens = document.device_tokens || [];
    for (const token of tokens) {
      tokenSet.add(token);
    }
  }
  return Array.from(tokenSet);
}

async function sendToTokens(tokens, title, body, data = {}) {
  if (!tokens.length) {
    return {
      success: true,
      sent: 0
    };
  }

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title,
      body
    },
    data
  });

  return {
    success: response.failureCount === 0,
    sent: response.successCount,
    failed: response.failureCount
  };
}

export async function sendAnnouncement(payload) {
  let data;

  try {
    data = announcementSchema.parse(payload);
  } catch (error) {
    throw new HttpError(400, "Invalid announcement payload.", error.flatten?.());
  }

  const [membersSnapshot, adminsSnapshot] = await Promise.all([
    db.collection("members").get(),
    db.collection("admins").get()
  ]);

  const tokens = collectDeviceTokens([
    ...membersSnapshot.docs.map((doc) => doc.data()),
    ...adminsSnapshot.docs.map((doc) => doc.data())
  ]);

  return sendToTokens(tokens, data.title, data.body, {
    type: "announcement"
  });
}

export async function dispatchExpiryAlerts() {
  const now = getNowUtc();
  const today = now.toISOString().slice(0, 10);
  const threshold = new Date(now);
  threshold.setUTCDate(threshold.getUTCDate() + env.membershipExpiryAlertDays);

  const snapshot = await db
    .collection("members")
    .where("membership_end_date", ">=", today)
    .where("membership_end_date", "<=", threshold.toISOString().slice(0, 10))
    .get();

  const notifications = await Promise.all(
    snapshot.docs.map(async (doc) => {
      const member = { id: doc.id, ...doc.data() };
      const tokens = member.device_tokens || [];

      if (!tokens.length) {
        return {
          member_id: member.id,
          sent: 0
        };
      }

      const result = await sendToTokens(
        tokens,
        "Membership Expiry Reminder",
        `Your membership expires in ${daysUntil(member.membership_end_date, now)} day(s).`,
        {
          type: "membership_expiry",
          member_id: member.id
        }
      );

      return {
        member_id: member.id,
        sent: result.sent || 0
      };
    })
  );

  return {
    success: true,
    alerts_processed: notifications.length,
    notifications
  };
}

export async function sendPersonalNotification(uid, title, body) {
  const memberDoc = await db.collection("members").doc(uid).get();
  if (!memberDoc.exists) {
    throw new HttpError(404, "Member not found.");
  }

  const tokens = memberDoc.data().device_tokens || [];
  return sendToTokens(tokens, title, body, {
    type: "personal_notification",
    member_id: uid
  });
}

