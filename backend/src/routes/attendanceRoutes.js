import { Router } from "express";

import { requireAdminOrSelf, requireRole } from "../middleware/auth.js";
import { logActivitySafe } from "../services/activityLogService.js";
import {
  handleAttendanceScan,
  handleManualCheckIn,
  listAttendance,
  parseAttendanceScanPayload
} from "../services/attendanceService.js";

const router = Router();

router.post("/check-in", requireRole("admin"), async (request, response, next) => {
  try {
    const { member_id } = request.body;
    if (!member_id) {
      return response.status(400).json({ error: "member_id is required." });
    }
    const result = await handleManualCheckIn({ memberId: member_id });
    await logActivitySafe({
      action: `attendance_${result.action}_manual`,
      actorUid: request.user.uid,
      actorEmail: request.user.email,
      actorRole: request.user.role,
      targetUid: member_id,
      targetName: result.attendance?.member_name || null
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/scan", requireRole("member"), async (request, response, next) => {
  try {
    const payload = parseAttendanceScanPayload(request.body);
    const result = await handleAttendanceScan({
      memberId: request.user.uid,
      scannedQrToken: payload.scanned_qr_token
    });
    await logActivitySafe({
      action: `attendance_${result.action}_scan`,
      actorUid: request.user.uid,
      actorEmail: request.user.email,
      actorRole: request.user.role,
      targetUid: request.user.uid,
      targetName: result.attendance?.member_name || null
    });

    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/", requireRole("admin"), async (request, response, next) => {
  try {
    const attendance = await listAttendance({
      memberId: request.query.member_id,
      date: request.query.date,
      status: request.query.status
    });

    response.json({ attendance });
  } catch (error) {
    next(error);
  }
});

router.get("/:memberId", requireAdminOrSelf("memberId"), async (request, response, next) => {
  try {
    const attendance = await listAttendance({
      memberId: request.params.memberId
    });

    response.json({ attendance });
  } catch (error) {
    next(error);
  }
});

export { router as attendanceRoutes };
