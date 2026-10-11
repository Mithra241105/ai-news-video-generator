import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import newsRoutes from "./routes/news.routes.js";
import { getHealthController } from "./controllers/news.controller.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend assets directly from backend
app.use(express.static(path.join(__dirname, "../../frontend")));

// Serve generated outputs (videos, audio, thumbnails)
app.use("/media", express.static(path.join(__dirname, "../outputs")));

// Serve fallback images
app.use(
  "/media/fallback",
  express.static(path.join(__dirname, "../assets/fallback"))
);

// Health check endpoint
app.get("/api/health", getHealthController);

// News and video generation routes
app.use("/api/news", newsRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("[App Error Handler]:", err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error"
  });
});

export default app;
