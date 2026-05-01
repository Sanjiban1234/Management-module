import { Router } from "express";

import { requireAdminOrSelf, requireRole } from "../middleware/auth.js";
import { logActivitySafe } from "../services/activityLogService.js";
import {
  createMember,
  deleteMember,
  extendMemberMembership,
  getFitnessLogs,
  getMemberById,
  listMembers,
  logFitnessStats,
  updateMember
} from "../services/memberService.js";

const router = Router();

router.get("/", requireRole("admin"), async (_request, response, next) => {
  try {
    const members = await listMembers();
    response.json({ members });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("admin"), async (request, response, next) => {
  try {
    const member = await createMember(request.body);
    await logActivitySafe({
      action: "member_created",
      actorUid: request.user.uid,
      actorEmail: request.user.email,
      actorRole: request.user.role,
      targetUid: member.id,
      targetName: member.name
    });
    response.status(201).json({ member });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireRole("member"), async (request, response, next) => {
  try {
    const member = await getMemberById(request.user.uid);
    response.json({ member });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAdminOrSelf("id"), async (request, response, next) => {
  try {
    const member = await getMemberById(request.params.id);
    response.json({ member });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireRole("admin"), async (request, response, next) => {
  try {
    const member = await updateMember(request.params.id, request.body);
    await logActivitySafe({
      action: "member_updated",
      actorUid: request.user.uid,
      actorEmail: request.user.email,
      actorRole: request.user.role,
      targetUid: member.id,
      targetName: member.name
    });
    response.json({ member });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (request, response, next) => {
  try {
    const result = await deleteMember(request.params.id);
    await logActivitySafe({
      action: "member_archived",
      actorUid: request.user.uid,
      actorEmail: request.user.email,
      actorRole: request.user.role,
      targetUid: request.params.id
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/extend", requireRole("admin"), async (request, response, next) => {
  try {
    const { days } = request.body;
    const member = await extendMemberMembership(request.params.id, days);
    await logActivitySafe({
      action: "membership_extended",
      actorUid: request.user.uid,
      actorEmail: request.user.email,
      actorRole: request.user.role,
      targetUid: member.id,
      targetName: member.name,
      details: { days }
    });
    response.json({ member });
  } catch (error) {
    next(error);
  }
});

router.post("/me/fitness", requireRole("member"), async (request, response, next) => {
  try {
    const log = await logFitnessStats(request.user.uid, request.body);
    response.status(201).json({ log });
  } catch (error) {
    next(error);
  }
});

router.get("/me/fitness", requireRole("member"), async (request, response, next) => {
  try {
    const logs = await getFitnessLogs(request.user.uid);
    response.json({ logs });
  } catch (error) {
    next(error);
  }
});

export { router as memberRoutes };
