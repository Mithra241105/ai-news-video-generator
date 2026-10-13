/* =========================================================================
   AI NEWS VIDEO GENERATOR — STUDIO CLIENT CONTROLLER
========================================================================= */

const API_BASE = window.location.origin && window.location.origin.startsWith("http")
  ? window.location.origin
  : "http://localhost:5000";

// Studio State
// Studio State
let currentCategory = "general";
let currentArticles = [];
let selectedArticle = null;
let defaultGeneratedScript = "";
let selectedAspectRatio = "16:9";
let selectedTemplate = "breaking";
let currentGeneratedAudio = null;
let currentGeneratedAudioScript = "";
let currentGeneratedAudioVoice = "";

// DOM Elements
const systemStatusEl = document.getElementById("systemStatus");
const statusTextEl = document.getElementById("statusText");
const topicInput = document.getElementById("topicInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const articlesGrid = document.getElementById("articlesGrid");
const articleCountBadge = document.getElementById("articleCountBadge");
const categoryPills = document.querySelectorAll(".pill-btn");

const selectedStorySummary = document.getElementById("selectedStorySummary");
const scriptEditorWrap = document.getElementById("scriptEditorWrap");
const headlineInput = document.getElementById("headlineInput");
const scriptContentEl = document.getElementById("scriptContent");
const wordCountLabel = document.getElementById("wordCountLabel");
const durationEstLabel = document.getElementById("durationEstLabel");
const audioPreviewWrap = document.getElementById("audioPreviewWrap");
const audioEl = document.getElementById("audio");

const templateButtons = document.querySelectorAll(".template-opt");
const voiceSelect = document.getElementById("voiceSelect");
const ratioButtons = document.querySelectorAll(".format-opt");
const narrationLangSelect = document.getElementById("narrationLangSelect");
const subtitlesLangSelect = document.getElementById("subtitlesLangSelect");
const generateBtn = document.getElementById("generateBtn");

const renderProgress = document.getElementById("renderProgress");
const progressBar = document.getElementById("progressBar");
const progressMessage = document.getElementById("progressMessage");
const stepperItems = {
  voice: document.getElementById("step-voice"),
  assets: document.getElementById("step-assets"),
  ffmpeg: document.getElementById("step-ffmpeg"),
  complete: document.getElementById("step-complete")
};

const videoOutputCard = document.getElementById("videoOutputCard");
const videoEl = document.getElementById("video");
const videoSpecs = document.getElementById("videoSpecs");
const downloadVideoBtn = document.getElementById("downloadVideoBtn");
const historyGrid = document.getElementById("historyGrid");

/* =========================================================================
   INITIALIZATION
========================================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await checkSystemHealth();
  await checkSchedulerStatus();
  await loadVoices();
  await fetchArticles(currentCategory);
  await fetchVideoHistory();
});

function setupEventListeners() {
  // Category Pill Buttons
  categoryPills.forEach((btn) => {
    btn.addEventListener("click", () => {
      categoryPills.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentCategory = btn.getAttribute("data-category");
      topicInput.value = "";
      clearSearchBtn.style.display = "none";
      fetchArticles(currentCategory);
    });
  });

  // Search Input Handlers
  topicInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
  topicInput.addEventListener("input", () => {
    clearSearchBtn.style.display = topicInput.value ? "block" : "none";
  });
  clearSearchBtn.addEventListener("click", () => {
    topicInput.value = "";
    clearSearchBtn.style.display = "none";
    fetchArticles(currentCategory);
  });

  // Script Live Typing Counter & Cache Invalidation
  scriptContentEl.addEventListener("input", () => {
    updateScriptMetrics();
    if (scriptContentEl.value.trim() !== currentGeneratedAudioScript) {
      currentGeneratedAudio = null;
    }
  });

  // Voice Selection Change Cache Invalidation
  voiceSelect.addEventListener("change", () => {
    if (voiceSelect.value !== currentGeneratedAudioVoice) {
      currentGeneratedAudio = null;
    }
  });

  // Aspect Ratio Toggle
  ratioButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      ratioButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedAspectRatio = btn.getAttribute("data-ratio");
    });
  });

  // Template Selection Toggle
  templateButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      templateButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedTemplate = btn.getAttribute("data-template");
    });
  });

  // Narration Language Filter Synchronizer
  if (narrationLangSelect) {
    narrationLangSelect.addEventListener("change", () => {
      currentGeneratedAudio = null;
      const lang = narrationLangSelect.value;
      // Auto-filter or highlight matching voice if available
      for (let opt of voiceSelect.options) {
        if (opt.value.startsWith(lang)) {
          voiceSelect.value = opt.value;
          break;
        }
      }
    });
  }
}

/* =========================================================================
   SYSTEM HEALTH & VOICES
========================================================================= */

async function checkSystemHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    if (data.success) {
      statusTextEl.innerText = "Studio Online • FFmpeg & Neural Voice Ready";
      systemStatusEl.querySelector(".status-dot").classList.add("online");
    } else {
      statusTextEl.innerText = "System Warning • Limited Services";
    }
  } catch (err) {
    statusTextEl.innerText = "Connecting to Backend Server...";
    console.warn("Health check error:", err);
  }
}

