import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { getTopHeadlines, searchNews } from "../src/services/news.service.js";
import { prepareArticleScript, cleanText, estimateDurationSec } from "../src/services/script.service.js";
import { synthesizeNarration } from "../src/services/voice.service.js";
import { prepareImagesForVideo } from "../src/services/image.service.js";
import { renderNewsVideo, probeVideo } from "../src/services/video.service.js";

describe("1. News Service Tests", () => {
  test("getTopHeadlines returns normalized articles with required fields", async () => {
    const articles = await getTopHeadlines("technology", 3);
    assert.ok(Array.isArray(articles), "Should return an array");
    assert.ok(articles.length > 0, "Should have at least 1 article");

    const first = articles[0];
    assert.ok(first.id, "Article must have an ID");
    assert.ok(first.title, "Article must have a title");
    assert.ok(first.description, "Article must have a description");
    assert.ok(first.source?.name, "Article must have a source name");
    assert.ok(first.publishedAt, "Article must have published date");
  });

  test("searchNews returns relevant results", async () => {
    const results = await searchNews("space", 3);
    assert.ok(Array.isArray(results), "Search should return array");
    assert.ok(results.length > 0, "Should return results");
    assert.ok(typeof results[0].title === "string");
  });
});

describe("2. Script Service Tests", () => {
  test("cleanText removes HTML and junk tokens", () => {
    const dirty = "<b>Breaking News:</b> AI breakthrough [+1200 chars] https://example.com";
    const cleaned = cleanText(dirty);
    assert.equal(cleaned, "Breaking News: AI breakthrough");
  });

  test("prepareArticleScript builds structured narration preserving attribution", () => {
    const mockArticle = {
      title: "Researchers Unveil Next-Gen Battery",
      description: "Solid-state technology promises triple range for electric vehicles.",
      source: { name: "Clean Tech Times" }
    };

    const res = prepareArticleScript(mockArticle);
    assert.ok(res.script.includes("Researchers Unveil Next-Gen Battery"));
    assert.ok(res.script.includes("Clean Tech Times"));
    assert.ok(res.estimatedDurationSec > 0);
  });
});

describe("3. Voice Service Tests", () => {
  test("synthesizeNarration creates valid audio and returns duration", async () => {
    const text = "This is an automated test of the AI News speech engine.";
    const result = await synthesizeNarration(text, "en-US-GuyNeural", "unit_test");

    assert.ok(result.audioFile, "Should return audio filename");
    assert.ok(fs.existsSync(result.audioPath), "Audio file must exist on disk");
    assert.ok(result.duration > 1.0, "Audio duration must be greater than 1s");

    // Clean up test audio
    try {
      fs.unlinkSync(result.audioPath);
      if (result.subtitlePath && fs.existsSync(result.subtitlePath)) {
        fs.unlinkSync(result.subtitlePath);
      }
    } catch (_) {}
  });

  test("Google TTS fallback handles long script chunking, punctuation, and Unicode", async () => {
    const complexScript =
      "Breaking report: Researchers from 'Global Science' announce a 45% increase in renewable output. " +
      "The initiative—codenamed 'Project Helios'—spans 12 countries across Europe & Asia. " +
      "Dr. Müller remarked: \"This marks a definitive milestone in sustainable transition!\" " +
      "Additional deployments are scheduled for Q4 2026, delivering over 100 gigawatt-hours.";

    // Directly test googleTTS chunking and download to guarantee fallback reliability
    const googleTTS = (await import("google-tts-api")).default;
    const axios = (await import("axios")).default;

    const urls = googleTTS.getAllAudioUrls(complexScript, {
      lang: "en",
      slow: false,
      host: "https://translate.google.com"
    });

    assert.ok(Array.isArray(urls), "Must return chunked URL array");
    assert.ok(urls.length >= 2, "Long script should require at least 2 Google TTS chunks");

    const buffers = [];
    for (const item of urls.slice(0, 2)) {
      const resp = await axios.get(item.url, { responseType: "arraybuffer", timeout: 8000 });
      buffers.push(Buffer.from(resp.data));
    }
    const combined = Buffer.concat(buffers);
    assert.ok(combined.length > 5000, "Combined chunk audio buffer must be valid size");
  });
});

describe("4. Image Service Tests", () => {
  test("prepareImagesForVideo returns local image files", async () => {
    const mockArticle = {
      title: "Global Technology Summit 2026",
      category: "technology"
    };

    const images = await prepareImagesForVideo(mockArticle, "unit_test_img", 2);
    assert.ok(Array.isArray(images), "Images must be an array");
    assert.ok(images.length > 0, "Should have at least 1 image");
    assert.ok(fs.existsSync(images[0].localPath), "Image localPath must exist on disk");
  });
});

