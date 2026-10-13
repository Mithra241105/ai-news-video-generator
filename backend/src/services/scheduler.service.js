import fs from "fs";
import path from "path";
import { PATHS, SCHEDULER_CONFIG, VIDEO_TEMPLATES } from "../config/newsConfig.js";
import { getTopHeadlines } from "./news.service.js";
import { prepareArticleScript } from "./script.service.js";
import { synthesizeNarration } from "./voice.service.js";
import { prepareImagesForVideo } from "./image.service.js";
import { renderNewsVideo } from "./video.service.js";

// Storage file paths
const AUDIT_FILE = path.join(PATHS.outputs, SCHEDULER_CONFIG.auditFile);
const SEEN_FILE = path.join(PATHS.outputs, SCHEDULER_CONFIG.seenFile);
const ARCHIVE_META_FILE = path.join(PATHS.outputs, "archive_meta.json");

// Scheduler State
let schedulerTimer = null;
let isJobRunning = false;

let schedulerState = {
  enabled: process.env.ENABLE_DAILY_SCHEDULER !== "false",
  intervalHours: parseInt(process.env.SCHEDULER_INTERVAL_HOURS || "24", 10),
  preferredCategory: process.env.SCHEDULER_CATEGORY || SCHEDULER_CONFIG.defaultCategory,
  template: process.env.SCHEDULER_TEMPLATE || SCHEDULER_CONFIG.defaultTemplate,
  voice: process.env.SCHEDULER_VOICE || SCHEDULER_CONFIG.defaultVoice,
  aspectRatio: process.env.SCHEDULER_ASPECT_RATIO || SCHEDULER_CONFIG.defaultAspectRatio,
  lastRunAt: null,
  nextRunAt: null,
  lastStatus: "IDLE", // IDLE, RUNNING, SUCCESS, FAILED
  lastError: null,
  lastJobSummary: null,
  totalRuns: 0,
  successfulRuns: 0,
  failedRuns: 0
};

/**
 * Safely read a JSON file or return default value
 */
function readJsonSafe(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[SchedulerService] Warning reading ${path.basename(filePath)}:`, err.message);
  }
  return defaultVal;
}

/**
 * Atomically write JSON data with temp file + rename
 */
function writeJsonAtomic(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tempPath = `${filePath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`[SchedulerService] Failed to write ${path.basename(filePath)}:`, err.message);
  }
}

/**
 * Normalizes title for deduplication comparison
 */
function normalizeTitleForComparison(title = "") {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();
}

/**
 * Get previously produced story signatures (title hash or normalized text)
 */
export function getSeenStories() {
  const seenList = readJsonSafe(SEEN_FILE, []);
  const seenSet = new Set(seenList.map((s) => (typeof s === "string" ? normalizeTitleForComparison(s) : normalizeTitleForComparison(s.title))));

  // Also include titles already in archive_meta.json
  const archive = readJsonSafe(ARCHIVE_META_FILE, []);
  archive.forEach((item) => {
    if (item.articleTitle) seenSet.add(normalizeTitleForComparison(item.articleTitle));
  });

  return seenSet;
}

/**
 * Mark a story as seen
 */
export function markStoryAsSeen(story) {
  const seenList = readJsonSafe(SEEN_FILE, []);
  const record = {
    title: story.title,
    url: story.url || null,
    seenAt: new Date().toISOString()
  };

  seenList.unshift(record);
  // Keep last 200 stories
  if (seenList.length > 200) seenList.length = 200;
  writeJsonAtomic(SEEN_FILE, seenList);
}

/**
 * Record an audit log entry for the scheduler run
 */
