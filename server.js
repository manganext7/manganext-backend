import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import anilistRoute from "./routes/anilist.js";
import aiRoute from "./routes/ai.js";
import mangadexRoute from "./routes/mangadex.js";

import homeRoute from "./routes/home.js";

import recommendRoute from "./routes/recommend.js";

import sitemapRoute from "./routes/sitemap.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/recommend", recommendRoute);
app.use("/", sitemapRoute);

app.use("/api/anilist", anilistRoute);
app.use("/api/ai", aiRoute);
app.use("/api/mangadex", mangadexRoute);
app.use("/api/home", homeRoute);
app.get("/", (req, res) => {
  res.send("MangaNext API is running 🚀");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
