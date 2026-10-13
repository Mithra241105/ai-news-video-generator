import fs from "fs";
import path from "path";
import { getTopHeadlines, searchNews } from "../services/news.service.js";
import { prepareArticleScript, generateNewsScript } from "../services/script.service.js";
import { prepareImagesForVideo, getImages } from "../services/image.service.js";
import { synthesizeNarration, generateVoice } from "../services/voice.service.js";
import { renderNewsVideo, generateVideo } from "../services/video.service.js";
import schedulerService from "../services/scheduler.service.js";
import {
  NEWS_CATEGORIES,
  TTS_VOICES,
  VIDEO_CONFIG,
  VIDEO_TEMPLATES,
  SUPPORTED_LANGUAGES,
  PATHS
} from "../config/newsConfig.js";

/* =========================================================================
   NEWS & VIDEO CONTROLLERS
========================================================================= */

/**
 * Health check endpoint
 */
export const getHealthController = async (req, res) => {
  try {
    const hasGNews = Boolean(process.env.GNEWS_API_KEY);
    const hasPixabay = Boolean(process.env.PIXABAY_API_KEY);
    const hasUnsplash = Boolean(process.env.UNSPLASH_ACCESS_KEY);

    res.json({
      success: true,
      status: "operational",
      timestamp: new Date().toISOString(),
      capabilities: {
        ffmpeg: true,
        edgeTTS: true,
        gnewsConfigured: hasGNews,
        pixabayConfigured: hasPixabay,
        unsplashConfigured: hasUnsplash
      },
      availableVoices: TTS_VOICES.length,
      availableCategories: NEWS_CATEGORIES.length,
      availableTemplates: Object.keys(VIDEO_TEMPLATES).length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * News Categories list
 */
export const getCategoriesController = (req, res) => {
  res.json({ success: true, categories: NEWS_CATEGORIES });
};

/**
 * TTS Voices list
 */
export const getVoicesController = (req, res) => {
  res.json({
    success: true,
    voices: TTS_VOICES,
    defaultVoice: VIDEO_CONFIG.defaultVoice
  });
};

/**
 * Video Templates list
 */
export const getTemplatesController = (req, res) => {
  res.json({
    success: true,
    templates: Object.values(VIDEO_TEMPLATES),
    defaultTemplate: VIDEO_CONFIG.defaultTemplate || "breaking"
  });
};

/**
 * Supported Languages list
 */
export const getLanguagesController = (req, res) => {
  res.json({
    success: true,
    languages: SUPPORTED_LANGUAGES
  });
};

/**
 * Fetch news articles by category or keyword search
 */
export const getNewsController = async (req, res) => {
  try {
    const { category, search, topic } = req.query;

    // Handle legacy single-step call if user specifically requests all-in-one generation via GET
    if (topic && !category && !search) {
      console.log(`[NewsController] Legacy auto-pipeline requested for topic: "${topic}"`);
      const articles = await searchNews(topic, 5);
      const chosenArticle = articles[0] || { title: `News update on ${topic}`, category: topic };

      const preparedScript = prepareArticleScript(chosenArticle);
      const voiceResult = await synthesizeNarration(preparedScript.script, VIDEO_CONFIG.defaultVoice, "legacy");
      const images = await prepareImagesForVideo(chosenArticle, "legacy", 3);
      const videoResult = await renderNewsVideo({
        images,
        audioPath: voiceResult.audioPath,
        article: chosenArticle,
        aspectRatio: "16:9",
        jobId: "legacy"
      });

      return res.json({
        success: true,
        topic,
        article: chosenArticle,
        narration: preparedScript.script,
        images: images.map((img) => ({ url: img.url, credit: img.credit })),
        audioFile: voiceResult.audioFile,
        videoFile: videoResult.videoFile,
        videoUrl: videoResult.videoUrl
      });
    }

    let articles = [];
    if (search && search.trim()) {
      articles = await searchNews(search.trim(), 9);
    } else {
      articles = await getTopHeadlines(category || "general", 9);
    }

    res.json({
      success: true,
      category: category || "general",
      search: search || null,
      count: articles.length,
      articles
    });
  } catch (error) {
    console.error("[NewsController] getNewsController error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Generate narration script from a chosen article
 */
export const generateScriptController = async (req, res) => {
  try {
    const { article } = req.body;
    if (!article || !article.title) {
      return res.status(400).json({
        success: false,
        error: "Missing article object with valid title"
      });
    }

    const scriptData = prepareArticleScript(article);
    res.json({
      success: true,
      ...scriptData
    });
  } catch (error) {
    console.error("[NewsController] generateScript error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Synthesize narration audio preview
 */
export const generateVoiceController = async (req, res) => {
  try {
    const { script, voice } = req.body;
    if (!script || !script.trim()) {
      return res.status(400).json({
        success: false,
        error: "Script text is required"
      });
    }

    const jobId = Date.now().toString();
    const result = await synthesizeNarration(script, voice, jobId);

    res.json({
      success: true,
      audioFile: result.audioFile,
      audioUrl: result.audioUrl,
      duration: result.duration,
      subtitleUrl: result.subtitleFile ? `/media/${result.subtitleFile}` : null,
      voice: result.voice,
      provider: result.provider
    });
  } catch (error) {
    console.error("[NewsController] generateVoice error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Render news video
 */
export const renderVideoController = async (req, res) => {
  try {
    const {
      article,
      headline,
      script,
      voice = VIDEO_CONFIG.defaultVoice,
      aspectRatio = "16:9",
      template = "breaking",
      narrationLang = "en",
      subtitlesLang = "en",
      audioFile = null
    } = req.body;

    if (!article || (!article.title && !headline)) {
      return res.status(400).json({
        success: false,
        error: "Article with valid headline is required"
      });
    }

    if (!script || !script.trim()) {
      return res.status(400).json({
        success: false,
        error: "Narration script is required"
      });
    }

    // Input Validation
    const validatedRatio = ["16:9", "9:16"].includes(aspectRatio) ? aspectRatio : "16:9";
    const validatedTemplate = VIDEO_TEMPLATES[template] ? template : "breaking";
    const finalArticle = {
      ...article,
      title: (headline && headline.trim()) || article.title
    };

    const jobId = Date.now().toString();

    // 1. Prepare Audio (synthesize if not provided or missing)
    let audioPath = audioFile ? path.join(PATHS.outputs, path.basename(audioFile)) : null;
    let subtitlePath = null;

    if (!audioPath || !fs.existsSync(audioPath)) {
      console.log(`[NewsController] Synthesizing audio for job ${jobId}...`);
      const voiceResult = await synthesizeNarration(script, voice, jobId);
      audioPath = voiceResult.audioPath;
      subtitlePath = voiceResult.subtitlePath;
    }

    // 2. Prepare Visual Assets
    console.log(`[NewsController] Fetching images for job ${jobId}...`);
    const images = await prepareImagesForVideo(finalArticle, jobId, 3);

    // 3. Render Video with Selected Template
    console.log(`[NewsController] Rendering video for job ${jobId} (${validatedRatio}, template: ${validatedTemplate})...`);
    const videoResult = await renderNewsVideo({
      images,
      audioPath,
      article: finalArticle,
      aspectRatio: validatedRatio,
      template: validatedTemplate,
      subtitlePath,
      jobId
    });

    const metaRecord = {
      jobId,
      fileName: videoResult.videoFile,
      videoUrl: videoResult.videoUrl,
      thumbnailUrl: videoResult.thumbnailUrl,
      articleTitle: finalArticle.title,
      sourceName: finalArticle.source?.name || "Global News Wire",
      sourceUrl: finalArticle.url || null,
      category: finalArticle.category || "General",
      template: videoResult.template || validatedTemplate,
      selectedVoice: voice,
      narrationLang,
      subtitlesLang,
      aspectRatio: videoResult.aspectRatio,
      duration: videoResult.duration,
      fileSize: videoResult.fileSize,
      dimensions: { width: videoResult.width, height: videoResult.height },
      createdAt: new Date().toISOString()
    };

    // Persist to lightweight archive metadata
    const existingMeta = loadArchiveMeta().filter((m) => m.fileName !== metaRecord.fileName);
    existingMeta.unshift(metaRecord);
    saveArchiveMeta(existingMeta);

    res.json({
      success: true,
      jobId,
      videoFile: videoResult.videoFile,
      videoUrl: videoResult.videoUrl,
      thumbnailUrl: videoResult.thumbnailUrl,
      duration: videoResult.duration,
      fileSize: videoResult.fileSize,
      aspectRatio: videoResult.aspectRatio,
      template: metaRecord.template,
      voice: metaRecord.selectedVoice,
      dimensions: { width: videoResult.width, height: videoResult.height },
      article: {
        title: metaRecord.articleTitle,
        source: metaRecord.sourceName,
        url: metaRecord.sourceUrl
      }
    });
  } catch (error) {
    console.error("[NewsController] renderVideo error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const ARCHIVE_META_FILE = path.join(PATHS.outputs, "archive_meta.json");

const loadArchiveMeta = () => {
  try {
    if (fs.existsSync(ARCHIVE_META_FILE)) {
      const data = JSON.parse(fs.readFileSync(ARCHIVE_META_FILE, "utf-8"));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.warn("[NewsController] Could not read archive_meta.json:", err.message);
  }
  return [];
};

/**
 * Atomic durable persistence for archive metadata
 */
const saveArchiveMeta = (metaList) => {
  try {
    if (!fs.existsSync(PATHS.outputs)) fs.mkdirSync(PATHS.outputs, { recursive: true });
    const tempFile = `${ARCHIVE_META_FILE}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    fs.writeFileSync(tempFile, JSON.stringify(metaList, null, 2), "utf-8");
    fs.renameSync(tempFile, ARCHIVE_META_FILE);
  } catch (err) {
    console.error("[NewsController] Failed to save archive_meta.json:", err.message);
  }
};

/**
 * Retrieve generation history with persistent metadata
 */
export const getVideoHistoryController = async (req, res) => {
  try {
    if (!fs.existsSync(PATHS.outputs)) {
      return res.json({ success: true, videos: [] });
    }

    const files = fs.readdirSync(PATHS.outputs);
    const existingMp4Set = new Set(files.filter((f) => f.endsWith(".mp4") && !f.startsWith("test_")));

    // Filter meta entries whose MP4 files still exist
    const metaList = loadArchiveMeta().filter((m) => existingMp4Set.has(m.fileName));
    const indexedFileNames = new Set(metaList.map((m) => m.fileName));

    // Discover legacy/existing MP4s that don't have metadata yet
    for (const fileName of existingMp4Set) {
      if (!indexedFileNames.has(fileName)) {
        const filePath = path.join(PATHS.outputs, fileName);
        const stats = fs.statSync(filePath);
        if (stats.size === 0) continue;

        const base = fileName.replace(".mp4", "").replace("news_video_", "thumb_");
        const thumbFile = `${base}.jpg`;
        const hasThumb = fs.existsSync(path.join(PATHS.outputs, thumbFile));

        metaList.push({
          jobId: fileName.replace(/\D/g, "") || "legacy",
          fileName,
          videoUrl: `/media/${fileName}`,
          thumbnailUrl: hasThumb ? `/media/${thumbFile}` : null,
          articleTitle: fileName.replace(/_/g, " ").replace(".mp4", ""),
          sourceName: "News Archive",
          sourceUrl: null,
          category: "General",
          aspectRatio: "16:9",
          duration: null,
          fileSize: stats.size,
          createdAt: stats.birthtime || stats.mtime
        });
      }
    }

    metaList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    saveArchiveMeta(metaList);

    res.json({ success: true, videos: metaList });
  } catch (error) {
    console.error("[NewsController] getVideoHistory error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Safe explicit deletion of an archived video
 */
export const deleteVideoController = async (req, res) => {
  try {
    const rawName = req.params.fileName;
    if (!rawName) {
      return res.status(400).json({ success: false, error: "File name is required" });
    }

    // Sanitize to prevent path traversal
    const fileName = path.basename(rawName);
    if (!fileName.endsWith(".mp4")) {
      return res.status(400).json({ success: false, error: "Only MP4 video files can be deleted" });
    }

    const filePath = path.join(PATHS.outputs, fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: "Video file not found" });
    }

    // Delete MP4
    fs.unlinkSync(filePath);

    // Delete associated thumbnail if present
    const base = fileName.replace(".mp4", "").replace("news_video_", "thumb_");
    const thumbPath = path.join(PATHS.outputs, `${base}.jpg`);
    if (fs.existsSync(thumbPath)) {
      try { fs.unlinkSync(thumbPath); } catch (_) {}
    }

    // Delete associated audio/vtt if present
    const id = fileName.replace("news_video_", "").replace(".mp4", "");
    if (id && /^\d+$/.test(id)) {
      const audioPath = path.join(PATHS.outputs, `${id}_${id}.mp3`);
      const vttPath = path.join(PATHS.outputs, `${id}_${id}.vtt`);
      if (fs.existsSync(audioPath)) { try { fs.unlinkSync(audioPath); } catch (_) {} }
      if (fs.existsSync(vttPath)) { try { fs.unlinkSync(vttPath); } catch (_) {} }
    }

    // Update metadata file
    const metaList = loadArchiveMeta().filter((m) => m.fileName !== fileName);
    saveArchiveMeta(metaList);

    console.log(`[NewsController] Safely deleted video archive: ${fileName}`);
    res.json({ success: true, deleted: fileName });
  } catch (error) {
    console.error("[NewsController] deleteVideo error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get current state, next execution, and audit log of the daily scheduler
 */
export const getSchedulerStatusController = (req, res) => {
  try {
    const status = schedulerService.getSchedulerStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    console.error("[NewsController] getSchedulerStatus error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Manually trigger an immediate scheduled news video production run
 */
export const triggerSchedulerController = async (req, res) => {
  try {
    const { force, category, template, voice, aspectRatio } = req.body || {};
    const result = await schedulerService.runScheduledJob({
      isManual: true,
      force: Boolean(force),
      category,
      template,
      voice,
      aspectRatio
    });
    res.json(result);
  } catch (error) {
    console.error("[NewsController] triggerScheduler error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Dynamically configure or start/stop the automated scheduler
 */
export const configureSchedulerController = (req, res) => {
  try {
    const { enabled, intervalHours, preferredCategory, template } = req.body || {};
    let status;
    if (enabled === false) {
      status = schedulerService.stopScheduler();
    } else {
      status = schedulerService.startScheduler({ intervalHours, preferredCategory, template });
    }
    res.json({ success: true, ...status });
  } catch (error) {
    console.error("[NewsController] configureScheduler error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

