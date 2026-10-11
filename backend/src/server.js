import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, closing HTTP server gracefully...");
  server.close(() => {
    console.log("[Server] HTTP server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[Server] SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("[Server] HTTP server closed.");
    process.exit(0);
  });
});