async function checkSchedulerStatus() {
  const schedulerTextEl = document.getElementById("schedulerText");
  const schedulerDotEl = document.querySelector(".scheduler-dot");
  if (!schedulerTextEl) return;

  try {
    const res = await fetch(`${API_BASE}/api/news/scheduler/status`);
    const data = await res.json();
    if (data.success && data.enabled) {
      if (data.isJobRunning) {
        schedulerTextEl.innerText = "Auto Dispatch: Producing Video...";
        if (schedulerDotEl) schedulerDotEl.classList.add("active");
      } else if (data.nextRunAt) {
        const nextTime = new Date(data.nextRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        schedulerTextEl.innerText = `Auto Dispatch: Active (Next: ${nextTime})`;
        if (schedulerDotEl) schedulerDotEl.classList.add("active");
      } else {
        schedulerTextEl.innerText = `Auto Dispatch: Active (${data.intervalHours}h)`;
      }
    } else {
      schedulerTextEl.innerText = "Auto Dispatch: Disabled";
      if (schedulerDotEl) schedulerDotEl.classList.remove("active");
    }
  } catch (err) {
    console.warn("Scheduler status check error:", err);
  }
}

window.triggerManualSchedulerRun = async function() {
  const btn = document.getElementById("triggerSchedulerBtn");
  const schedulerTextEl = document.getElementById("schedulerText");
  if (btn) btn.disabled = true;
  if (schedulerTextEl) schedulerTextEl.innerText = "Auto Dispatch: Running...";

  try {
    const res = await fetch(`${API_BASE}/api/news/scheduler/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isManual: true })
    });
    const data = await res.json();
    if (data.success) {
      if (data.skipped) {
        alert("Deduplication Active: All current headlines were already produced. No redundant video was created.");
      } else {
        await fetchVideoHistory();
        alert(`Autonomous Dispatch Succeeded!\nProduced: "${data.articleTitle}"\nFile: ${data.videoFile}`);
      }
    } else {
      alert(`Dispatch Error: ${data.error || "Execution failed"}`);
    }
  } catch (err) {
    alert(`Failed to trigger dispatch: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
    await checkSchedulerStatus();
  }
};


async function loadVoices() {
  try {
    const res = await fetch(`${API_BASE}/api/news/voices`);
    const data = await res.json();
    if (data.success && data.voices?.length) {
      voiceSelect.innerHTML = data.voices
        .map((v) => `<option value="${v.id}">${v.name}</option>`)
        .join("");
      if (data.defaultVoice) {
        voiceSelect.value = data.defaultVoice;
      }
    }
  } catch (err) {
    console.warn("Could not load dynamic voices, using defaults:", err);
  }
}

/* =========================================================================
   ARTICLE RETRIEVAL & RENDERING
========================================================================= */

async function fetchArticles(category = "general") {
  articlesGrid.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Fetching curated news dispatches (${category})...</p>
    </div>
  `;
  articleCountBadge.innerText = "Loading...";

  try {
    const res = await fetch(`${API_BASE}/api/news?category=${encodeURIComponent(category)}`);
    const data = await res.json();

    if (!data.success || !data.articles || data.articles.length === 0) {
      articlesGrid.innerHTML = `
        <div class="loading-state">
          <p>No stories found for this category. Try another topic or search above.</p>
        </div>
      `;
      articleCountBadge.innerText = "0 stories";
      return;
    }

    currentArticles = data.articles;
    articleCountBadge.innerText = `${currentArticles.length} stories`;
    renderArticleCards(currentArticles);
  } catch (err) {
    console.error("fetchArticles error:", err);
    articlesGrid.innerHTML = `
      <div class="loading-state">
        <p style="color: var(--accent-red)">Error loading news feed. Ensure backend server is running.</p>
      </div>
    `;
    articleCountBadge.innerText = "Error";
  }
}

async function handleSearch() {
  const query = topicInput.value.trim();
  if (!query) {
    fetchArticles(currentCategory);
    return;
  }

  // Deactivate category pills
  categoryPills.forEach((b) => b.classList.remove("active"));
  articlesGrid.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Searching headlines for "${escapeHtml(query)}"...</p>
    </div>
  `;
  articleCountBadge.innerText = "Searching...";

  try {
    const res = await fetch(`${API_BASE}/api/news?search=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!data.success || !data.articles || data.articles.length === 0) {
      articlesGrid.innerHTML = `
        <div class="loading-state">
          <p>No search results found for "${escapeHtml(query)}". Try another query.</p>
        </div>
      `;
      articleCountBadge.innerText = "0 results";
      return;
    }

    currentArticles = data.articles;
    articleCountBadge.innerText = `${currentArticles.length} results`;
    renderArticleCards(currentArticles);
  } catch (err) {
    console.error("Search error:", err);
    articlesGrid.innerHTML = `
      <div class="loading-state">
        <p style="color: var(--accent-red)">Search request failed.</p>
      </div>
    `;
  }
}

function renderArticleCards(articles) {
  articlesGrid.innerHTML = "";

  articles.forEach((art, idx) => {
    const card = document.createElement("div");
    card.className = "article-card";
    if (selectedArticle && selectedArticle.id === art.id) {
      card.classList.add("selected");
    }

    const fallbackImg = `${API_BASE}/media/fallback/img2.png`;
    const imageSrc = art.image && art.image.startsWith("http") ? art.image : fallbackImg;
    const timeAgo = formatRelativeTime(art.publishedAt);
    const source = art.source?.name || "News Wire";

    card.innerHTML = `
      <div class="article-thumb-wrap">
        <img class="article-thumb" src="${escapeHtml(imageSrc)}" alt="" onerror="this.src='${fallbackImg}'" />
      </div>
      <div class="article-info">
        <div class="article-meta">
          <span class="article-source">${escapeHtml(source)}</span>
          <span>&bull;</span>
          <span>${timeAgo}</span>
        </div>
        <h4 class="article-title">${escapeHtml(art.title)}</h4>
        <p class="article-desc">${escapeHtml(art.description || "")}</p>
      </div>
    `;

    card.addEventListener("click", () => selectArticle(art, card));
    articlesGrid.appendChild(card);
  });
}

/* =========================================================================
   ARTICLE SELECTION & SCRIPT PREPARATION
========================================================================= */

async function selectArticle(article, cardEl) {
  selectedArticle = article;
  currentGeneratedAudio = null;
  audioPreviewWrap.style.display = "none";

  // Highlight selected card
  document.querySelectorAll(".article-card").forEach((c) => c.classList.remove("selected"));
  if (cardEl) cardEl.classList.add("selected");

  // Update Story Banner
  const source = article.source?.name || "Global News Wire";
  const fallbackImg = `${API_BASE}/media/fallback/img2.png`;
  const imageSrc = article.image && article.image.startsWith("http") ? article.image : fallbackImg;
  const articleUrlLink = article.url
    ? `<a class="story-url-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-indigo); text-decoration: underline; margin-left: 6px;">Read Source Article &nearr;</a>`
    : "";

  selectedStorySummary.innerHTML = `
    <div class="selected-story-active" style="display: flex; gap: 14px; align-items: flex-start;">
      <div style="width: 80px; height: 60px; border-radius: 6px; overflow: hidden; flex-shrink: 0; background: #000;">
        <img src="${escapeHtml(imageSrc)}" alt="" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='${fallbackImg}'" />
      </div>
      <div style="flex: 1;">
        <span class="story-tag">&#9679; SELECTED STORY</span>
        <div class="story-heading">${escapeHtml(article.title)}</div>
        <div class="story-source-line" style="margin-top: 4px;">Attribution: <strong>${escapeHtml(source)}</strong> &bull; Published: ${new Date(article.publishedAt).toLocaleDateString()} ${articleUrlLink}</div>
      </div>
    </div>
  `;

  // Request AI Narration Script
  scriptEditorWrap.style.display = "flex";
  if (headlineInput) {
    headlineInput.value = article.title || "";
  }
  scriptContentEl.value = "Generating anchor narration script...";
  generateBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/news/script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article })
    });
    const data = await res.json();

    if (data.success && data.script) {
      defaultGeneratedScript = data.script;
      scriptContentEl.value = data.script;
      updateScriptMetrics();
      generateBtn.disabled = false;
    } else {
      throw new Error(data.error || "Script generation failed");
    }
  } catch (err) {
    console.error("Script error:", err);
    scriptContentEl.value = `In our top story: ${article.title}. Reporting from ${source}, developments continue to unfold. Stay tuned for details.`;
    defaultGeneratedScript = scriptContentEl.value;
    updateScriptMetrics();
    generateBtn.disabled = false;
  }
}

function updateScriptMetrics() {
  const text = scriptContentEl.value.trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const durationSec = Math.max(Math.round(words / 2.3), 3);

  wordCountLabel.innerText = `${words} words`;
  durationEstLabel.innerText = `~${durationSec}s spoken`;
}

function resetScriptToDefault() {
  if (defaultGeneratedScript) {
    scriptContentEl.value = defaultGeneratedScript;
    if (headlineInput && selectedArticle) {
      headlineInput.value = selectedArticle.title || "";
    }
    updateScriptMetrics();
  }
}

/* =========================================================================
   VOICE PREVIEW
========================================================================= */

async function previewVoiceNarration() {
  const script = scriptContentEl.value.trim();
  if (!script) {
    alert("Please enter a narration script to preview.");
    return;
  }

  const voice = voiceSelect.value;
  const previewBtn = document.getElementById("previewVoiceBtn");
  previewBtn.disabled = true;
  previewBtn.innerHTML = `<div class="spinner-small"></div> Synthesizing...`;

  try {
    const res = await fetch(`${API_BASE}/api/news/voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, voice })
    });
    const data = await res.json();

    if (data.success && data.audioUrl) {
      currentGeneratedAudio = data.audioFile;
      currentGeneratedAudioScript = script;
      currentGeneratedAudioVoice = voice;
      audioEl.src = `${API_BASE}${data.audioUrl}`;
      audioPreviewWrap.style.display = "flex";
      audioEl.play().catch(() => {});
    } else {
      alert("Voice preview error: " + (data.error || "Synthesis failed"));
    }
  } catch (err) {
    console.error("previewVoice error:", err);
    alert("Server communication error while previewing voice.");
  } finally {
    previewBtn.disabled = false;
    previewBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      Preview Voice
    `;
  }
}

/* =========================================================================
   VIDEO RENDERING PIPELINE
========================================================================= */

async function startVideoRender() {
  if (!selectedArticle) {
    alert("Please select a story first.");
    return;
  }

  const script = scriptContentEl.value.trim();
  if (!script) {
    alert("Narration script cannot be empty.");
    return;
  }

  const voice = voiceSelect.value;
  const aspectRatio = selectedAspectRatio;
  const template = selectedTemplate;
  const headline = headlineInput ? headlineInput.value.trim() : "";
  const narrationLang = narrationLangSelect ? narrationLangSelect.value : "en";
  const subtitlesLang = subtitlesLangSelect ? subtitlesLangSelect.value : "en";

  // Prepare UI for rendering
  generateBtn.disabled = true;
  renderProgress.style.display = "flex";
  progressBar.style.width = "10%";
  resetStepper();

  updateProgress("voice", "Synthesizing neural voice narration...", 25);

  try {
    // Stage 1 -> Stage 2 -> Stage 3
    setTimeout(() => {
      if (generateBtn.disabled) updateProgress("assets", "Fetching and verifying visual assets...", 50);
    }, 2000);

    setTimeout(() => {
      if (generateBtn.disabled) updateProgress("ffmpeg", "Compositing multi-slide video & overlays in FFmpeg...", 75);
    }, 4500);

    const isAudioCurrent = Boolean(
      currentGeneratedAudio &&
      currentGeneratedAudioScript === script &&
      currentGeneratedAudioVoice === voice
    );

    const payload = {
      article: selectedArticle,
      headline,
      script,
      voice,
      aspectRatio,
      template,
      narrationLang,
      subtitlesLang,
      audioFile: isAudioCurrent ? currentGeneratedAudio : null
    };

    const res = await fetch(`${API_BASE}/api/news/video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!data.success || !data.videoUrl) {
      throw new Error(data.error || "Rendering pipeline returned an error");
    }

    // Success Stage
    updateProgress("complete", "Video render complete! Ready for download.", 100);
    markStepComplete("step-voice");
    markStepComplete("step-assets");
    markStepComplete("step-ffmpeg");
    markStepComplete("step-complete");

    // Display Output Player
    setTimeout(() => {
      renderProgress.style.display = "none";
      displayVideoOutput(data);
      fetchVideoHistory();
    }, 1200);

  } catch (err) {
    console.error("startVideoRender error:", err);
    progressMessage.innerHTML = `<span style="color: var(--accent-red)">Render failed: ${escapeHtml(err.message)}</span>`;
    progressBar.style.background = "var(--accent-red)";
    generateBtn.disabled = false;
  }
}

