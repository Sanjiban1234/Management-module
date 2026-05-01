import { auth, db } from "../config/firebaseAdmin.js";
import { HttpError } from "../utils/index.js";

async function resolveUserRole(uid) {
  const [adminDoc, memberDoc] = await Promise.all([
    db.collection("admins").doc(uid).get(),
    db.collection("members").doc(uid).get()
  ]);

  if (adminDoc.exists) {
    return {
      role: "admin",
      profile: adminDoc.data()
    };
  }

  if (memberDoc.exists) {
    const profile = memberDoc.data();
    if (profile.archived === true) {
      throw new HttpError(403, "This member account has been archived.");
    }

    return {
      role: "member",
      profile
    };
  }

  throw new HttpError(403, "User does not have an assigned application role.");
}

export async function verifyFirebaseToken(request, _response, next) {
  try {
    const authorization = request.headers.authorization || "";
    const [, token] = authorization.split(" ");

    if (!token) {
      throw new HttpError(401, "Missing Firebase ID token.");
    }

    const decodedToken = await auth.verifyIdToken(token, true);
    const { role, profile } = await resolveUserRole(decodedToken.uid);

    request.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      firebaseToken: decodedToken,
      role,
      profile
    };

    next();
  } catch (error) {
    next(
      error instanceof HttpError
        ? error
        : new HttpError(401, "Invalid or expired Firebase ID token.")
    );
  }
}

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      next(new HttpError(403, "You do not have permission to perform this action."));
      return;
    }

    next();
  };
}

export function requireAdminOrSelf(paramKey = "id") {
  return (request, _response, next) => {
    if (request.user?.role === "admin") {
      next();
      return;
    }

    if (request.user?.uid === request.params[paramKey]) {
      next();
      return;
    }

    next(new HttpError(403, "You can only access your own records."));
  };
}
