import { Router } from "express";
import { db } from "../config/firebaseAdmin.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const snapshot = await db.collection("plans").get();
    const plans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const { name, price } = req.body;
    const docRef = await db.collection("plans").add({ name, price });
    res.status(201).json({ id: docRef.id, name, price });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    await db.collection("plans").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export { router as planRoutes };
