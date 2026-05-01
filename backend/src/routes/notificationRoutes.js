import { Router } from "express";
import { z } from "zod";

import { requireRole } from "../middleware/auth.js";
import { HttpError } from "../utils/index.js";
import { saveDeviceToken } from "../services/memberService.js";
import {
  dispatchExpiryAlerts,
  sendAnnouncement,
  sendPersonalNotification
} from "../services/notificationService.js";

const registerTokenSchema = z.object({
  token: z.string().min(20)
});

const router = Router();

router.post("/register-token", async (request, response, next) => {
  try {
    const payload = registerTokenSchema.parse(request.body);

    const result = await saveDeviceToken({
      uid: request.user.uid,
      role: request.user.role,
      token: payload.token
    });

    response.json(result);
  } catch (error) {
    next(
      error instanceof z.ZodError
        ? new HttpError(400, "Invalid FCM registration payload.", error.flatten())
        : error
    );
  }
});

router.post("/announcements", requireRole("admin"), async (request, response, next) => {
  try {
    const result = await sendAnnouncement(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/expiry-alerts/dispatch", requireRole("admin"), async (_request, response, next) => {
  try {
    const result = await dispatchExpiryAlerts();
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/send-personal", requireRole("admin"), async (request, response, next) => {
  try {
    const { uid, title, body } = request.body;
    const result = await sendPersonalNotification(uid, title, body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as notificationRoutes };
