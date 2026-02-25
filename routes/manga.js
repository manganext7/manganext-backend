import express from "express";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();
const ANILIST_URL = "https://graphql.anilist.co";

const genAI = process.env.GOOGLE_AI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
  : null;

/* ===============================
   SIMPLE CACHE
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
   MANGA DETAILS
================================ */

router.get("/:slug", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    const cacheKey = `manga-${slug}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const searchTerm = slug.replace(/-/g, " ");

    const query = `
      query ($search: String) {
        Media(search: $search, type: MANGA) {
          id
          title { romaji english native }
          description(asHtml: false)
          coverImage { large }
          genres
          chapters
          volumes
          status
          averageScore
          popularity
        }
      }
    `;

    const response = await safeAniListQuery(query, { search: searchTerm });
    const manga = response.data.data.Media;

    if (!manga) {
      return res.status(404).json({ error: "Manga not found" });
    }

    let uniqueDescription = manga.description;

    // Generate AI summary once
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `Write a short 120-word engaging SEO summary for the manga "${manga.title.romaji}".`;

        const result = await model.generateContent(prompt);
        uniqueDescription = result.response.text();
      } catch {
        // fail silently
      }
    }

    const finalData = {
      ...manga,
      uniqueDescription,
      slug
    };

    setCache(cacheKey, finalData);
    res.json(finalData);

  } catch (error) {
    console.error("Manga fetch error:", error.message);
    res.status(500).json({ error: "Failed to fetch manga details" });
  }
});

/* ===============================
   CHAPTER DETAILS
================================ */

router.get("/:slug/chapter/:number", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    const chapterNum = parseInt(req.params.number);
    const cacheKey = `manga-${slug}-ch-${chapterNum}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const searchTerm = slug.replace(/-/g, " ");

    const query = `
      query ($search: String) {
        Media(search: $search, type: MANGA) {
          id
          title { romaji english }
          chapters
        }
      }
    `;

    const response = await safeAniListQuery(query, { search: searchTerm });
    const manga = response.data.data.Media;

    let chapterData = null;

    // MangaDex fetch (safe + timeout protected)
    try {
      const mdSearch = await axios.get(
        "https://api.mangadex.org/manga",
        {
          params: { title: manga.title.english || manga.title.romaji, limit: 1 },
          timeout: 8000
        }
      );

      if (mdSearch.data.data.length > 0) {
        const mangaId = mdSearch.data.data[0].id;

        const chapterRes = await axios.get(
          `https://api.mangadex.org/manga/${mangaId}/feed`,
          {
            params: {
              chapter: chapterNum,
              translatedLanguage: ["en"],
              limit: 1
            },
            timeout: 8000
          }
        );

        if (chapterRes.data.data.length > 0) {
          chapterData = chapterRes.data.data[0];
        }
      }
    } catch {
      // MangaDex failure shouldn't break page
    }

    const result = {
      manga,
      chapter: {
        number: chapterNum,
        title: chapterData?.attributes?.title || `Chapter ${chapterNum}`,
        pages: chapterData?.attributes?.pages || 0,
        publishAt: chapterData?.attributes?.publishAt,
        chapterId: chapterData?.id,
        slug
      }
    };

    setCache(cacheKey, result);
    res.json(result);

  } catch (error) {
    res.status(500).json({ error: "Failed to fetch chapter details" });
  }
});

/* ===============================
   SIMILAR MANGA
================================ */

router.get("/:slug/similar", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    const cacheKey = `similar-manga-${slug}`;

    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const searchTerm = slug.replace(/-/g, " ");

    const originalQuery = `
      query ($search: String) {
        Media(search: $search, type: MANGA) {
          id
          genres
        }
      }
    `;

    const originalRes = await safeAniListQuery(originalQuery, { search: searchTerm });
    const original = originalRes.data.data.Media;

    if (!original) {
      return res.status(404).json({ error: "Manga not found" });
    }

    const similarQuery = `
      query ($genres: [String], $excludeId: Int) {
        Page(perPage: 15) {
          media(type: MANGA, genre_in: $genres, id_not: $excludeId) {
            id
            title { romaji english }
            coverImage { large }
            averageScore
          }
        }
      }
    `;

    const similarRes = await safeAniListQuery(similarQuery, {
      genres: original.genres.slice(0, 3),
      excludeId: original.id
    });

    const result = {
      similar: similarRes.data.data.Page.media,
      slug
    };

    setCache(cacheKey, result);
    res.json(result);

  } catch {
    res.status(500).json({ error: "Failed to fetch similar manga" });
  }
});

/* ===============================
   CHAPTER RELEASE ESTIMATE
================================ */

router.get("/:slug/chapter/:number/release", async (req, res) => {
  try {
    const slug = cleanSlug(req.params.slug);
    const chapterNum = parseInt(req.params.number);

    const searchTerm = slug.replace(/-/g, " ");

    const query = `
      query ($search: String) {
        Media(search: $search, type: MANGA) {
          title { romaji english }
          status
          chapters
        }
      }
    `;

    const response = await safeAniListQuery(query, { search: searchTerm });
    const manga = response.data.data.Media;

    const isReleased = chapterNum <= (manga?.chapters || 0);

    const result = {
      chapterNumber: chapterNum,
      isReleased,
      manga: {
        title: manga?.title,
        status: manga?.status,
        totalChapters: manga?.chapters
      }
    };

    res.json(result);

  } catch {
    res.status(500).json({ error: "Failed to fetch release info" });
  }
});

export default router;
