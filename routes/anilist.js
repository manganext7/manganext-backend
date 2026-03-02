import express from "express";
import axios from "axios";

const router = express.Router();
const ANILIST_URL = "https://graphql.anilist.co";

/* ===============================
   SIMPLE CACHE
================================ */

const cache = new Map(); // CHANGED: Keep in-memory cache while adding headers and logging
const CACHE_DURATION = 1000 * 60 * 20; // 20 minutes // CHANGED: Clarify cache duration usage

function getCache(key) { // CHANGED: Reuse cache helper for ETag logic later
  const data = cache.get(key); // CHANGED: Read cached entry
  if (!data) return null; // CHANGED: Fast return when no cache
  if (Date.now() - data.timestamp > CACHE_DURATION) { // CHANGED: Expire stale cache
    cache.delete(key); // CHANGED: Cleanup expired entry
    return null; // CHANGED: Indicate cache miss after expiry
  }
  return data.value; // CHANGED: Return cached payload
}

function setCache(key, value) { // CHANGED: Centralize cache writes
  cache.set(key, { value, timestamp: Date.now() }); // CHANGED: Store payload with timestamp
}

/* ===============================
   SEARCH
================================ */

router.get("/search", async (req, res) => { // CHANGED: Add basic ETag/Last-Modified headers
  try {
    const q = (req.query.q || "").substring(0, 100);
    if (!q) return res.json([]);

    const cacheKey = `search-${q}`; // CHANGED: Stable cache key per query
    const cached = getCache(cacheKey); // CHANGED: Reuse cache helper
    if (cached) { // CHANGED: Serve cached with headers
      res.setHeader("ETag", `"anilist-search-${q.length}"`); // CHANGED: Weak ETag based on query size
      res.setHeader("Last-Modified", new Date(cache.get(cacheKey).timestamp).toUTCString()); // CHANGED: Reflect cache timestamp
      return res.json(cached); // CHANGED: Return cached response
    }

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

    const response = await axios.post( // CHANGED: Fetch fresh data from AniList
      ANILIST_URL, // CHANGED: Target AniList GraphQL endpoint
      { query: gqlQuery, variables: { search: q } }, // CHANGED: Pass search variables
      { timeout: 10000 } // CHANGED: Keep 10s timeout
    );

    const data = response.data.data.Page.media; // CHANGED: Extract media list

    setCache(cacheKey, data); // CHANGED: Cache fresh response
    res.setHeader("ETag", `"anilist-search-${q.length}"`); // CHANGED: Set ETag for client caching
    res.setHeader("Last-Modified", new Date().toUTCString()); // CHANGED: Indicate freshness time
    res.json(data); // CHANGED: Send JSON payload

  } catch (err) {
    console.error("AniList /search error:", err.message); // CHANGED: Log AniList failures for debugging
    res.status(500).json([]); // CHANGED: Return empty array on failure
  }
});

/* ===============================
   GET MEDIA BY ID
================================ */

router.get("/media/:id", async (req, res) => { // CHANGED: Enhance media endpoint with genres and logging
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    const cacheKey = `media-${id}`; // CHANGED: Stable key per media id
    const cached = getCache(cacheKey); // CHANGED: Use cache helper
    if (cached) { // CHANGED: Serve cached entry with headers
      res.setHeader("ETag", `"anilist-media-${id}"`); // CHANGED: ETag per media id
      res.setHeader("Last-Modified", new Date(cache.get(cacheKey).timestamp).toUTCString()); // CHANGED: Cache timestamp as last modified
      return res.json(cached); // CHANGED: Early return with cached payload
    }

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
          genres
          averageScore
          status
        }
      }
    `;

    const response = await axios.post( // CHANGED: Call AniList with media query
      ANILIST_URL, // CHANGED: Reuse AniList endpoint
      { query, variables: { id } }, // CHANGED: Supply id variable
      { timeout: 10000 } // CHANGED: Preserve timeout
    );

    const data = response.data.data.Media; // CHANGED: Extract Media object

    setCache(cacheKey, data); // CHANGED: Cache media response
    res.setHeader("ETag", `"anilist-media-${id}"`); // CHANGED: Set ETag for this media
    res.setHeader("Last-Modified", new Date().toUTCString()); // CHANGED: Mark last modified time
    res.json(data); // CHANGED: Send JSON to client

  } catch (err) {
    console.error("AniList /media/:id error:", err.message); // CHANGED: Log error for observability
    res.status(500).json({ error: "Failed to fetch media details" }); // CHANGED: Preserve 500 with message
  }
});

export default router;