function updateProgress(stepKey, message, percent) {
  progressMessage.innerText = message;
  progressBar.style.width = `${percent}%`;

  Object.keys(stepperItems).forEach((k) => {
    stepperItems[k].classList.remove("active");
  });
  if (stepperItems[stepKey]) {
    stepperItems[stepKey].classList.add("active");
  }
}

function markStepComplete(stepId) {
  const el = document.getElementById(stepId);
  if (el) {
    el.classList.remove("active");
    el.classList.add("completed");
  }
}

function resetStepper() {
  progressBar.style.background = "linear-gradient(90deg, #6366F1, #10B981)";
  Object.values(stepperItems).forEach((el) => {
    el.classList.remove("active", "completed");
  });
}

function displayVideoOutput(videoData) {
  videoOutputCard.style.display = "block";
  const videoSrc = `${API_BASE}${videoData.videoUrl}`;

  videoEl.src = videoSrc;
  videoEl.load();

  downloadVideoBtn.href = videoSrc;
  downloadVideoBtn.setAttribute("download", videoData.videoFile || "news-video.mp4");

  const durationStr = videoData.duration ? `${videoData.duration.toFixed(1)}s` : "N/A";
  const sizeMB = videoData.fileSize ? `${(videoData.fileSize / (1024 * 1024)).toFixed(2)} MB` : "N/A";
  const dims = videoData.dimensions ? `${videoData.dimensions.width}x${videoData.dimensions.height}` : videoData.aspectRatio;
  const tmplName = (videoData.template || "breaking").toUpperCase();

  videoSpecs.innerHTML = `
    <span><strong>Duration:</strong> ${durationStr}</span>
    <span>&bull;</span>
    <span><strong>Format:</strong> ${escapeHtml(videoData.aspectRatio || "16:9")} (${dims})</span>
    <span>&bull;</span>
    <span><strong>Template:</strong> <span class="badge" style="background: rgba(99,102,241,0.25); color: #818CF8; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px;">${tmplName}</span></span>
    <span>&bull;</span>
    <span><strong>Size:</strong> ${sizeMB}</span>
    <span>&bull;</span>
    <span><strong>Codec:</strong> H.264 / AAC</span>
  `;

  // Scroll smoothly to output
  videoOutputCard.scrollIntoView({ behavior: "smooth", block: "start" });
  generateBtn.disabled = false;
}

