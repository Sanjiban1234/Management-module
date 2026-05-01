import { Router } from "express";

import { requireRole } from "../middleware/auth.js";
import { getDashboardStats, getOccupancy } from "../services/dashboardService.js";
import { listActivityLogs } from "../services/activityLogService.js";

const router = Router();

router.get("/stats", requireRole("admin"), async (_request, response, next) => {
  try {
    const stats = await getDashboardStats();
    response.json(stats);
  } catch (error) {
    next(error);
  }
});

router.get("/occupancy", requireRole("admin", "member"), async (_request, response, next) => {
  try {
    const occupancy = await getOccupancy();
    response.json(occupancy);
  } catch (error) {
    next(error);
  }
});

router.get("/activity", requireRole("admin"), async (request, response, next) => {
  try {
    const activity = await listActivityLogs(request.query.limit);
    response.json({ activity });
  } catch (error) {
    next(error);
  }
});

export { router as dashboardRoutes };
