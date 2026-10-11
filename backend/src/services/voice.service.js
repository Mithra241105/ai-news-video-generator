import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import googleTTS from "google-tts-api";
import axios from "axios";
import { PATHS, TTS_VOICES, VIDEO_CONFIG } from "../config/newsConfig.js";

const execFileAsync = promisify(execFile);

/* =========================================================================
   VOICE SERVICE
   Synthesizes high-fidelity neural narration using Edge-TTS CLI with
   automatic subtitle (.vtt) generation and Google-TTS fallback.
========================================================================= */

/**
 * Measure audio duration precisely using ffprobe
 */
export const getAudioDuration = async (filePath) => {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    const duration = parseFloat(stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch (err) {
    console.error("[VoiceService] Failed to probe audio duration:", err.message);
    return null;
  }
};

/**
 * Generate a synchronized WebVTT subtitle track from script text and duration
 */
export const buildVttSubtitles = (text, totalDuration) => {
  if (!text || !totalDuration || totalDuration <= 0) return "";
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return "";

  const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
  let currentTime = 0;
  let vtt = "WEBVTT\n\n";

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    const ms = Math.floor((sec % 1) * 1000).toString().padStart(3, "0");
    return `00:${m}:${s}.${ms}`;
  };

  sentences.forEach((sentence, idx) => {
    const wordCount = sentence.split(/\s+/).length;
    const duration = (wordCount / Math.max(1, totalWords)) * totalDuration;
    const startTime = currentTime;
    const endTime = Math.min(totalDuration, currentTime + duration);
    currentTime = endTime;

    vtt += `${idx + 1}\n${formatTime(startTime)} --> ${formatTime(endTime)}\n${sentence}\n\n`;
  });

  return vtt;
};

/**
 * Synthesize voice narration
 * @param {string} text - The news script to narrate
 * @param {string} voice - Desired voice id (e.g. "en-US-GuyNeural")
 * @param {string} filePrefix - Optional filename prefix for unique jobs
 */
export const synthesizeNarration = async (text, voice = VIDEO_CONFIG.defaultVoice, filePrefix = "") => {
  if (!text || typeof text !== "string" || !text.trim()) {
    throw new Error("Cannot synthesize voice from empty text");
  }

  const cleanScript = text.trim();
  const timestamp = Date.now();
  const baseName = filePrefix ? `${filePrefix}_${timestamp}` : `voice_${timestamp}`;

  if (!fs.existsSync(PATHS.outputs)) {
    fs.mkdirSync(PATHS.outputs, { recursive: true });
  }
  if (!fs.existsSync(PATHS.temp)) {
    fs.mkdirSync(PATHS.temp, { recursive: true });
  }

  const scriptFilePath = path.join(PATHS.temp, `${baseName}.txt`);
  const audioFileName = `${baseName}.mp3`;
  const audioFilePath = path.join(PATHS.outputs, audioFileName);
  const subtitleFileName = `${baseName}.vtt`;
  const subtitleFilePath = path.join(PATHS.outputs, subtitleFileName);

  // Write script cleanly to temp file to avoid any shell interpolation or injection
  fs.writeFileSync(scriptFilePath, cleanScript, "utf-8");

  // Validate voice name against configured voices or fallback
  const validVoice = TTS_VOICES.some((v) => v.id === voice) ? voice : VIDEO_CONFIG.defaultVoice;

  try {
    console.log(`[VoiceService] Synthesizing audio via Edge-TTS (${validVoice})...`);
    await execFileAsync("edge-tts", [
      "-f", scriptFilePath,
      "-v", validVoice,
      "--write-media", audioFilePath,
      "--write-subtitles", subtitleFilePath
    ]);

    // Verify audio file creation and size
    if (fs.existsSync(audioFilePath) && fs.statSync(audioFilePath).size > 100) {
      const duration = (await getAudioDuration(audioFilePath)) || 5.0;

      // Clean up temp script file
      try { fs.unlinkSync(scriptFilePath); } catch (_) {}

      // If Edge-TTS did not generate subtitles, create aligned VTT
      if (!fs.existsSync(subtitleFilePath) || fs.statSync(subtitleFilePath).size === 0) {
        const vttContent = buildVttSubtitles(cleanScript, duration);
        fs.writeFileSync(subtitleFilePath, vttContent, "utf-8");
      }

      return {
        audioFile: audioFileName,
        audioPath: audioFilePath,
        audioUrl: `/media/${audioFileName}`,
        subtitleFile: fs.existsSync(subtitleFilePath) ? subtitleFileName : null,
        subtitlePath: fs.existsSync(subtitleFilePath) ? subtitleFilePath : null,
        duration,
        voice: validVoice,
        provider: "edge-tts"
      };
    }
    throw new Error("Edge-TTS completed but output file is missing or empty");
  } catch (edgeError) {
    console.warn("[VoiceService] Edge-TTS failed, falling back to Google-TTS:", edgeError.message);

    // Speech Fallback via Google-TTS
    try {
      const voiceLangCode = validVoice.split("-")[0] || "en";
      const urls = googleTTS.getAllAudioUrls(cleanScript, {
        lang: voiceLangCode,
        slow: false,
        host: "https://translate.google.com"
      });

      const audioBuffers = [];
      for (const item of urls) {
        const resp = await axios.get(item.url, { responseType: "arraybuffer", timeout: 10000 });
        audioBuffers.push(Buffer.from(resp.data));
      }

      const combinedAudio = Buffer.concat(audioBuffers);
      fs.writeFileSync(audioFilePath, combinedAudio);

      const duration = (await getAudioDuration(audioFilePath)) || 4.0;
      try { fs.unlinkSync(scriptFilePath); } catch (_) {}

      // Generate synchronized subtitles for fallback audio
      const vttContent = buildVttSubtitles(cleanScript, duration);
      fs.writeFileSync(subtitleFilePath, vttContent, "utf-8");

      return {
        audioFile: audioFileName,
        audioPath: audioFilePath,
        audioUrl: `/media/${audioFileName}`,
        subtitleFile: subtitleFileName,
        subtitlePath: subtitleFilePath,
        duration,
        voice: "Google-Default-EN",
        provider: "google-tts-api"
      };
    } catch (fallbackError) {
      try { fs.unlinkSync(scriptFilePath); } catch (_) {}
      console.error("[VoiceService] All speech synthesis providers failed:", {
        edgeError: edgeError.message,
        fallbackError: fallbackError.message
      });

      // Explicitly reject: Never substitute synthetic sine tones for intelligible speech
      throw new Error(
        `Speech synthesis failed: Neural TTS (${edgeError.message}) and backup speech engine (${fallbackError.message}) were both unavailable. Please verify network access and retry.`
      );
    }
  }
};

/**
 * Backward compatibility wrapper for older endpoints
 */
export const generateVoice = async (text) => {
  try {
    const result = await synthesizeNarration(text, "en-IN-NeerjaNeural", "legacy");
    // Also copy to news-voice.mp3 if needed for legacy paths
    const legacyPath = path.join(PATHS.outputs, "news-voice.mp3");
    try {
      fs.copyFileSync(result.audioPath, legacyPath);
    } catch (_) {}
    return result.audioFile;
  } catch (err) {
    console.error("[VoiceService] Legacy generateVoice error:", err.message);
    return null;
  }
};
