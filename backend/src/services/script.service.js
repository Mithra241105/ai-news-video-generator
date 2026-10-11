/* =========================================================================
   SCRIPT SERVICE
   Transforms verified news article content into a structured broadcast script.
   Strictly adheres to reported facts and preserves source attribution.
========================================================================= */

/**
 * Clean text by stripping HTML tags, brackets, and excessive whitespace
 */
/**
 * Clean text by stripping HTML tags, brackets, and excessive whitespace,
 * and normalizing quotes and dashes for natural speech cadence.
 */
export const cleanText = (text = "") => {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\[\+\d+\s*chars\]/gi, "") // strip common "[+1234 chars]" news wire suffixes
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\u2018\u2019`]/g, "'") // smart single quotes
    .replace(/[\u201C\u201D]/g, '"') // smart double quotes
    .replace(/[\u2013\u2014]/g, ", ") // em/en dashes to pauses
    .replace(/\.{2,}/g, ".") // multiple dots to single period
    .replace(/[!]{2,}/g, "!")
    .replace(/[?]{2,}/g, "?")
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Remove redundant wire service suffixes from headlines (e.g., " - Reuters", " | CNN")
 */
const stripWireSuffix = (title = "", sourceName = "") => {
  let cleaned = title;
  if (sourceName) {
    const escapedSource = sourceName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`\\s*[-|–—:]\\s*${escapedSource}\\s*$`, "i"), "");
  }
  // Remove generic trailing source flags
  cleaned = cleaned.replace(/\s*[-|–—]\s*[A-Z0-9\s]{2,20}$/, "");
  return cleaned.trim();
};

/**
 * Ensure text ends with terminal punctuation (. ! ?)
 */
const ensureTerminalPunctuation = (str = "") => {
  const trimmed = str.trim();
  if (!trimmed) return "";
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
};

/**
 * Estimate spoken duration in seconds at ~140 words per minute (~2.3 words/sec)
 */
export const estimateDurationSec = (text = "") => {
  const words = cleanText(text).split(/\s+/).filter(Boolean).length;
  return Math.max(Math.round(words / 2.3), 3);
};

/**
 * Generate a broadcast-ready narration script from a single verified article
 */
export const prepareArticleScript = (article) => {
  if (!article || !article.title) {
    throw new Error("Invalid article data provided for script generation");
  }

  const rawTitle = cleanText(article.title);
  const sourceName = article.source?.name ? cleanText(article.source.name) : "news reports";
  const headline = ensureTerminalPunctuation(stripWireSuffix(rawTitle, sourceName));
  const rawDescription = cleanText(article.description || "");

  const sentences = [];

  // Opening headline hook
  sentences.push(`In our top story: ${headline}`);

  // Core reported facts
  if (rawDescription) {
    const descClean = ensureTerminalPunctuation(rawDescription);
    // Only include if description isn't a near-duplicate of the headline
    const headlineSample = headline.slice(0, 35).toLowerCase();
    const descSample = descClean.slice(0, 35).toLowerCase();
    if (!descSample.includes(headlineSample) && !headlineSample.includes(descSample)) {
      sentences.push(descClean);
    }
  }

  // Clear, verified journalistic attribution
  sentences.push(`According to reports from ${sourceName}, developments are currently unfolding.`);

  // Professional broadcast sign-off
  sentences.push("Stay tuned as we continue to track this story.");

  const script = sentences.join("\n\n");
  const estimatedDuration = estimateDurationSec(script);

  return {
    headline: stripWireSuffix(rawTitle, sourceName),
    script,
    source: sourceName,
    wordCount: script.split(/\s+/).filter(Boolean).length,
    estimatedDurationSec: estimatedDuration
  };
};

/**
 * Legacy compatibility wrapper for earlier controller calls
 */
export const generateNewsScript = async (topic, articles) => {
  if (!articles || articles.length === 0) {
    return `Here are today's key updates in ${topic}. Stay tuned for more coverage.`;
  }

  const firstArticle = articles[0];
  const prepared = prepareArticleScript(firstArticle);
  return prepared.script;
};
