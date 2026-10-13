import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import schedulerService from "../src/services/scheduler.service.js";
import app from "../src/app.js";

const TEST_PORT = 5098;
const BASE_URL = `http://localhost:${TEST_PORT}`;
let server;

describe("7. Daily News Video Scheduler Service Tests", () => {
  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(TEST_PORT, () => resolve());
    });
  });

  after(async () => {
    schedulerService.stopScheduler();
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
  });

  test("getSchedulerStatus returns valid state object", () => {
    const status = schedulerService.getSchedulerStatus();
    assert.ok(typeof status.enabled === "boolean");
    assert.ok(typeof status.intervalHours === "number");
    assert.ok(["IDLE", "RUNNING", "SUCCESS", "FAILED"].includes(status.lastStatus));
    assert.ok(Array.isArray(status.auditHistory));
  });

  test("Deduplication tracking prevents repeat stories", () => {
    const testStory = {
      title: "Unique Test Story Headline For Deduplication Test",
      url: "https://example.com/unique-test-story"
    };

    const initialSeen = schedulerService.getSeenStories();
    schedulerService.markStoryAsSeen(testStory);
    const updatedSeen = schedulerService.getSeenStories();

    assert.ok(updatedSeen.has("unique test story headline for deduplication test"));
  });

  test("GET /api/news/scheduler/status returns HTTP 200 with status data", async () => {
    const res = await axios.get(`${BASE_URL}/api/news/scheduler/status`);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.intervalHours >= 1);
  });

  test("POST /api/news/scheduler/configure dynamically updates scheduler", async () => {
    const res = await axios.post(`${BASE_URL}/api/news/scheduler/configure`, {
      intervalHours: 12,
      preferredCategory: "technology"
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.intervalHours, 12);
    assert.equal(res.data.preferredCategory, "technology");
  });

  test("Automated dispatch execution runs and logs audit record", async () => {
    const res = await axios.post(`${BASE_URL}/api/news/scheduler/trigger`, {
      category: "technology"
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);

    // Verify status updated
    const statusRes = await axios.get(`${BASE_URL}/api/news/scheduler/status`);
    assert.equal(statusRes.status, 200);
    assert.ok(statusRes.data.totalRuns >= 1);
    assert.ok(statusRes.data.auditHistory.length >= 1);
  });
});
