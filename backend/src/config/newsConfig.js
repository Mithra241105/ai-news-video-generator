import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PATHS = {
  root: path.resolve(__dirname, "../../"),
  outputs: path.resolve(__dirname, "../../outputs"),
  assets: path.resolve(__dirname, "../../assets"),
  fallback: path.resolve(__dirname, "../../assets/fallback"),
  temp: path.resolve(__dirname, "../../outputs/temp")
};

export const NEWS_CATEGORIES = [
  { id: "general", label: "Top Stories", icon: "newspaper" },
  { id: "technology", label: "Technology", icon: "cpu" },
  { id: "business", label: "Business", icon: "trending-up" },
  { id: "science", label: "Science", icon: "atom" },
  { id: "health", label: "Health", icon: "activity" },
  { id: "sports", label: "Sports", icon: "award" },
  { id: "entertainment", label: "Entertainment", icon: "film" }
];

export const TTS_VOICES = [
  // English - US & UK
  { id: "en-US-GuyNeural", name: "Guy (US - Anchor Male)", gender: "male", locale: "en-US", lang: "en", style: "Authoritative News" },
  { id: "en-US-JennyNeural", name: "Jenny (US - Anchor Female)", gender: "female", locale: "en-US", lang: "en", style: "Professional Broadcast" },
  { id: "en-GB-RyanNeural", name: "Ryan (UK - Broadcast Male)", gender: "male", locale: "en-GB", lang: "en", style: "Formal Editorial" },
  { id: "en-GB-SoniaNeural", name: "Sonia (UK - Broadcast Female)", gender: "female", locale: "en-GB", lang: "en", style: "Clear Narrative" },
  { id: "en-AU-WilliamNeural", name: "William (Australia - Anchor Male)", gender: "male", locale: "en-AU", lang: "en", style: "Dynamic News" },

  // English - India & Regional Indian Languages
  { id: "en-IN-NeerjaNeural", name: "Neerja (India - News Female)", gender: "female", locale: "en-IN", lang: "en", style: "National Wire" },
  { id: "en-IN-PrabhatNeural", name: "Prabhat (India - News Male)", gender: "male", locale: "en-IN", lang: "en", style: "Anchor Dispatch" },
  { id: "hi-IN-MadhurNeural", name: "Madhur (Hindi - News Male)", gender: "male", locale: "hi-IN", lang: "hi", style: "Hindi Broadcast" },
  { id: "hi-IN-SwaraNeural", name: "Swara (Hindi - News Female)", gender: "female", locale: "hi-IN", lang: "hi", style: "Hindi Anchor" },

  // European & Global Languages
  { id: "es-ES-AlvaroNeural", name: "Alvaro (Spanish - Spain Male)", gender: "male", locale: "es-ES", lang: "es", style: "Noticias en Español" },
  { id: "es-US-AlonsoNeural", name: "Alonso (Spanish - Americas Male)", gender: "male", locale: "es-US", lang: "es", style: "Cronica Internacional" },
  { id: "fr-FR-HenriNeural", name: "Henri (French - Anchor Male)", gender: "male", locale: "fr-FR", lang: "fr", style: "Journal Télévisé" },
  { id: "de-DE-ConradNeural", name: "Conrad (German - Broadcast Male)", gender: "male", locale: "de-DE", lang: "de", style: "Nachrichten Aktuell" },
  { id: "ja-JP-KeitaNeural", name: "Keita (Japanese - News Male)", gender: "male", locale: "ja-JP", lang: "ja", style: "News Flash Japan" }
];

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", defaultVoice: "en-US-GuyNeural" },
  { code: "hi", name: "Hindi (हिंदी)", defaultVoice: "hi-IN-MadhurNeural" },
  { code: "es", name: "Spanish (Español)", defaultVoice: "es-ES-AlvaroNeural" },
  { code: "fr", name: "French (Français)", defaultVoice: "fr-FR-HenriNeural" },
  { code: "de", name: "German (Deutsch)", defaultVoice: "de-DE-ConradNeural" },
  { code: "ja", name: "Japanese (日本語)", defaultVoice: "ja-JP-KeitaNeural" }
];

