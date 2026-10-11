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
  deleteVideoController
} from "../controllers/news.controller.js";

const router = express.Router();

router.get("/health", getHealthController);
router.get("/categories", getCategoriesController);
router.get("/voices", getVoicesController);
router.get("/templates", getTemplatesController);
router.get("/languages", getLanguagesController);
router.get("/history", getVideoHistoryController);
router.get("/", getNewsController);

router.post("/script", generateScriptController);
router.post("/voice", generateVoiceController);
router.post("/video", renderVideoController);

router.delete("/history/:fileName", deleteVideoController);
router.delete("/video/:fileName", deleteVideoController);

export default router;
