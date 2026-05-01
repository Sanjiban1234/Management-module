import { auth, db } from "./src/config/firebaseAdmin.js";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "password";

async function createAdmin() {
  try {
    let user;
    try {
      // 1. Check if user already exists
      user = await auth.getUserByEmail(ADMIN_EMAIL);
      console.log(`User ${ADMIN_EMAIL} already exists in Auth. UID: ${user.uid}`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // 2. Create the user in Firebase Auth
        user = await auth.createUser({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          displayName: "System Admin"
        });
        console.log(`Created new user: ${ADMIN_EMAIL}. UID: ${user.uid}`);
      } else {
        throw error;
      }
    }

    // 3. Add to the 'admins' collection in Firestore
    await db.collection("admins").doc(user.uid).set({
      email: ADMIN_EMAIL,
      name: "System Admin",
      createdAt: new Date().toISOString()
    });

    console.log(`Successfully promoted ${ADMIN_EMAIL} to ADMIN in Firestore!`);
    process.exit(0);
  } catch (error) {
    console.error("Error creating/promoting admin:", error);
    process.exit(1);
  }
}

createAdmin();