export const VIDEO_TEMPLATES = {
  breaking: {
    id: "breaking",
    name: "Breaking News",
    tagline: "High-urgency bulletin with crimson alert banner and high-contrast ticker",
    badgeColor: "0xDC2626@0.95",   // Crimson Alert Red
    badgeText: "BREAKING NEWS",
    lowerThirdBg: "0x0B0F19@0.92", // Deep Charcoal
    lowerThirdText: "white",
    sourceColor: "0xE2E8F0",
    outroBg: "0x020617@0.95",
    subBgColor: "&H99000000",       // Translucent Dark
    subTextColor: "&H00FFFFFF",     // White
    accentColor: "#DC2626"
  },
  editorial: {
    id: "editorial",
    name: "Modern Editorial",
    tagline: "Sophisticated deep indigo and amber accents with refined journalistic lower-third",
    badgeColor: "0x4F46E5@0.95",   // Deep Indigo
    badgeText: "SPECIAL REPORT",
    lowerThirdBg: "0x1E1B4B@0.90", // Midnight Indigo
    lowerThirdText: "white",
    sourceColor: "0xFDE047",       // Golden Amber
    outroBg: "0x0F172A@0.95",
    subBgColor: "&H991E1B4B",       // Indigo Tint
    subTextColor: "&H00FFFFFF",
    accentColor: "#4F46E5"
  },
  documentary: {
    id: "documentary",
    name: "Minimal Documentary",
    tagline: "Understated cinematic monochrome styling with clean corner marks and subtle captions",
    badgeColor: "0x334155@0.92",   // Slate Slate
    badgeText: "DISPATCH",
    lowerThirdBg: "0x020617@0.85", // Translucent Obsidian
    lowerThirdText: "0xF8FAFC",
    sourceColor: "0x94A3B8",       // Subtle Silver
    outroBg: "0x020617@0.95",
    subBgColor: "&HAA000000",
    subTextColor: "&H00F8FAFC",
    accentColor: "#64748B"
  },
  tech: {
    id: "tech",
    name: "Technology Briefing",
    tagline: "Cyber cyan and cobalt framing designed for scientific and developer news",
    badgeColor: "0x0891B2@0.95",   // Cyan Tech
    badgeText: "TECH BRIEFING",
    lowerThirdBg: "0x082F49@0.90", // Deep Marine
    lowerThirdText: "0xECFEFF",
    sourceColor: "0x38BDF8",       // Electric Sky
    outroBg: "0x030712@0.95",
    subBgColor: "&H99082F49",
    subTextColor: "&H00ECFEFF",
    accentColor: "#06B6D4"
  },
  shorts: {
    id: "shorts",
    name: "Vertical News Shorts",
    tagline: "Punchy, mobile-first design with prominent yellow captions for Reels, Shorts & TikTok",
    badgeColor: "0xEAB308@0.95",   // Electric Yellow
    badgeText: "QUICK TAKE",
    lowerThirdBg: "0x18181B@0.92", // Zinc Black
    lowerThirdText: "white",
    sourceColor: "0xFDE047",
    outroBg: "0x09090B@0.95",
    subBgColor: "&HB3000000",
    subTextColor: "&H0000FFFF",     // Bright Yellow ASS Primary
    accentColor: "#EAB308"
  }
};

export const VIDEO_CONFIG = {
  formats: {
    "16:9": {
      width: 1920,
      height: 1080,
      aspectLabel: "16:9 Landscape (YouTube / Desktop)",
      fps: 30
    },
    "9:16": {
      width: 1080,
      height: 1920,
      aspectLabel: "9:16 Vertical (Shorts / Reels / TikTok)",
      fps: 30
    }
  },
  defaultFormat: "16:9",
  defaultVoice: "en-US-GuyNeural",
  defaultTemplate: "breaking",
  minDurationPerSlideSec: 3.5
};
