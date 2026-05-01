import admin from "firebase-admin";

import { env } from "./env.js";

function buildCredential() {
  if (
    env.firebaseProjectId &&
    env.firebaseClientEmail &&
    env.firebasePrivateKey
  ) {
    return admin.credential.cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey
    });
  }

  return admin.credential.applicationDefault();
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: buildCredential(),
    storageBucket: env.firebaseStorageBucket || undefined
  });
}

const firestore = admin.firestore();
firestore.settings({ ignoreUndefinedProperties: true });

export const auth = admin.auth();
export const db = firestore;
export const messaging = admin.messaging();
export const FieldValue = admin.firestore.FieldValue;

