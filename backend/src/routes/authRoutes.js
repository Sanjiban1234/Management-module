import { Router } from "express";

const router = Router();

router.get("/me", (request, response) => {
  response.json({
    user: {
      uid: request.user.uid,
      email: request.user.email,
      role: request.user.role,
      profile: request.user.profile
    }
  });
});

export { router as authRoutes };

