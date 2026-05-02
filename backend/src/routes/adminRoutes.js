import { Router } from "express";
import { requireRole } from "../middleware/auth.js";
import { createAdmin, listAdmins } from "../services/adminService.js";
import { logActivitySafe } from "../services/activityLogService.js";

const router = Router();

// Only existing admins can create or list other admins
router.use(requireRole("admin"));

router.get("/", async (_request, response, next) => {
  try {
    const admins = await listAdmins();
    response.json({ admins });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (request, response, next) => {
  try {
    const admin = await createAdmin(request.body);
    await logActivitySafe({
      action: "admin_created",
      actorUid: request.user.uid,
      actorEmail: request.user.email,
      actorRole: request.user.role,
      targetUid: admin.id,
      targetName: admin.name
    });
    response.status(201).json({ admin });
  } catch (error) {
    next(error);
  }
});

export { router as adminRoutes };
