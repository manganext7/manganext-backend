import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

/* ===============================
   SIMPLE CACHE
================================ */

const cache = new Map();
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

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
   SIMPLE RATE LIMIT (FREE SAFE)
================================ */

let lastRequestTime = 0;
const MIN_INTERVAL = 3000; // 3 seconds between AI calls

/* ===============================
   POST RECOMMENDATION
================================ */

router.post("/", async (req, res) => {
  try {
    const { title, type, genres, progress } = req.body;

    // Basic validation
    if (!title || typeof title !== "string") {
      return res.status(400).json({
        source: "error",
        recommendation: "Invalid request"
      });
    }

    const cleanTitle = title.substring(0, 100);
    const cleanGenres = Array.isArray(genres)
      ? genres.slice(0, 5).join(", ")
      : "Unknown";

    const cacheKey = `rec-${cleanTitle}-${type || ""}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return res.json({
        source: "cache",
        recommendation: cached
      });
    }

    // If no AI key, fallback immediately
    if (!genAI) {
      return res.json({
        source: "fallback",
        recommendation:
          "Try exploring other top-rated titles in the same genre for a similar experience."
      });
    }

    // Simple rate control
    const now = Date.now();
    if (now - lastRequestTime < MIN_INTERVAL) {
      return res.json({
        source: "rate-limited",
        recommendation:
          "Explore similar trending titles in this genre while we prepare your personalized recommendation."
      });
    }

    lastRequestTime = now;

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
You are an anime and manga expert.

User finished:
Title: ${cleanTitle}
Type: ${type || "Unknown"}
Genres: ${cleanGenres}
Progress: ${progress || "Unknown"}

Recommend:
1 manga to read next
1 anime similar in tone

Rules:
- Maximum 3 short lines
- No spoilers
- Confident suggestions
`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AI timeout")), 10000)
      )
    ]);

    const text = result.response.text().substring(0, 500);

    setCache(cacheKey, text);

    res.json({
      source: "ai",
      recommendation: text
    });

  } catch (err) {
    res.json({
      source: "fallback",
      recommendation:
        "If you enjoyed this, try exploring other popular titles within the same genre for a similar experience."
    });
  }
});

export default router;
