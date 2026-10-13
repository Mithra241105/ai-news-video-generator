import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import schedulerService from "./services/scheduler.service.js";

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  const isSchedulerEnabled = process.env.ENABLE_DAILY_SCHEDULER === "true" || (process.env.NODE_ENV !== "production" && process.env.ENABLE_DAILY_SCHEDULER !== "false");
  if (isSchedulerEnabled) {
    schedulerService.startScheduler();
  } else {
    console.log("[Server] Autonomous daily scheduler disabled by default (cloud free-tier policy). Run locally or set ENABLE_DAILY_SCHEDULER=true.");
  }
});

process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, closing HTTP server gracefully...");
  schedulerService.stopScheduler();
  server.close(() => {
    console.log("[Server] HTTP server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[Server] SIGINT received, shutting down gracefully...");
  schedulerService.stopScheduler();
  server.close(() => {
    console.log("[Server] HTTP server closed.");
    process.exit(0);
  });
});