function copyVideoLink() {
  if (videoEl.src) {
    navigator.clipboard.writeText(videoEl.src).then(() => {
      const btn = document.getElementById("copyLinkBtn");
      const original = btn.innerHTML;
      btn.innerHTML = `&#10003; Copied!`;
      setTimeout(() => (btn.innerHTML = original), 2000);
    });
  }
}

/* =========================================================================
   VIDEO PRODUCTION ARCHIVE / HISTORY
========================================================================= */

async function fetchVideoHistory() {
  try {
    const res = await fetch(`${API_BASE}/api/news/history`);
    const data = await res.json();

    if (!data.success || !data.videos || data.videos.length === 0) {
      historyGrid.innerHTML = `
        <div class="history-empty">No rendered videos yet. Select a story above to create one.</div>
      `;
      return;
    }

    historyGrid.innerHTML = "";
    data.videos.forEach((vid) => {
      const card = document.createElement("div");
      card.className = "history-card";

      const videoSrc = `${API_BASE}${vid.videoUrl}`;
      const thumbUrl = vid.thumbnailUrl
        ? `${API_BASE}${vid.thumbnailUrl}`
        : `${API_BASE}/media/fallback/img2.png`;
      const titleDisplay = vid.articleTitle || vid.fileName;
      const sourceDisplay = vid.sourceName || "News Wire";
      const tmplDisplay = (vid.template || "breaking").toUpperCase();
      const sourceLink = vid.sourceUrl
        ? `<a href="${escapeHtml(vid.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color: #60A5FA; font-size: 0.75rem; text-decoration: none; margin-left: 6px;">Read Source ↗</a>`
        : "";
      const ratioBadge = vid.aspectRatio === "9:16" ? "9:16 Vertical" : "16:9 Landscape";
      const durationBadge = vid.duration ? `${vid.duration.toFixed(1)}s` : "";
      const sizeNumber = vid.fileSize || vid.size;
      const sizeStr = sizeNumber ? `${(sizeNumber / (1024 * 1024)).toFixed(2)} MB` : "N/A";
      const dateStr = new Date(vid.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });

      card.innerHTML = `
        <div class="history-thumb-wrap">
          <img class="history-thumb" src="${escapeHtml(thumbUrl)}" alt="" onerror="this.src='${API_BASE}/media/fallback/img2.png'" />
          <span class="ratio-chip" style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.75); color: #fff; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15);">${ratioBadge}</span>
          <span class="tmpl-chip" style="position: absolute; top: 8px; left: 8px; background: rgba(99,102,241,0.85);">${tmplDisplay}</span>
        </div>
        <div class="history-body">
          <div class="history-title" title="${escapeHtml(titleDisplay)}">${escapeHtml(titleDisplay)}</div>
          <div class="history-meta" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 8px 0; font-size: 0.75rem; color: #94A3B8;">
            <span>${escapeHtml(sourceDisplay)}${sourceLink}</span>
            <span>&bull;</span>
            <span>${durationBadge ? `${durationBadge} • ` : ""}${sizeStr}</span>
            <span>&bull;</span>
            <span>${dateStr}</span>
          </div>
          <div class="history-actions" style="display: flex; gap: 6px;">
            <button class="secondary-btn" style="flex: 1; padding: 6px 10px; font-size: 0.8rem;" onclick="playArchivedVideo('${videoSrc}', '${escapeHtml(vid.fileName)}')">Play</button>
            <a class="secondary-btn" style="text-decoration: none; padding: 6px 10px; font-size: 0.8rem; display: flex; align-items: center; justify-content: center;" href="${videoSrc}" download="${escapeHtml(vid.fileName)}">Download</a>
            <button class="secondary-btn" style="padding: 6px 10px; font-size: 0.8rem; color: #F87171; border-color: rgba(248,113,113,0.3);" title="Delete video" onclick="deleteArchivedVideo('${escapeHtml(vid.fileName)}')">✕</button>
          </div>
        </div>
      `;

      historyGrid.appendChild(card);
    });
  } catch (err) {
    console.warn("fetchVideoHistory error:", err);
  }
}

