import express from "express";
import {
  getNewsController,
  getCategoriesController,
  getVoicesController,
  getTemplatesController,
  getLanguagesController,
  generateScriptController,
  generateVoiceController,
  renderVideoController,
  getVideoHistoryController,
  getHealthController,
  deleteVideoController,
  getSchedulerStatusController,
  triggerSchedulerController,
  configureSchedulerController
} from "../controllers/news.controller.js";

const router = express.Router();

router.get("/health", getHealthController);
router.get("/categories", getCategoriesController);
router.get("/voices", getVoicesController);
router.get("/templates", getTemplatesController);
router.get("/languages", getLanguagesController);
router.get("/history", getVideoHistoryController);
router.get("/scheduler/status", getSchedulerStatusController);
router.get("/", getNewsController);

router.post("/script", generateScriptController);
router.post("/voice", generateVoiceController);
router.post("/video", renderVideoController);
router.post("/scheduler/trigger", triggerSchedulerController);
router.post("/scheduler/configure", configureSchedulerController);

router.delete("/history/:fileName", deleteVideoController);
router.delete("/video/:fileName", deleteVideoController);

export default router;
