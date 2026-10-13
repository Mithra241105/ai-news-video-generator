import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { PATHS, VIDEO_CONFIG, VIDEO_TEMPLATES, getVideoDimensions } from "../config/newsConfig.js";
import { getAudioDuration } from "./voice.service.js";

const execFileAsync = promisify(execFile);

/* =========================================================================
   VIDEO SERVICE
   High-performance FFmpeg video renderer supporting 16:9 and 9:16 formats,
   multi-slide image sequencing, blurred ambient backdrops, lower-third
   headline cards, source attribution badges, and subtitle integration.
========================================================================= */

/**
 * Word wrap text into lines of max characters
 */
const wordWrap = (str, maxChars = 40) => {
  if (!str) return "";
  const words = str.split(/\s+/);
  const lines = [];
  let current = "";

  for (const w of words) {
    if ((current + " " + w).trim().length <= maxChars) {
      current = (current + " " + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3).join("\n"); // Cap at 3 lines
};

/**
 * Escape file path for FFmpeg filter arguments (especially Windows paths)
 */
const escapeFilterPath = (p) => {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
};

/**
 * Locate best available font on the host system
 */
const getSystemFontPath = () => {
  const candidates = [
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/calibri.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc"
  ];

  for (const font of candidates) {
    if (fs.existsSync(font)) {
      return escapeFilterPath(font);
    }
  }
  return null;
};

/**
 * Probe video stream properties
 */
export const probeVideo = async (filePath) => {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,size,bit_rate",
      "-show_streams",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name",
      "-of", "json",
      filePath
    ]);
    return JSON.parse(stdout);
  } catch (err) {
    console.error("[VideoService] Failed to probe video:", err.message);
    return null;
  }
};

/**
 * Main Video Renderer
 */
