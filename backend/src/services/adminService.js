import { z } from "zod";
import { auth, db } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/index.js";
import { getNowUtc, toUtcIso } from "../utils/index.js";
import { generateTemporaryPassword } from "../utils/index.js";

const adminInputSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).or(z.literal("")).optional()
});

export async function createAdmin(payload) {
  const data = adminInputSchema.parse(payload);
  const nowIso = toUtcIso(getNowUtc());

  try {
    const userRecord = await auth.createUser({
      email: data.email,
      password: data.password || generateTemporaryPassword(),
      displayName: data.name
    });

    const adminRecord = {
      id: userRecord.uid,
      name: data.name,
      email: data.email,
      role: "admin",
      device_tokens: [],
      created_at: nowIso,
      updated_at: nowIso
    };

    await db.collection("admins").doc(userRecord.uid).set(adminRecord);

    return adminRecord;
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpError(409, "A Firebase user with this email already exists.");
    }

    if (error instanceof z.ZodError) {
      throw new HttpError(400, "Invalid admin payload.", error.flatten());
    }

    throw error;
  }
}

export async function listAdmins() {
  const snapshot = await db.collection("admins").get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
