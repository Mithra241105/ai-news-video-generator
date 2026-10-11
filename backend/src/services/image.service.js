import fs from "fs";
import path from "path";
import axios from "axios";
import { PATHS } from "../config/newsConfig.js";

/* =========================================================================
   IMAGE SERVICE
   Retrieves, validates, downloads, and caches visual assets safely.
   Supports article images, Unsplash editorial photos, Pixabay stock,
   and local high-resolution fallback visuals with SSRF protections.
========================================================================= */

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

/**
 * Validate URL to mitigate SSRF vulnerabilities
 */
const isSafePublicUrl = (urlString) => {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    const hostname = parsed.hostname.toLowerCase();
    // Block loopback, RFC1918 private IPs, link-local, and AWS/cloud metadata
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "169.254.169.254" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Safely download a remote image to local disk
 */
export const downloadImageSafely = async (url, targetPath) => {
  if (!isSafePublicUrl(url)) {
    throw new Error(`Unsafe or invalid image URL: ${url}`);
  }

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 8000,
    maxContentLength: 15 * 1024 * 1024, // 15MB limit
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AINewsVideoGenerator/1.0"
    }
  });

  const contentType = (response.headers["content-type"] || "").toLowerCase();
  const validMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"];

  if (!validMimes.some((mime) => contentType.includes(mime))) {
    // If header doesn't explicitly match, check file extension or buffer magic numbers
    const isJpeg = response.data[0] === 0xff && response.data[1] === 0xd8;
    const isPng = response.data[0] === 0x89 && response.data[1] === 0x50;
    const isWebp = response.data.slice(8, 12).toString("ascii") === "WEBP";

    if (!isJpeg && !isPng && !isWebp) {
      throw new Error(`Unsupported image MIME type: ${contentType}`);
    }
  }

  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(targetPath, Buffer.from(response.data));
  return targetPath;
};

/**
 * Get verified local fallback images
 */
export const getLocalFallbackImages = () => {
  if (!fs.existsSync(PATHS.fallback)) {
    fs.mkdirSync(PATHS.fallback, { recursive: true });
  }

  const files = fs.readdirSync(PATHS.fallback).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if (files.length === 0) return [];

  return files.map((file) => ({
    localPath: path.join(PATHS.fallback, file),
    url: `/media/fallback/${file}`,
    credit: "Local Archive"
  }));
};

/**
 * Fetch candidate images from Pixabay
 */
const fetchPixabayCandidates = async (query, count = 3) => {
  if (!PIXABAY_API_KEY) return [];
  try {
    const url = `https://pixabay.com/api/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(
      query
    )}&image_type=photo&per_page=5&safesearch=true`;

    const response = await axios.get(url, { timeout: 6000 });
    const hits = response.data?.hits || [];

    return hits.slice(0, count).map((item) => ({
      url: item.largeImageURL || item.webformatURL,
      credit: `Pixabay: @${item.user || "creator"}`
    }));
  } catch (err) {
    console.warn("[ImageService] Pixabay fetch failed:", err.message);
    return [];
  }
};

/**
 * Fetch candidate images from Unsplash
 */