export const renderNewsVideo = async ({
  images = [],
  audioPath,
  article = {},
  aspectRatio = "16:9",
  template = "breaking",
  subtitlePath = null,
  jobId = Date.now().toString()
}) => {
  if (!audioPath || !fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found at: ${audioPath}`);
  }

  // Ensure directories exist
  if (!fs.existsSync(PATHS.outputs)) fs.mkdirSync(PATHS.outputs, { recursive: true });
  if (!fs.existsSync(PATHS.temp)) fs.mkdirSync(PATHS.temp, { recursive: true });

  const jobTempDir = path.join(PATHS.temp, `job_${jobId}`);
  if (!fs.existsSync(jobTempDir)) fs.mkdirSync(jobTempDir, { recursive: true });

  // 1. Determine Dimensions and Formats
  const dimensions = getVideoDimensions(aspectRatio);
  const width = dimensions.width;
  const height = dimensions.height;
  const isVertical = aspectRatio === "9:16";

  // 2. Measure Audio Duration
  const rawAudioDuration = (await getAudioDuration(audioPath)) || 5.0;
  // Add a slight outro buffer (0.6s) for closing credit
  const totalDuration = parseFloat((rawAudioDuration + 0.6).toFixed(2));

  // 3. Prepare Image Inputs (guarantee at least 1 verified local image)
  let validImages = (images || [])
    .map((img) => (typeof img === "string" ? { localPath: img } : img))
    .filter((img) => img.localPath && fs.existsSync(img.localPath));

  if (validImages.length === 0) {
    // Fallback to local asset
    const fallbackFile = path.join(PATHS.fallback, "img2.png");
    validImages = [{ localPath: fallbackFile, credit: "Archive Footage" }];
  }

  // Cap images to max 4
  validImages = validImages.slice(0, 4);
  const slideCount = validImages.length;
  const slideDuration = parseFloat((totalDuration / slideCount).toFixed(2));

  // 4. Create Safe Text Files for FFmpeg drawtext filter
  const headlineWrapped = wordWrap(
    article.title || "AI News Video Report",
    isVertical ? 24 : 44
  );
  const headlineFilePath = path.join(jobTempDir, "headline.txt");
  fs.writeFileSync(headlineFilePath, headlineWrapped, "utf-8");

  const sourceName = (article.source?.name || "Global News Wire").toUpperCase();
  const sourceText = `SOURCE: ${sourceName} • ${new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  })}`;
  const sourceFilePath = path.join(jobTempDir, "source.txt");
  fs.writeFileSync(sourceFilePath, sourceText, "utf-8");

  const outroText = `AI NEWS WIRE • VERIFIED REPORT\nSOURCE: ${sourceName}\nTHANKS FOR WATCHING`;
  const outroFilePath = path.join(jobTempDir, "outro.txt");
  fs.writeFileSync(outroFilePath, outroText, "utf-8");

  // 5. Construct FFmpeg Filter Graph
  const fontPath = getSystemFontPath();
  const fontArg = fontPath ? `:fontfile='${fontPath}'` : "";

  const tmpl = VIDEO_TEMPLATES[template] || VIDEO_TEMPLATES.breaking;
  const categoryLabel = (tmpl.badgeText || (article.category || "TOP NEWS")).toUpperCase();
  const badgeBoxColor = tmpl.badgeColor || "0xDC2626@0.95";
  const lowerThirdBg = tmpl.lowerThirdBg || "0x0B0F19@0.92";
  const lowerThirdText = tmpl.lowerThirdText || "white";
  const sourceColor = tmpl.sourceColor || "0xE2E8F0";
  const outroBg = tmpl.outroBg || "0x020617@0.95";

  const filterChains = [];
  const slideLabels = [];

  // Pan dimensions for subtle cinematic camera motion
  const panWidth = Math.round(width * 1.06);
  const panHeight = Math.round(height * 1.06);

  // Slide visual composition with gentle motion and smooth cross-slide transitions
  for (let i = 0; i < slideCount; i++) {
    const bgScale = `${width}:${height}`;
    const panX = (i % 2 === 0)
      ? `(in_w-${width})*(t/${slideDuration})`
      : `(in_w-${width})*(1-t/${slideDuration})`;

    filterChains.push(
      `[${i}:v]scale=${bgScale},boxblur=24:4,eq=brightness=-0.26,setsar=1,fps=30[bg_${i}]`,
      `[${i}:v]scale=${panWidth}:${panHeight}:force_original_aspect_ratio=increase,crop=${width}:${height}:x='${panX}':y='(in_h-${height})/2',setsar=1,fps=30[fg_pan_${i}]`,
      `[bg_${i}][fg_pan_${i}]overlay=0:0:shortest=1,fade=t=in:st=0:d=0.35,setsar=1,fps=30[slide_${i}]`
    );
    slideLabels.push(`[slide_${i}]`);
  }

  // Concat all slides
  if (slideCount > 1) {
    filterChains.push(
      `${slideLabels.join("")}concat=n=${slideCount}:v=1:a=0[v_concat]`
    );
  } else {
    filterChains.push(`[slide_0]null[v_concat]`);
  }

  // Text Overlay Typography Sizing & Safe Margin Positioning
  const topBadgeSize = isVertical ? 32 : 26;
  const headlineSize = isVertical ? 44 : 38;
  const sourceSize = isVertical ? 22 : 20;
  const outroSize = isVertical ? 36 : 32;

  const topBadgeY = isVertical ? 160 : 55;
  const headlineY = isVertical ? "h-th-420" : "h-th-170";
  const sourceY = isVertical ? "h-th-330" : "h-th-95";

  const headlineFileEscaped = escapeFilterPath(headlineFilePath);
  const sourceFileEscaped = escapeFilterPath(sourceFilePath);
  const outroFileEscaped = escapeFilterPath(outroFilePath);

  let streamAfterConcat = "v_concat";

  // Readable subtitles with contrast background box and safe vertical clearance
  if (subtitlePath && fs.existsSync(subtitlePath)) {
    const escapedSub = escapeFilterPath(subtitlePath);
    const subMargin = isVertical ? 520 : 210;
    const subFontSize = isVertical ? 30 : 24;
    const subBg = tmpl.subBgColor || "&H99000000";
    const subTextColor = tmpl.subTextColor || "&H00FFFFFF";
    const subStyle = `Alignment=2,MarginV=${subMargin},FontSize=${subFontSize},PrimaryColour=${subTextColor},BackColour=${subBg},BorderStyle=3,Outline=1,Shadow=0,Bold=1`;
    filterChains.push(
      `[v_concat]subtitles=filename='${escapedSub}':force_style='${subStyle}'[v_sub]`
    );
    streamAfterConcat = "v_sub";
  }

  // Editorial graphic overlays & closing source attribution card
  filterChains.push(
    // 1. Category / Breaking Badge (Top Left)
    `[${streamAfterConcat}]drawtext=${fontArg}:text='${categoryLabel}'` +
      `:fontsize=${topBadgeSize}:fontcolor=white:box=1:boxcolor=${badgeBoxColor}:boxborderw=10:x=60:y=${topBadgeY}[v_t1]`,

    // 2. Headline Lower-Third Banner
    `[v_t1]drawtext=${fontArg}:textfile='${headlineFileEscaped}'` +
      `:fontsize=${headlineSize}:fontcolor=${lowerThirdText}:box=1:boxcolor=${lowerThirdBg}:boxborderw=22:line_spacing=12:x=60:y=${headlineY}[v_t2]`,

    // 3. Source Attribution & Date
    `[v_t2]drawtext=${fontArg}:textfile='${sourceFileEscaped}'` +
      `:fontsize=${sourceSize}:fontcolor=${sourceColor}:box=1:boxcolor=0x020617@0.85:boxborderw=10:x=60:y=${sourceY}[v_t3]`,

    // 4. Professional Closing Source-Credit Screen (Active during final 2.0s)
    `[v_t3]drawtext=${fontArg}:textfile='${outroFileEscaped}'` +
      `:fontsize=${outroSize}:fontcolor=white:box=1:boxcolor=${outroBg}:boxborderw=24:line_spacing=14:x=(w-text_w)/2:y=(h-text_h)/2` +
      `:enable='between(t,${Math.max(0, totalDuration - 2.0)},${totalDuration})'[v_final]`
  );

  // Audio stream padding and soft outro fade for perfect sub-millisecond A/V sync
  const audioInputIndex = slideCount;
  filterChains.push(
    `[${audioInputIndex}:a]apad=whole_dur=${totalDuration},afade=t=out:st=${Math.max(0, totalDuration - 0.2)}:d=0.2[a_final]`
  );

  const filterGraph = filterChains.join(";");

  // Output filename
  const outputFileName = `news_video_${jobId}.mp4`;
  const outputFilePath = path.join(PATHS.outputs, outputFileName);

  // Build FFmpeg command arguments
  const ffmpegArgs = ["-y"];

  // Inputs: Each image loop
  for (let i = 0; i < slideCount; i++) {
    ffmpegArgs.push(
      "-loop", "1",
      "-t", slideDuration.toString(),
      "-i", validImages[i].localPath
    );
  }

  // Audio input
  ffmpegArgs.push("-i", audioPath);

  // Filter complex
  ffmpegArgs.push("-filter_complex", filterGraph);
  ffmpegArgs.push("-map", "[v_final]");
  ffmpegArgs.push("-map", "[a_final]");

  // Codecs and encoding
  const ffmpegThreads = process.env.FFMPEG_THREADS || (process.env.NODE_ENV === "production" ? "1" : "0");
  ffmpegArgs.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "faster",
    "-threads", ffmpegThreads,
    "-r", "30",
    "-t", totalDuration.toString(),
    "-c:a", "aac",
    "-ar", "44100",
    "-ac", "2",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputFilePath
  );

  console.log(`[VideoService] Rendering MP4 with ${slideCount} slides (${aspectRatio}, ${totalDuration}s)...`);

  try {
    await execFileAsync("ffmpeg", ffmpegArgs);

    // Validate output file exists and is valid
    if (!fs.existsSync(outputFilePath) || fs.statSync(outputFilePath).size < 1000) {
      try { if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath); } catch (_) {}
      throw new Error("FFmpeg rendering failed: Output video file is missing or corrupted");
    }

    const probe = await probeVideo(outputFilePath);
    if (!probe || !probe.streams || probe.streams.length === 0) {
      try { if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath); } catch (_) {}
      throw new Error("Rendered video failed FFprobe validation: No video streams detected");
    }

    const actualDuration = parseFloat(probe.format?.duration || totalDuration);
    const fileSize = parseInt(probe.format?.size || 0, 10);

    console.log(`[VideoService] Render successful! Size: ${fileSize} bytes, Duration: ${actualDuration}s`);

    // Generate thumbnail for video preview
    const thumbnailFileName = `thumb_${jobId}.jpg`;
    const thumbnailFilePath = path.join(PATHS.outputs, thumbnailFileName);
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-ss", "00:00:01",
        "-i", outputFilePath,
        "-vframes", "1",
        "-q:v", "2",
        thumbnailFilePath
      ]);
    } catch (thumbErr) {
      console.warn("[VideoService] Could not extract thumbnail:", thumbErr.message);
    }

    return {
      videoFile: outputFileName,
      videoPath: outputFilePath,
      videoUrl: `/media/${outputFileName}`,
      thumbnailFile: fs.existsSync(thumbnailFilePath) ? thumbnailFileName : null,
      thumbnailUrl: fs.existsSync(thumbnailFilePath) ? `/media/${thumbnailFileName}` : null,
      duration: actualDuration,
      fileSize,
      aspectRatio,
      template: tmpl.id,
      width,
      height
    };
  } catch (err) {
    // Clean up partial corrupt video file on failure
    try {
      if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
    } catch (_) {}
    throw err;
  } finally {
    // Always clean up transient job temp directory regardless of success or failure
    try {
      fs.rmSync(jobTempDir, { recursive: true, force: true });
    } catch (_) {}
  }
};

/**
 * Backward-compatible helper method
 */
export const generateVideo = async (images, audioFile) => {
  if (!audioFile) return null;

  const audioPath = path.isAbsolute(audioFile)
    ? audioFile
    : path.join(PATHS.outputs, audioFile);

  try {
    const result = await renderNewsVideo({
      images,
      audioPath,
      article: { title: "Daily News Briefing", source: { name: "News Wire" } },
      aspectRatio: "16:9",
      jobId: "legacy"
    });

    // Copy to news-video.mp4 for legacy callers
    const legacyPath = path.join(PATHS.outputs, "news-video.mp4");
    try {
      fs.copyFileSync(result.videoPath, legacyPath);
    } catch (_) {}

    return result.videoFile;
  } catch (err) {
    console.error("[VideoService] Legacy generateVideo error:", err.message);
    return null;
  }
};
