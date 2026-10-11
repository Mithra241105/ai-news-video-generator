import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import app from "../src/app.js";

let server;
const TEST_PORT = 5099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

describe("API Route Integration Tests", () => {
  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(TEST_PORT, () => {
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  });

  test("GET /api/health returns operational status", async () => {
    const res = await axios.get(`${BASE_URL}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.status, "operational");
    assert.ok(res.data.capabilities.ffmpeg);
    assert.ok(res.data.capabilities.edgeTTS);
  });

  test("GET /api/news/categories returns category list", async () => {
    const res = await axios.get(`${BASE_URL}/api/news/categories`);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.categories));
    assert.ok(res.data.categories.some((c) => c.id === "technology"));
  });

  test("GET /api/news/voices returns available neural voices", async () => {
    const res = await axios.get(`${BASE_URL}/api/news/voices`);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.voices));
    assert.ok(res.data.voices.length >= 10);
  });

  test("GET /api/news/templates returns 5 video templates", async () => {
    const res = await axios.get(`${BASE_URL}/api/news/templates`);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.templates));
    assert.equal(res.data.templates.length, 5);
    const ids = res.data.templates.map((t) => t.id);
    assert.ok(ids.includes("breaking"));
    assert.ok(ids.includes("editorial"));
    assert.ok(ids.includes("documentary"));
    assert.ok(ids.includes("tech"));
    assert.ok(ids.includes("shorts"));
  });

  test("GET /api/news/languages returns supported languages", async () => {
    const res = await axios.get(`${BASE_URL}/api/news/languages`);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.languages));
    assert.ok(res.data.languages.some((l) => l.code === "hi"));
  });

  test("GET /api/news returns news feed", async () => {
    const res = await axios.get(`${BASE_URL}/api/news?category=technology`);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.articles));
  });

  test("POST /api/news/script returns generated anchor script", async () => {
    const res = await axios.post(`${BASE_URL}/api/news/script`, {
      article: {
        title: "Global AI Summit Concludes",
        description: "New international safety standards signed by 40 countries.",
        source: { name: "Reuters" }
      }
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.script.includes("Global AI Summit Concludes"));
    assert.ok(res.data.wordCount > 0);
  });

  test("GET /api/news/history returns video archives", async () => {
    const res = await axios.get(`${BASE_URL}/api/news/history`);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.videos));
  });
});
