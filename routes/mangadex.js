import express from "express";
import axios from "axios";

const router = express.Router();

const cache = new Map();
const CACHE_DURATION = 1000 * 60 * 20;

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

router.get("/chapters/:mangaId", async (req, res) => {
  try {
    const { mangaId } = req.params;

    const cacheKey = `md-${mangaId}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const url = `https://api.mangadex.org/manga/${mangaId}/feed`;

    const response = await axios.get(url, {
      params: {
        translatedLanguage: ["en"],
        order: { chapter: "asc" },
        limit: 200
      },
      timeout: 10000
    });

    const chapters = response.data.data.map(ch => ({
      id: ch.id,
      chapter: ch.attributes.chapter,
      title: ch.attributes.title
    }));

    setCache(cacheKey, chapters);
    res.json(chapters);

  } catch {
    res.status(500).json({ error: "MangaDex fetch failed" });
  }
});

export default router;
