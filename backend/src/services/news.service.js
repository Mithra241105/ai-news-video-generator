import axios from "axios";
import crypto from "crypto";

/* =========================================================================
   NEWS SERVICE
   Handles real-time news retrieval from GNews API with category navigation,
   keyword search, strict normalization, and robust fallback news data.
========================================================================= */

const GNEWS_BASE_URL = "https://gnews.io/api/v4";

/**
 * Generate a deterministic ID for an article
 */
const createArticleId = (title, url) => {
  return crypto
    .createHash("md5")
    .update((url || title || Date.now().toString()).trim())
    .digest("hex")
    .slice(0, 12);
};

/**
 * Normalize an external article into standard internal format
 */
const normalizeArticle = (article, defaultCategory = "general") => {
  const title = (article.title || "Untitled News Story").trim();
  const description = (
    article.description ||
    article.content ||
    `Reporting on latest developments in ${defaultCategory}.`
  ).trim();
  const url = article.url || "";
  const id = createArticleId(title, url);

  return {
    id,
    title,
    description,
    content: (article.content || description || "").trim(),
    url,
    image: article.image || null,
    publishedAt: article.publishedAt || new Date().toISOString(),
    source: {
      name: article.source?.name || "Global News Wire",
      url: article.source?.url || null
    },
    category: defaultCategory
  };
};

/**
 * Curated, high-quality fallback articles for all standard categories
 */
const FALLBACK_ARTICLES = {
  technology: [
    {
      title: "Breakthrough in Photonic Quantum Computing Achieves Room-Temperature Stability",
      description: "Researchers announce a major milestone in photonic quantum processing, demonstrating quantum coherence at ambient room temperatures for the first time without cryogenic cooling.",
      content: "A consortium of quantum physicists and optical engineers published findings demonstrating room-temperature quantum computing using silicon nitride photonic waveguides.",
      source: { name: "Quantum Computing Review", url: "https://example.com/quantum" },
      image: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1200&auto=format&fit=crop&q=80",
      publishedAt: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
      title: "Next-Gen Open-Weight AI Models Match Frontier Reasoning Benchmarks",
      description: "Open-source artificial intelligence systems cross a new threshold as community benchmarks reveal parity with proprietary models on complex logic and mathematics evaluations.",
      content: "Developers and researchers worldwide are analyzing the latest release of open-weight neural networks that dramatically reduce the compute barrier for high-reasoning tasks.",
      source: { name: "AI Tech Chronicle", url: "https://example.com/ai-benchmark" },
      image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80",
      publishedAt: new Date(Date.now() - 3600000 * 5).toISOString()
    },
    {
      title: "Global Clean Energy Grid Adopts Next-Generation Solid-State Battery Tech",
      description: "Automakers and grid operators begin large-scale deployments of solid-state lithium ceramic batteries, promising 3x energy density and zero thermal runaway risk.",
      content: "Industrial scale production facilities opened today for solid-state batteries that could eliminate standard lithium-ion constraints.",
      source: { name: "Clean Tech Wire", url: "https://example.com/batteries" },
      image: "https://images.unsplash.com/photo-1509391365360-2e959784a276?w=1200&auto=format&fit=crop&q=80",
      publishedAt: new Date(Date.now() - 3600000 * 8).toISOString()
    }
  ],
  business: [
    {
      title: "Global Central Banks Coordinate Policy Amid Digital Currency Transition",
      description: "Monetary authorities align frameworks for cross-border wholesale central bank digital currency settlements to streamline international trade and currency flows.",
      content: "Governors from major central banks gathered today to finalize the interoperability protocol for international wholesale digital currency transactions.",
      source: { name: "Financial Markets Daily", url: "https://example.com/finance" },
      image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80",
      publishedAt: new Date(Date.now() - 3600000 * 3).toISOString()
    },
    {
      title: "Semiconductor Infrastructure Investments Hit Record High in Q3",
      description: "Worldwide capital expenditures into advanced fabrication plants and silicon lithography reach unprecedented levels as supply-chain sovereignty takes center stage.",
      content: "Quarterly economic reports highlight massive public-private investments across North America, Europe, and Asia into next-gen 2-nanometer fabrication lines.",
      source: { name: "Global Commerce Herald", url: "https://example.com/semiconductors" },
      image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&auto=format&fit=crop&q=80",
      publishedAt: new Date(Date.now() - 3600000 * 6).toISOString()
    }
  ],
  science: [
    {
      title: "Deep Space Telescope Discovers Atmospheric Water Vapor on Nearby Exoplanet",
      description: "Spectroscopic observations confirm consistent water vapor and atmospheric methane signatures on a temperate terrestrial planet located 42 light-years away.",
      content: "Astrophysicists analyzing infrared spectrometer readings from the orbital space observatory confirmed distinct atmospheric absorptions on habitable-zone planet candidate K2-18.",
      source: { name: "Astrophysical Journal", url: "https://example.com/space" },
      image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80",
      publishedAt: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
      title: "Synthetic Biology Team Synthesizes Self-Healing Biodegradable Polymer",
      description: "Bioengineers engineer bacterial enzymes that produce elastic polymer materials capable of repairing structural tears upon exposure to sunlight and ambient humidity.",
      content: "A university laboratory unveiled a new class of enzymatic bio-plastics that decompose safely in marine environments within six weeks while offering industrial strength.",
      source: { name: "Science Frontier", url: "https://example.com/bio-materials" },
      image: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1200&auto=format&fit=crop&q=80",
      publishedAt: new Date(Date.now() - 3600000 * 7).toISOString()
    }
  ],
  general: [
    {
      title: "International Climate Summit Concludes With Binding Clean Maritime Accords",
      description: "Delegates from over 120 nations sign a historic agreement mandating zero-emission cargo shipping corridors and green hydrogen bunkering across global maritime routes.",
      content: "The global maritime pact represents one of the largest coordinated industrial decarbonization efforts in history, setting mandatory emission caps for ocean freight.",
      source: { name: "Global News Wire", url: "https://example.com/maritime" },
      image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&auto=format&fit=crop&q=80",
      publishedAt: new Date(Date.now() - 3600000 * 1).toISOString()
    },
    {
      title: "High-Speed Rail Corridor Expansion Connects Metropolitan Hubs Ahead of Schedule",
      description: "Civil infrastructure teams celebrate early completion of a 400-mile zero-emission bullet train corridor that cuts intercity travel times by more than 60 percent.",
      content: "Passenger transit operations commenced this morning with electric high-speed trainsets cruising at 220 miles per hour between major regional economies.",
      source: { name: "Infrastructure Today", url: "https://example.com/transit" },
      image: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=1200&auto=format&fit=crop&q=80",
      publishedAt: new Date(Date.now() - 3600000 * 4).toISOString()
    }
  ]
};

