import express from "express";
import axios from "axios";

const router = express.Router();

router.get("/chapters/:mangaId", async (req, res) => {
  try {
    const { mangaId } = req.params;

    const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc`;

    const response = await axios.get(url);

    const chapters = response.data.data.map(ch => ({
      id: ch.id,
      chapter: ch.attributes.chapter,
      title: ch.attributes.title
    }));

    res.json(chapters);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "MangaDex fetch failed" });
  }
});

export default router;
