import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post("/align", async (req, res) => {
  const { title, episodes, totalChapters } = req.body;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
      Given that the anime "${title}" has ${episodes} episodes,
      identify the manga chapter where the anime ends.
      Answer in one short sentence only:
      "Start from Chapter X."
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({
      source: "ai",
      answer: text
    });
  } catch (error) {
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
