import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const cache = new Map();
const CACHE_DURATION = 1000 * 60 * 60;

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

router.post("/align", async (req, res) => {
  try {
    const { title, episodes, totalChapters } = req.body;

    if (!title || !episodes) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const cacheKey = `align-${title}-${episodes}`;
    const cached = getCache(cacheKey);
    if (cached) {
      return res.json({ source: "cache", answer: cached });
    }

    if (!genAI) {
      throw new Error("No AI key");
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `Given that the anime "${title}" has ${episodes} episodes, identify the manga chapter where it ends. Respond: "Start from Chapter X."`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10000)
      )
    ]);

    const text = result.response.text();

    setCache(cacheKey, text);

    res.json({
      source: "ai",
      answer: text
    });

  } catch {
    let fallback = episodes * 2;
    if (fallback > totalChapters) {
      fallback = Math.max(totalChapters - 5, 1);
    }

    res.json({
      source: "fallback",
      answer: `Start from Chapter ${fallback}.`
    });
  }
});

export default router;
