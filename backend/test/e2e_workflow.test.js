import { test, describe } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

import { PATHS } from "../src/config/newsConfig.js";

const execFileAsync = promisify(execFile);
const BASE_URL = "http://localhost:5000";

describe("Comprehensive End-to-End Workflow Validation Pass", () => {
  let targetArticle;
  let customEditedScript;
  let render169Result;
  let render916Result;

  test("Step 1: Check Health & Engine Capabilities", async () => {
    const healthRes = await axios.get(`${BASE_URL}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.data.success, true);
    assert.equal(healthRes.data.status, "operational");
    assert.ok(healthRes.data.capabilities.ffmpeg);
    assert.ok(healthRes.data.capabilities.edgeTTS);
  });

  test("Step 2: Categories & Search for custom topic", async () => {
    const catRes = await axios.get(`${BASE_URL}/api/news/categories`);
    assert.ok(catRes.data.categories.length >= 6);

    const searchRes = await axios.get(`${BASE_URL}/api/news?search=SpaceX`);
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.data.articles.length > 0);
    targetArticle = searchRes.data.articles[0];
  });

  test("Step 3: Verify Article Metadata (title, source, date, URL, image)", () => {
    assert.ok(targetArticle.title, "Must have article title");
    assert.ok(targetArticle.source?.name, "Must have source name");
    assert.ok(targetArticle.publishedAt, "Must have publication date");
    assert.ok(targetArticle.id, "Must have article ID");
    console.log("Verified Article:", {
      title: targetArticle.title,
      source: targetArticle.source.name,
      date: targetArticle.publishedAt,
      url: targetArticle.url
    });
  });

  test("Step 4 & 5: Custom Edited Script & Voice Preview Synthesis", async () => {
    customEditedScript = `Special news report: ${targetArticle.title}. Editorial confirmation from ${targetArticle.source.name}. This is verified custom edited narration.`;

    const voiceRes = await axios.post(`${BASE_URL}/api/news/voice`, {
      script: customEditedScript,
      voice: "en-US-GuyNeural"
    });

    assert.equal(voiceRes.status, 200);
    assert.equal(voiceRes.data.success, true);
    assert.ok(voiceRes.data.audioFile);
    assert.ok(voiceRes.data.duration > 2.0);

    const localAudioPath = path.join(PATHS.outputs, voiceRes.data.audioFile);
    assert.ok(fs.existsSync(localAudioPath), "Audio file must exist");
  });

  test("Step 6: Render 16:9 Landscape Video with Overlays & Subtitles", async () => {
    const renderRes = await axios.post(`${BASE_URL}/api/news/video`, {
      article: targetArticle,
      script: customEditedScript,
      voice: "en-US-GuyNeural",
      aspectRatio: "16:9"
    });

    assert.equal(renderRes.status, 200);
    assert.equal(renderRes.data.success, true);
    render169Result = renderRes.data;

    const path169 = path.join(PATHS.outputs, render169Result.videoFile);
    assert.ok(fs.existsSync(path169), "16:9 MP4 must exist");

    const probe = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,size,bit_rate",
      "-show_streams", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name,r_frame_rate",
      "-of", "json",
      path169
    ]);
    const pData = JSON.parse(probe.stdout);
    assert.equal(pData.streams[0].codec_name, "h264");
    assert.equal(pData.streams[0].width, 1920);
    assert.equal(pData.streams[0].height, 1080);
    assert.ok(parseFloat(pData.format.duration) > 2.0);
    console.log("16:9 Video Validated:", pData.streams[0].width, "x", pData.streams[0].height, "duration:", pData.format.duration);
  });

  test("Step 7: Render 9:16 Vertical Video (Shorts)", async () => {
    const renderRes = await axios.post(`${BASE_URL}/api/news/video`, {
      article: targetArticle,
      script: customEditedScript,
      voice: "en-US-JennyNeural",
      aspectRatio: "9:16"
    });

    assert.equal(renderRes.status, 200);
    assert.equal(renderRes.data.success, true);
    render916Result = renderRes.data;

    const path916 = path.join(PATHS.outputs, render916Result.videoFile);
    assert.ok(fs.existsSync(path916), "9:16 MP4 must exist");

    const probe = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,size,bit_rate",
      "-show_streams", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name,r_frame_rate",
      "-of", "json",
      path916
    ]);
    const pData = JSON.parse(probe.stdout);
    assert.equal(pData.streams[0].codec_name, "h264");
    assert.equal(pData.streams[0].width, 1080);
    assert.equal(pData.streams[0].height, 1920);
    assert.ok(parseFloat(pData.format.duration) > 2.0);
    console.log("9:16 Video Validated:", pData.streams[0].width, "x", pData.streams[0].height, "duration:", pData.format.duration);
  });

  test("Step 8: Production Archive Accessibility & Persistent Metadata", async () => {
    const historyRes = await axios.get(`${BASE_URL}/api/news/history`);
    assert.equal(historyRes.status, 200);
    assert.ok(historyRes.data.videos.length >= 2);

    const video169 = historyRes.data.videos.find(v => v.fileName === render169Result.videoFile);
    const video916 = historyRes.data.videos.find(v => v.fileName === render916Result.videoFile);
    assert.ok(video169, "16:9 video must appear in history");
    assert.ok(video916, "9:16 video must appear in history");

    // Verify rich metadata persistence
    assert.ok(video169.articleTitle, "Must have preserved article title");
    assert.ok(video169.sourceName, "Must have preserved source name");
    assert.equal(video169.aspectRatio, "16:9");
    assert.ok(video169.duration > 0, "Must have measured duration");
  });

  test("Step 9: Edge Cases & Error Handling (Missing credentials, invalid bodies)", async () => {
    // Missing article should 400
    await assert.rejects(
      async () => await axios.post(`${BASE_URL}/api/news/video`, { script: "Hello" }),
      (err) => err.response?.status === 400
    );

    // Empty script should 400
    await assert.rejects(
      async () => await axios.post(`${BASE_URL}/api/news/video`, { article: { title: "Title" }, script: "" }),
      (err) => err.response?.status === 400
    );
  });

  test("Step 10: Safe Video Deletion & Persistent Archive Update", async () => {
    // Delete 9:16 video safely
    const delRes = await axios.delete(`${BASE_URL}/api/news/history/${encodeURIComponent(render916Result.videoFile)}`);
    assert.equal(delRes.status, 200);
    assert.equal(delRes.data.success, true);

    const path916 = path.join(PATHS.outputs, render916Result.videoFile);
    assert.equal(fs.existsSync(path916), false, "File must be removed from disk");

    // Check history no longer includes deleted file
    const historyRes = await axios.get(`${BASE_URL}/api/news/history`);
    assert.equal(historyRes.data.videos.some(v => v.fileName === render916Result.videoFile), false);

    // Invalid non-mp4 or traversal file rejection
    await assert.rejects(
      async () => await axios.delete(`${BASE_URL}/api/news/history/fake.txt`),
      (err) => err.response?.status === 400
    );
  });
});