window.playArchivedVideo = function(url, fileName) {
  videoOutputCard.style.display = "block";
  videoEl.src = url;
  videoEl.load();
  videoEl.play().catch(() => {});
  downloadVideoBtn.href = url;
  downloadVideoBtn.setAttribute("download", fileName);
  videoSpecs.innerHTML = `<span><strong>Archive Replay:</strong> ${escapeHtml(fileName)}</span>`;
  videoOutputCard.scrollIntoView({ behavior: "smooth" });
};

window.deleteArchivedVideo = async function(fileName) {
  if (!confirm(`Are you sure you want to delete "${fileName}"? This cannot be undone.`)) {
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/news/history/${encodeURIComponent(fileName)}`, {
      method: "DELETE"
    });
    const data = await res.json();
    if (data.success) {
      if (videoEl.src && videoEl.src.includes(fileName)) {
        videoOutputCard.style.display = "none";
        videoEl.pause();
        videoEl.src = "";
      }
      fetchVideoHistory();
    } else {
      alert("Could not delete video: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
};

/* =========================================================================
   LEGACY COMPATIBILITY
========================================================================= */

window.generateNews = async function () {
  const topic = document.getElementById("topicInput").value || "Technology";
  const status = document.getElementById("status");
  if (status) status.innerText = "Generating news...";

  try {
    const res = await fetch(`${API_BASE}/api/news?topic=${encodeURIComponent(topic)}`);
    const data = await res.json();
    if (!data.success) {
      if (status) status.innerText = "Failed to generate news";
      return;
    }
    if (status) status.innerText = "Done";
    displayVideoOutput(data);
  } catch (err) {
    if (status) status.innerText = "Server error";
    console.error(err);
  }
};

/* =========================================================================
   UTILITIES
========================================================================= */

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatRelativeTime(dateString) {
  if (!dateString) return "Recent";
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffHrs = Math.floor(diffMs / 3600000);
  if (diffHrs < 1) return "Just now";
  if (diffHrs === 1) return "1h ago";
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}