function logAuditRecord(record) {
  const auditList = readJsonSafe(AUDIT_FILE, []);
  auditList.unshift({
    id: `sched_${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...record
  });

  if (auditList.length > SCHEDULER_CONFIG.maxAuditEntries) {
    auditList.length = SCHEDULER_CONFIG.maxAuditEntries;
  }
  writeJsonAtomic(AUDIT_FILE, auditList);
}

/**
 * Main execution function for automated daily news video generation
 */
export async function runScheduledJob(options = {}) {
  const {
    isManual = false,
    force = false,
    category = schedulerState.preferredCategory,
    template = schedulerState.template,
    voice = schedulerState.voice,
    aspectRatio = schedulerState.aspectRatio
  } = options;

  if (isJobRunning) {
    const errorMsg = "A scheduled broadcast production job is already actively running.";
    console.warn(`[SchedulerService] ${errorMsg}`);
    return { success: false, status: "RUNNING", message: errorMsg };
  }

  isJobRunning = true;
  const startTime = Date.now();
  schedulerState.lastRunAt = new Date().toISOString();
  schedulerState.lastStatus = "RUNNING";
  schedulerState.lastError = null;

  console.log(`[SchedulerService] 🚀 Starting automated news video dispatch (Category: ${category}, Manual: ${isManual})...`);

  try {
    // 1. Fetch fresh headlines
    const articles = await getTopHeadlines(category);
    if (!articles || articles.length === 0) {
      throw new Error(`No news headlines returned for category '${category}'`);
    }

    // 2. Deduplicate: Find first story not yet produced
    const seenSet = getSeenStories();
    let selectedArticle = null;

    for (const article of articles) {
      const normalized = normalizeTitleForComparison(article.title);
      if (!seenSet.has(normalized)) {
        selectedArticle = article;
        break;
      }
    }

    // If all current articles were seen and force is not set, report status cleanly
    if (!selectedArticle) {
      if (force) {
        console.log("[SchedulerService] All articles were previously produced, but force=true is set; picking first article.");
        selectedArticle = articles[0];
      } else {
        console.log("[SchedulerService] ℹ️ All top stories were previously generated. Deduplication active; skipping redundant video.");
        isJobRunning = false;
        schedulerState.lastStatus = "SUCCESS";
        schedulerState.totalRuns += 1;
        schedulerState.lastJobSummary = {
          storyTitle: null,
          action: "SKIPPED_DUPLICATE",
          message: "All current top headlines have already been broadcast. Deduplication prevented repeating stories."
        };
        logAuditRecord({
          action: "SKIPPED_DUPLICATE",
          status: "SUCCESS",
          executionTimeMs: Date.now() - startTime,
          message: "All headlines previously produced. Deduplication active."
        });
        return {
          success: true,
          skipped: true,
          reason: "All available stories already produced. Deduplication prevented duplicate video creation."
        };
      }
    }

    console.log(`[SchedulerService] 📰 Selected fresh story for automation: "${selectedArticle.title}" (${selectedArticle.source?.name || "Wire"})`);

    const jobId = `auto_${Date.now()}`;
    const validatedTemplate = VIDEO_TEMPLATES[template] ? template : "breaking";
    const validatedRatio = ["16:9", "9:16"].includes(aspectRatio) ? aspectRatio : "16:9";

    // 3. Prepare Anchor Narration Script
    const scriptData = prepareArticleScript(selectedArticle);
    const script = scriptData.script;

    // 4. Synthesize Voice Narration & Synchronized Subtitles
    console.log(`[SchedulerService] 🎙️ Synthesizing narration audio with voice: ${voice}...`);
    const voiceResult = await synthesizeNarration(script, voice, jobId);

    // 5. Download and Prepare Visual Assets
    console.log(`[SchedulerService] 🖼️ Fetching visual assets for story...`);
    const images = await prepareImagesForVideo(selectedArticle, jobId, 3);

    // 6. Render Broadcast Video via FFmpeg Filtergraph
    console.log(`[SchedulerService] 🎬 Rendering broadcast video (${validatedRatio}, template: ${validatedTemplate})...`);
    const videoResult = await renderNewsVideo({
      images,
      audioPath: voiceResult.audioPath,
      article: selectedArticle,
      aspectRatio: validatedRatio,
      template: validatedTemplate,
      subtitlePath: voiceResult.subtitlePath,
      jobId
    });

    // 7. Persist to Archive Metadata with automated flag
    const metaRecord = {
      jobId,
      fileName: videoResult.videoFile,
      videoUrl: videoResult.videoUrl,
      thumbnailUrl: videoResult.thumbnailUrl,
      articleTitle: selectedArticle.title,
      sourceName: selectedArticle.source?.name || "Global News Wire",
      sourceUrl: selectedArticle.url || null,
      category,
      template: validatedTemplate,
      selectedVoice: voice,
      narrationLang: "en",
      subtitlesLang: "en",
      aspectRatio: validatedRatio,
      duration: videoResult.duration,
      fileSize: videoResult.fileSize,
      dimensions: { width: videoResult.width, height: videoResult.height },
      automated: true,
      scheduledBy: isManual ? "manual-trigger" : "daily-cron",
      createdAt: new Date().toISOString()
    };

    const existingMeta = readJsonSafe(ARCHIVE_META_FILE, []);
    existingMeta.unshift(metaRecord);
    writeJsonAtomic(ARCHIVE_META_FILE, existingMeta);

    // 8. Mark story as seen
    markStoryAsSeen(selectedArticle);

    // 9. Update state & audit log
    const durationMs = Date.now() - startTime;
    schedulerState.lastStatus = "SUCCESS";
    schedulerState.totalRuns += 1;
    schedulerState.successfulRuns += 1;
    schedulerState.lastJobSummary = {
      jobId,
      fileName: videoResult.videoFile,
      videoUrl: videoResult.videoUrl,
      storyTitle: selectedArticle.title,
      duration: videoResult.duration,
      aspectRatio: validatedRatio,
      template: validatedTemplate,
      executionTimeMs: durationMs
    };

    logAuditRecord({
      jobId,
      fileName: videoResult.videoFile,
      storyTitle: selectedArticle.title,
      source: selectedArticle.source?.name,
      category,
      template: validatedTemplate,
      aspectRatio: validatedRatio,
      duration: videoResult.duration,
      fileSize: videoResult.fileSize,
      status: "SUCCESS",
      executionTimeMs: durationMs,
      automated: true
    });

    console.log(`[SchedulerService] ✅ Automated daily broadcast video successfully produced: ${videoResult.videoFile} in ${(durationMs / 1000).toFixed(1)}s`);

    isJobRunning = false;
    return {
      success: true,
      jobId,
      videoFile: videoResult.videoFile,
      videoUrl: videoResult.videoUrl,
      thumbnailUrl: videoResult.thumbnailUrl,
      articleTitle: selectedArticle.title,
      duration: videoResult.duration,
      executionTimeMs: durationMs
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("[SchedulerService] ❌ Scheduled broadcast job failed:", error.message);

    schedulerState.lastStatus = "FAILED";
    schedulerState.lastError = error.message;
    schedulerState.totalRuns += 1;
    schedulerState.failedRuns += 1;

    logAuditRecord({
      status: "FAILED",
      error: error.message,
      executionTimeMs: durationMs,
      category,
      automated: true
    });

    isJobRunning = false;
    return {
      success: false,
      error: error.message,
      executionTimeMs: durationMs
    };
  }
}

/**
 * Calculate and set the next run schedule
 */
function scheduleNextRun() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  if (!schedulerState.enabled) {
    schedulerState.nextRunAt = null;
    return;
  }

  const intervalMs = Math.max(1, schedulerState.intervalHours) * 60 * 60 * 1000;
  schedulerState.nextRunAt = new Date(Date.now() + intervalMs).toISOString();

  console.log(`[SchedulerService] Next automated broadcast dispatch scheduled for: ${schedulerState.nextRunAt} (every ${schedulerState.intervalHours}h)`);

  schedulerTimer = setTimeout(async () => {
    try {
      await runScheduledJob({ isManual: false });
    } catch (err) {
      console.error("[SchedulerService] Uncaught error in automated job cycle:", err.message);
    } finally {
      scheduleNextRun();
    }
  }, intervalMs);

  // Unref so timer doesn't prevent graceful server shutdown
  if (schedulerTimer.unref) schedulerTimer.unref();
}

/**
 * Start the background scheduler
 */
export function startScheduler(options = {}) {
  if (options.intervalHours) {
    schedulerState.intervalHours = parseInt(options.intervalHours, 10);
  }
  if (options.preferredCategory) {
    schedulerState.preferredCategory = options.preferredCategory;
  }
  if (options.template) {
    schedulerState.template = options.template;
  }

  schedulerState.enabled = true;
  scheduleNextRun();

  console.log(`[SchedulerService] Daily News Video Scheduler initialized and active.`);
  return getSchedulerStatus();
}

/**
 * Stop the background scheduler
 */
export function stopScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  schedulerState.enabled = false;
  schedulerState.nextRunAt = null;
  console.log("[SchedulerService] Scheduler stopped.");
  return getSchedulerStatus();
}

/**
 * Get current scheduler status and audit history
 */
export function getSchedulerStatus() {
  const auditLogs = readJsonSafe(AUDIT_FILE, []);
  const seenStories = readJsonSafe(SEEN_FILE, []);

  return {
    ...schedulerState,
    isJobRunning,
    auditHistory: auditLogs.slice(0, 10),
    totalSeenStories: seenStories.length
  };
}

export default {
  startScheduler,
  stopScheduler,
  runScheduledJob,
  getSchedulerStatus,
  getSeenStories,
  markStoryAsSeen
};