/**
 * Retrieve fallback articles for a given topic or category
 */
const getFallbackArticles = (topicOrCategory = "general") => {
  const key = (topicOrCategory || "general").toLowerCase();
  const list = FALLBACK_ARTICLES[key] || FALLBACK_ARTICLES.general;
  return list.map((item) => normalizeArticle(item, key));
};

/**
 * Fetch top headlines by category
 */
export const getTopHeadlines = async (category = "general", max = 9) => {
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    console.warn("[NewsService] GNEWS_API_KEY missing, using curated headlines");
    return getFallbackArticles(category);
  }

  try {
    const validCategory = [
      "general",
      "world",
      "nation",
      "business",
      "technology",
      "entertainment",
      "sports",
      "science",
      "health"
    ].includes(category.toLowerCase())
      ? category.toLowerCase()
      : "general";

    const response = await axios.get(`${GNEWS_BASE_URL}/top-headlines`, {
      params: {
        category: validCategory,
        lang: "en",
        max: Math.min(Math.max(max, 1), 10),
        apikey: apiKey
      },
      timeout: 8000
    });

    const articles = response.data?.articles;
    if (!Array.isArray(articles) || articles.length === 0) {
      console.warn(`[NewsService] No articles returned for category "${category}", using fallback.`);
      return getFallbackArticles(category);
    }

    return articles.map((art) => normalizeArticle(art, category));
  } catch (error) {
    console.error("[NewsService] Error fetching top headlines:", error.response?.data?.errors || error.message);
    return getFallbackArticles(category);
  }
};

/**
 * Search articles by query keyword
 */
export const searchNews = async (query = "technology", max = 9) => {
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    console.warn("[NewsService] GNEWS_API_KEY missing, using fallback news");
    return getFallbackArticles(query);
  }

  try {
    const trimmed = (query || "technology").trim();
    const response = await axios.get(`${GNEWS_BASE_URL}/search`, {
      params: {
        q: trimmed,
        lang: "en",
        max: Math.min(Math.max(max, 1), 10),
        apikey: apiKey
      },
      timeout: 8000
    });

    const articles = response.data?.articles;
    if (!Array.isArray(articles) || articles.length === 0) {
      console.warn(`[NewsService] No search results for "${query}", using fallback.`);
      return getFallbackArticles(query);
    }

    return articles.map((art) => normalizeArticle(art, query));
  } catch (error) {
    console.error("[NewsService] Search error:", error.response?.data?.errors || error.message);
    return getFallbackArticles(query);
  }
};

/**
 * Backward-compatible helper method
 */
export const getNews = async (topic) => {
  return searchNews(topic || "Technology", 6);
};
