import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post("/", async (req, res) => {
  const { title, type, genres, progress } = req.body;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
You are an anime and manga expert.

User just finished:
Title: ${title}
Type: ${type}
Genres: ${genres?.join(", ") || "Unknown"}
Progress: ${progress || "Unknown"}

Recommend:
1. One manga to read next
2. One anime similar in tone

Rules:
- Keep response under 4 lines
- No spoilers
- Clear, confident suggestions
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({
      source: "ai",
      recommendation: text
    });
  } catch (err) {
    res.json({
      source: "fallback",
      recommendation:
        "If you enjoyed this, try exploring similar high-rated manga in the same genre."
    });
  }
});

export default router;