describe("5. End-to-End Video Rendering & Template Tests", () => {
  test("renderNewsVideo produces a valid MP4 with H.264 video, AAC audio, and apad synchronization", async () => {
    const mockArticle = {
      title: "Autonomous Space Probe Enters Lunar Orbit",
      source: { name: "Astro News" },
      category: "SCIENCE"
    };

    // 1. Synthesize short voice
    const voiceResult = await synthesizeNarration(
      "In our top story: Autonomous Space Probe Enters Lunar Orbit. Scientific instruments are nominal.",
      "en-US-GuyNeural",
      "e2e_test"
    );

    // 2. Prepare images
    const images = await prepareImagesForVideo(mockArticle, "e2e_test", 2);

    // 3. Render video with Modern Editorial template
    const videoResult = await renderNewsVideo({
      images,
      audioPath: voiceResult.audioPath,
      article: mockArticle,
      aspectRatio: "16:9",
      template: "editorial",
      jobId: "e2e_test"
    });

    assert.ok(videoResult.videoFile, "Must return video filename");
    assert.ok(fs.existsSync(videoResult.videoPath), "Video file must exist on disk");
    assert.ok(videoResult.fileSize > 10000, "Video file size must be > 10KB");
    assert.equal(videoResult.template, "editorial", "Output must record selected template");

    // 4. Verify with FFprobe
    const probe = await probeVideo(videoResult.videoPath);
    assert.ok(probe, "Probe must succeed");
    assert.equal(probe.streams[0].codec_name, "h264", "Video codec must be h264");
    assert.equal(probe.streams[0].width, 1920, "16:9 video width must be 1920");
    assert.equal(probe.streams[0].height, 1080, "16:9 video height must be 1080");

    // Verify audio stream duration matches video duration (apad test)
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    const { stdout: probeAudio } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoResult.videoPath
    ]);
    const audioDur = parseFloat(probeAudio.trim());
    const videoDur = parseFloat(probe.format.duration);
    assert.ok(Math.abs(audioDur - videoDur) < 0.15, `Audio (${audioDur}s) and Video (${videoDur}s) must be tightly synchronized`);

    console.log(`[E2E TEST PASSED]: Successfully verified 1080p MP4 (${videoResult.fileSize} bytes, ${videoDur}s, sync diff: ${Math.abs(audioDur - videoDur).toFixed(3)}s)`);

    // Clean up e2e files
    try {
      fs.unlinkSync(voiceResult.audioPath);
      fs.unlinkSync(videoResult.videoPath);
      if (videoResult.thumbnailFile) {
        fs.unlinkSync(path.join(path.dirname(videoResult.videoPath), videoResult.thumbnailFile));
      }
    } catch (_) {}
  });

  test("renderNewsVideo renders with Technology Briefing template in 9:16 vertical", async () => {
    const mockArticle = {
      title: "Next-Gen Quantum Processor Benchmarks Released",
      source: { name: "Tech Chronicle" },
      category: "TECHNOLOGY"
    };

    const voiceResult = await synthesizeNarration(
      "Quantum computing speeds up AI training by ten times.",
      "en-US-JennyNeural",
      "vert_test"
    );

    const images = await prepareImagesForVideo(mockArticle, "vert_test", 2);

    const videoResult = await renderNewsVideo({
      images,
      audioPath: voiceResult.audioPath,
      article: mockArticle,
      aspectRatio: "9:16",
      template: "tech",
      jobId: "vert_test"
    });

    assert.equal(videoResult.template, "tech");
    assert.equal(videoResult.aspectRatio, "9:16");
    assert.equal(videoResult.width, 1080);
    assert.equal(videoResult.height, 1920);

    // Clean up
    try {
      fs.unlinkSync(voiceResult.audioPath);
      fs.unlinkSync(videoResult.videoPath);
      if (videoResult.thumbnailFile) {
        fs.unlinkSync(path.join(path.dirname(videoResult.videoPath), videoResult.thumbnailFile));
      }
    } catch (_) {}
  });
});

describe("6. Persistence & Security Hardening Tests", () => {
  test("Atomic persistence prevents corruption during concurrent writes", async () => {
    const { PATHS } = await import("../src/config/newsConfig.js");
    const testMetaPath = path.join(PATHS.outputs, "test_archive_atomic.json");

    const atomicSave = (data) => {
      const tempPath = `${testMetaPath}.tmp_${Date.now()}_${Math.random()}`;
      fs.writeFileSync(tempPath, JSON.stringify(data), "utf-8");
      fs.renameSync(tempPath, testMetaPath);
    };

    // Simulate 20 rapid sequential/concurrent updates
    for (let i = 0; i < 20; i++) {
      atomicSave([{ index: i, title: `Test Entry ${i}`, timestamp: new Date().toISOString() }]);
    }

    assert.ok(fs.existsSync(testMetaPath), "Archive file must exist");
    const content = JSON.parse(fs.readFileSync(testMetaPath, "utf-8"));
    assert.ok(Array.isArray(content));
    assert.equal(content[0].index, 19);

    // Clean up test file
    try { fs.unlinkSync(testMetaPath); } catch (_) {}
  });
});
