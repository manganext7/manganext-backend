import express from "express";
import axios from "axios";

const router = express.Router();
const ANILIST_URL = "https://graphql.anilist.co";

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
   SEARCH
================================ */

router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").substring(0, 100);
    if (!q) return res.json([]);

    const cacheKey = `search-${q}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const gqlQuery = `
      query ($search: String) {
        Page(perPage: 20) {
          media(search: $search) {
            id
            type
            format
            episodes
            chapters
            averageScore
            title { romaji english }
            coverImage { large medium }
          }
        }
      }
    `;

    const response = await axios.post(
      ANILIST_URL,
      { query: gqlQuery, variables: { search: q } },
      { timeout: 10000 }
    );

    const data = response.data.data.Page.media;

    setCache(cacheKey, data);
    res.json(data);

  } catch (err) {
    res.status(500).json([]);
  }
});

/* ===============================
   GET MEDIA BY ID
================================ */

router.get("/media/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    const cacheKey = `media-${id}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const query = `
      query ($id: Int) {
        Media(id: $id) {
          id
          type
          title { romaji english }
          description(asHtml: true)
          coverImage { extraLarge }
          bannerImage
          episodes
          chapters
          averageScore
          status
        }
      }
    `;

    const response = await axios.post(
      ANILIST_URL,
      { query, variables: { id } },
      { timeout: 10000 }
    );

    const data = response.data.data.Media;

    setCache(cacheKey, data);
    res.json(data);

  } catch {
    res.status(500).json({ error: "Failed to fetch media details" });
  }
});

export default router;
