import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";

import { env } from "./config/env.js";
import { verifyFirebaseToken } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { attendanceRoutes } from "./routes/attendanceRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { memberRoutes } from "./routes/memberRoutes.js";
import { notificationRoutes } from "./routes/notificationRoutes.js";
import { planRoutes } from "./routes/planRoutes.js";

const app = express();

app.use(helmet());

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 300, // Prevent abuse while keeping app interactions smooth
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_request, response, _next, options) => {
    response.status(options.statusCode).json({
      error: {
        message: "Too many requests, please try again later."
      }
    });
  }
});
app.use(limiter);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow local origins for mobile apps (Capacitor)
      const allowedOrigins = [
        "http://localhost",
        "capacitor://localhost",
        "http://localhost:5173"
      ];
      
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith("http://192.168.")) {
        callback(null, true);
      } else {
        // Fallback: Echo the origin to allow it dynamically
        callback(null, origin);
      }
    },
    credentials: true
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (_request, response) => {
  response.json({
    message: "Gym Management API is live!",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (_request, response) => {
  response.json({
    status: "ok"
  });
});

app.use("/auth", verifyFirebaseToken, authRoutes);
app.use("/members", verifyFirebaseToken, memberRoutes);
app.use("/attendance", verifyFirebaseToken, attendanceRoutes);
app.use("/dashboard", verifyFirebaseToken, dashboardRoutes);
app.use("/notifications", verifyFirebaseToken, notificationRoutes);
app.use("/plans", verifyFirebaseToken, planRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
export default app;
