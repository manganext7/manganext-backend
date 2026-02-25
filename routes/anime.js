import express from "express";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();
const ANILIST_URL = "https://graphql.anilist.co";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

/* ===============================
   SIMPLE CACHE (FREE PLAN SAFE)
================================ */

const cache = new Map();
const CACHE_DURATION = 1000 * 60 * 20; // 20 minutes

function getCache(key) {
  const data = cache.get(key);
  if (!data) return null;
  if (Date.now() - data.timestamp > CACHE_DURATION) {
    cache.delete(key);
    return null;
  }
  return data.value;
}

function setCache(key, value) {
  cache.set(key, { value, timestamp: Date.now() });
}

/* ===============================
   HELPERS
================================ */

function cleanSlug(slug) {
  return slug.replace(/[^a-z0-9-]/gi, "");
}

async function safeAniListQuery(query, variables = {}) {
  return axios.post(
    ANILIST_URL,
    { query, variables },
    { timeout: 10000 }
  );
}

/* ===============================
   ANIME DETAILS
================================ */

router.get("/:slug", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    const cacheKey = `anime-${slug}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const searchTerm = slug.replace(/-/g, " ");

    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          id
          title { romaji english native }
          description(asHtml: false)
          coverImage { large }
          bannerImage
          genres
          episodes
          status
          averageScore
          popularity
          season
          seasonYear
        }
      }
    `;

    const response = await safeAniListQuery(query, { search: searchTerm });
    const anime = response.data.data.Media;

    if (!anime) {
      return res.status(404).json({ error: "Anime not found" });
    }

    let uniqueDescription = anime.description;

    // Generate AI description only once and cache it
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `Write a short 120-word engaging summary of the anime "${anime.title.romaji}". Make it unique and SEO friendly.`;

        const result = await model.generateContent(prompt);
        uniqueDescription = result.response.text();
      } catch {
        // silently fail
      }
    }

    const finalData = {
      ...anime,
      uniqueDescription,
      slug
    };

    setCache(cacheKey, finalData);
    res.json(finalData);

  } catch (error) {
    console.error("Anime fetch error:", error.message);
    res.status(500).json({ error: "Failed to fetch anime details" });
  }
});

/* ===============================
   EPISODE DETAILS
================================ */

router.get("/:slug/episode/:number", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    const episodeNum = parseInt(req.params.number);
    const cacheKey = `anime-${slug}-ep-${episodeNum}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const searchTerm = slug.replace(/-/g, " ");

    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          id
          title { romaji english }
          episodes
          status
        }
      }
    `;

    const response = await safeAniListQuery(query, { search: searchTerm });
    const anime = response.data.data.Media;

    const result = {
      anime,
      episode: {
        number: episodeNum,
        isAired: episodeNum <= (anime?.episodes || 0),
        slug
      }
    };

    setCache(cacheKey, result);
    res.json(result);

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch episode" });
  }
});

/* ===============================
   CONTINUE MANGA
================================ */

router.get("/:slug/continue-manga", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    const cacheKey = `continue-${slug}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const searchTerm = slug.replace(/-/g, " ");

    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          title { romaji english }
          episodes
          relations {
            edges {
              relationType
              node {
                type
                title { romaji english }
                chapters
              }
            }
          }
        }
      }
    `;

    const response = await safeAniListQuery(query, { search: searchTerm });
    const anime = response.data.data.Media;

    const mangaSource = anime?.relations?.edges?.find(
      e => e.node.type === "MANGA"
    );

    let result;

    if (mangaSource) {
      const estimatedChapter = Math.ceil((anime.episodes || 12) * 2.5);

      result = {
        anime: anime.title,
        manga: {
          title: mangaSource.node.title,
          totalChapters: mangaSource.node.chapters,
          continueFromChapter: estimatedChapter,
          isEstimate: true
        },
        slug
      };
    } else {
      result = {
        anime: anime?.title,
        manga: null,
        slug
      };
    }

    setCache(cacheKey, result);
    res.json(result);

  } catch {
    res.status(500).json({ error: "Failed to fetch continuation info" });
  }
});

/* ===============================
   SIMILAR ANIME
================================ */

router.get("/:slug/similar", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    const cacheKey = `similar-${slug}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const searchTerm = slug.replace(/-/g, " ");

    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          id
          genres
        }
      }
    `;

    const original = await safeAniListQuery(query, { search: searchTerm });
    const media = original.data.data.Media;

    if (!media) {
      return res.status(404).json({ error: "Anime not found" });
    }

    const similarQuery = `
      query ($genres: [String], $excludeId: Int) {
        Page(perPage: 15) {
          media(type: ANIME, genre_in: $genres, id_not: $excludeId) {
            id
            title { romaji english }
            coverImage { large }
            averageScore
          }
        }
      }
    `;

    const similar = await safeAniListQuery(similarQuery, {
      genres: media.genres.slice(0, 3),
      excludeId: media.id
    });

    const result = {
      similar: similar.data.data.Page.media,
      slug
    };

    setCache(cacheKey, result);
    res.json(result);

  } catch {
    res.status(500).json({ error: "Failed to fetch similar anime" });
  }
});

/* ===============================
   SEASONAL
================================ */

router.get("/seasonal/:season/:year", async (req, res) => {
  try {
    const { season, year } = req.params;
    const page = parseInt(req.query.page) || 1;

    const query = `
      query ($season: MediaSeason, $year: Int, $page: Int) {
        Page(page: $page, perPage: 20) {
          media(type: ANIME, season: $season, seasonYear: $year) {
            id
            title { romaji english }
            coverImage { large }
            averageScore
          }
        }
      }
    `;

    const response = await safeAniListQuery(query, {
      season: season.toUpperCase(),
      year: parseInt(year),
      page
    });

    res.json(response.data.data.Page);

  } catch {
    res.status(500).json({ error: "Failed to fetch seasonal anime" });
  }
});

export default router;