const fetchUnsplashCandidates = async (query, count = 3) => {
  if (!UNSPLASH_ACCESS_KEY) return [];
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      query
    )}&per_page=${count}&orientation=landscape`;

    const response = await axios.get(url, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
      timeout: 6000
    });

    const results = response.data?.results || [];
    return results.map((item) => ({
      url: item.urls?.regular || item.urls?.small,
      credit: `Unsplash: @${item.user?.username || "photographer"}`
    }));
  } catch (err) {
    console.warn("[ImageService] Unsplash fetch failed:", err.message);
    return [];
  }
};

/**
 * Extract smart topical search queries from article metadata
 */
export const extractTopicalKeywords = (article = {}) => {
  const noiseWords = new Set([
    "the", "a", "an", "in", "on", "at", "for", "to", "of", "and", "or", "is",
    "are", "was", "were", "with", "by", "its", "it", "this", "that", "from", "as",
    "new", "says", "said", "say", "takes", "took", "swipe", "over", "after",
    "before", "could", "would", "will", "fresh", "average", "benefit", "greatly",
    "first", "last", "more", "most", "about", "into", "than", "been", "have", "has",
    "had", "how", "why", "what", "when", "where", "who", "which", "their", "there",
    "here", "just", "now", "also", "some", "any", "top", "reports", "reported",
    "according", "breaking", "update", "exclusive", "watch", "live", "video", "wire"
  ]);

  const title = article.title || "";
  const words = title.split(/\s+/);
  const properNouns = [];

  for (const w of words) {
    const clean = w.replace(/[^\w]/g, "");
    if (clean.length > 2 && /^[A-Z][a-z]+$/.test(clean) && !noiseWords.has(clean.toLowerCase())) {
      properNouns.push(clean);
    }
  }

  const titleTokens = title
    .replace(/[^\w\s]/gi, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !noiseWords.has(w.toLowerCase()));

  const queries = [];

  // 1. Prominent proper nouns / named entities (e.g., "Starlink Musk", "Apple AI")
  if (properNouns.length >= 2) {
    queries.push(properNouns.slice(0, 2).join(" "));
  } else if (properNouns.length === 1) {
    queries.push(properNouns[0]);
  }

  // 2. Topical keyword bigram from title
  if (titleTokens.length >= 2) {
    queries.push(titleTokens.slice(0, 2).join(" "));
  } else if (titleTokens.length === 1) {
    queries.push(titleTokens[0]);
  }

  // 3. Category combined with primary subject or standalone category
  if (article.category) {
    if (titleTokens.length > 0) {
      queries.push(`${titleTokens[0]} ${article.category}`);
    }
    queries.push(article.category);
  }

  return [...new Set(queries.filter(Boolean))];
};

/**
 * Collect, download, and prepare local images for video generation
 * @param {Object} article - The news article
 * @param {string} jobId - Unique identifier for the job
 * @param {number} desiredCount - Desired number of visual slides (2 to 4)
 */
export const prepareImagesForVideo = async (article, jobId = Date.now().toString(), desiredCount = 3) => {
  const jobTempDir = path.join(PATHS.temp, `job_${jobId}`);
  if (!fs.existsSync(jobTempDir)) {
    fs.mkdirSync(jobTempDir, { recursive: true });
  }

  const collected = [];
  const candidates = [];
  const seenUrls = new Set();

  // 1. If article has an image, prioritize it as the lead visual
  if (article?.image && isSafePublicUrl(article.image)) {
    candidates.push({
      url: article.image,
      credit: article.source?.name || "Article Source"
    });
    seenUrls.add(article.image);
  }

  // 2. Generate multi-tier contextual queries
  const searchQueries = extractTopicalKeywords(article);

  for (const query of searchQueries) {
    if (candidates.length >= desiredCount + 2) break;

    const unsplashItems = await fetchUnsplashCandidates(query, 2);
    for (const item of unsplashItems) {
      if (!seenUrls.has(item.url)) {
        candidates.push(item);
        seenUrls.add(item.url);
      }
    }

    if (candidates.length < desiredCount + 2) {
      const pixabayItems = await fetchPixabayCandidates(query, 3);
      for (const item of pixabayItems) {
        if (!seenUrls.has(item.url)) {
          candidates.push(item);
          seenUrls.add(item.url);
        }
      }
    }
  }

  // 3. Download candidates safely to local job directory with format & size validation
  let index = 1;
  for (const item of candidates) {
    if (collected.length >= desiredCount) break;
    try {
      const parsedUrl = new URL(item.url);
      const ext = path.extname(parsedUrl.pathname) || ".jpg";
      const cleanExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext.toLowerCase()) ? ext : ".jpg";
      const destPath = path.join(jobTempDir, `slide_${index}${cleanExt}`);

      await downloadImageSafely(item.url, destPath);
      if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1500) {
        collected.push({
          localPath: destPath,
          url: item.url,
          credit: item.credit
        });
        index++;
      }
    } catch (downloadErr) {
      console.warn(`[ImageService] Could not download image (${item.url}):`, downloadErr.message);
    }
  }

  // 4. Fill remaining slots with distinct local editorial fallbacks (never duplicate assets)
  if (collected.length < desiredCount) {
    const fallbacks = getLocalFallbackImages();
    const usedFallbackPaths = new Set(collected.map((c) => path.basename(c.localPath)));

    for (const fb of fallbacks) {
      if (collected.length >= desiredCount) break;
      const baseName = path.basename(fb.localPath);
      if (usedFallbackPaths.has(baseName)) continue;

      const ext = path.extname(fb.localPath) || ".jpg";
      const destPath = path.join(jobTempDir, `fallback_${index}${ext}`);
      try {
        fs.copyFileSync(fb.localPath, destPath);
        collected.push({
          localPath: destPath,
          url: fb.url,
          credit: fb.credit
        });
        usedFallbackPaths.add(baseName);
        index++;
      } catch (_) {}
    }
  }

  // Guarantee at least 1 image
  if (collected.length === 0) {
    const fallbacks = getLocalFallbackImages();
    if (fallbacks.length > 0) {
      collected.push(fallbacks[0]);
    }
  }

  return collected;
};

/**
 * Backward-compatible helper method
 */
export const getImages = async (topic) => {
  const dummyArticle = { title: topic, category: topic };
  const images = await prepareImagesForVideo(dummyArticle, "legacy", 3);

  // Write images.txt for backward compatibility
  const IMAGES_TXT = path.join(PATHS.outputs, "images.txt");
  if (!fs.existsSync(PATHS.outputs)) fs.mkdirSync(PATHS.outputs, { recursive: true });

  const concatLines = images.map((img) => `file '${img.localPath.replace(/\\/g, "/")}'\nduration 4`).join("\n");
  fs.writeFileSync(IMAGES_TXT, concatLines);

  return images.map((img) => ({
    url: img.url,
    credit: img.credit,
    localPath: img.localPath
  }));
};
