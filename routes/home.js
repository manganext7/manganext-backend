import express from "express";
import axios from "axios";

const router = express.Router();
const ANILIST_URL = "https://graphql.anilist.co";

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

async function safeQuery(query, variables = {}) {
  return axios.post(
    ANILIST_URL,
    { query, variables },
    { timeout: 10000 }
  );
}

/* ===============================
   HERO TRENDING ANIME
================================ */

router.get("/hero", async (req, res) => {
  try {
    const cacheKey = "hero";
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      query {
        Page(perPage: 10) {
          media(type: ANIME, sort: TRENDING_DESC) {
            id
            title { romaji english }
            bannerImage
            coverImage { extraLarge }
            episodes
            status
            averageScore
          }
        }
      }
    `;

    const response = await safeQuery(query);
    const data = response.data.data.Page.media;

    setCache(cacheKey, data);
    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed to fetch hero anime" });
  }
});

/* ===============================
   TRENDING ANIME
================================ */

router.get("/trending", async (req, res) => {
  try {
    const cacheKey = "trending-anime";
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      query {
        Page(perPage: 15) {
          media(type: ANIME, sort: TRENDING_DESC) {
            id
            title { romaji english }
            coverImage { large }
            averageScore
          }
        }
      }
    `;

    const response = await safeQuery(query);
    const data = response.data.data.Page.media;

    setCache(cacheKey, data);
    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed to fetch trending anime" });
  }
});

/* ===============================
   TRENDING MANGA
================================ */

router.get("/trending-manga", async (req, res) => {
  try {
    const cacheKey = "trending-manga";
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      query {
        Page(perPage: 15) {
          media(type: MANGA, sort: TRENDING_DESC) {
            id
            title { romaji english }
            coverImage { large }
            chapters
            averageScore
          }
        }
      }
    `;

    const response = await safeQuery(query);
    const data = response.data.data.Page.media;

    setCache(cacheKey, data);
    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed to fetch trending manga" });
  }
});

/* ===============================
   SEASONAL ANIME
================================ */

router.get("/seasonal-anime", async (req, res) => {
  try {
    const season = (req.query.season || "").toUpperCase();
    const year = parseInt(req.query.year);

    const validSeasons = ["WINTER", "SPRING", "SUMMER", "FALL"];
    if (!validSeasons.includes(season) || !year) {
      return res.status(400).json({ error: "Invalid season or year" });
    }

    const cacheKey = `seasonal-${season}-${year}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      query ($season: MediaSeason, $year: Int) {
        Page(perPage: 20) {
          media(type: ANIME, season: $season, seasonYear: $year, sort: TRENDING_DESC) {
            id
            title { romaji english }
            coverImage { large }
            episodes
            averageScore
          }
        }
      }
    `;

    const response = await safeQuery(query, { season, year });
    const data = response.data.data.Page.media;

    setCache(cacheKey, data);
    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed to fetch seasonal anime" });
  }
});

/* ===============================
   TOP ANIME / MANGA
================================ */

const allowedSorts = ["SCORE_DESC", "POPULARITY_DESC"];

router.get("/top-anime", async (req, res) => {
  try {
    const sort = allowedSorts.includes(req.query.sort)
      ? req.query.sort
      : "SCORE_DESC";

    const cacheKey = `top-anime-${sort}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      query ($sort: [MediaSort]) {
        Page(perPage: 20) {
          media(type: ANIME, sort: $sort) {
            id
            title { romaji english }
            coverImage { large }
            episodes
            averageScore
            popularity
          }
        }
      }
    `;

    const response = await safeQuery(query, { sort });
    const data = response.data.data.Page.media;

    setCache(cacheKey, data);
    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed to fetch top anime" });
  }
});

router.get("/top-manga", async (req, res) => {
  try {
    const sort = allowedSorts.includes(req.query.sort)
      ? req.query.sort
      : "SCORE_DESC";

    const cacheKey = `top-manga-${sort}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      query ($sort: [MediaSort]) {
        Page(perPage: 20) {
          media(type: MANGA, sort: $sort) {
            id
            title { romaji english }
            coverImage { large }
            chapters
            averageScore
            popularity
          }
        }
      }
    `;

    const response = await safeQuery(query, { sort });
    const data = response.data.data.Page.media;

    setCache(cacheKey, data);
    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed to fetch top manga" });
  }
});

/* ===============================
   LATEST
================================ */

router.get("/latest-anime", async (req, res) => {
  try {
    const cacheKey = "latest-anime";
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      query {
        Page(perPage: 20) {
          media(type: ANIME, sort: START_DATE_DESC) {
            id
            title { romaji english }
            coverImage { large }
            episodes
            averageScore
          }
        }
      }
    `;

    const response = await safeQuery(query);
    const data = response.data.data.Page.media;

    setCache(cacheKey, data);
    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed to fetch latest anime" });
  }
});

router.get("/latest-manga", async (req, res) => {
  try {
    const cacheKey = "latest-manga";
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      query {
        Page(perPage: 20) {
          media(type: MANGA, sort: UPDATED_AT_DESC) {
            id
            title { romaji english }
            coverImage { large }
            chapters
            averageScore
          }
        }
      }
    `;

    const response = await safeQuery(query);
    const data = response.data.data.Page.media;

    setCache(cacheKey, data);
    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed to fetch latest manga" });
  }
});

export default router;
