import express from "express";
import axios from "axios";

const router = express.Router();

const ANILIST_URL = "https://graphql.anilist.co";
const BASE_URL = "https://manganext-backend.onrender.com";

// Simple in-memory cache (safe for free plan)
let sitemapCache = null;
let lastGenerated = 0;
const CACHE_DURATION = 1000 * 60 * 30; // 30 minutes

router.get("/sitemap.xml", async (req, res) => {
  try {

    // Serve cached sitemap if still valid
    if (sitemapCache && Date.now() - lastGenerated < CACHE_DURATION) {
      res.set("Content-Type", "application/xml");
      return res.send(sitemapCache);
    }

    const now = new Date().toISOString();

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

<url>
  <loc>${BASE_URL}</loc>
  <lastmod>${now}</lastmod>
  <changefreq>daily</changefreq>
  <priority>1.0</priority>
</url>
`;

    /* ===============================
       FETCH TOP 50 MANGA ONLY
    =============================== */

    const mangaQuery = `
      query {
        Page(page: 1, perPage: 50) {
          media(type: MANGA, sort: POPULARITY_DESC) {
            title { romaji english }
            chapters
          }
        }
      }
    `;

    const mangaRes = await axios.post(ANILIST_URL, { query: mangaQuery });
    const mangaList = mangaRes.data.data.Page.media;

    for (const manga of mangaList) {
      const slug = createSlug(manga.title.english || manga.title.romaji);

      sitemap += `
<url>
  <loc>${BASE_URL}/manga/${slug}</loc>
  <changefreq>daily</changefreq>
  <priority>0.9</priority>
</url>
`;

      if (manga.chapters) {
        const maxCh = Math.min(manga.chapters, 10); // Only last 10
        for (let i = maxCh; i >= 1; i--) {
          sitemap += `
<url>
  <loc>${BASE_URL}/manga/${slug}/chapter-${i}</loc>
  <changefreq>weekly</changefreq>
  <priority>0.6</priority>
</url>
`;
        }
      }
    }

    /* ===============================
       FETCH TOP 50 ANIME ONLY
    =============================== */

    const animeQuery = `
      query {
        Page(page: 1, perPage: 50) {
          media(type: ANIME, sort: POPULARITY_DESC) {
            title { romaji english }
            episodes
          }
        }
      }
    `;

    const animeRes = await axios.post(ANILIST_URL, { query: animeQuery });
    const animeList = animeRes.data.data.Page.media;

    for (const anime of animeList) {
      const slug = createSlug(anime.title.english || anime.title.romaji);

      sitemap += `
<url>
  <loc>${BASE_URL}/anime/${slug}</loc>
  <changefreq>daily</changefreq>
  <priority>0.9</priority>
</url>
`;

      if (anime.episodes) {
        const maxEp = Math.min(anime.episodes, 10); // Only last 10
        for (let i = maxEp; i >= 1; i--) {
          sitemap += `
<url>
  <loc>${BASE_URL}/anime/${slug}/episode-${i}</loc>
  <changefreq>weekly</changefreq>
  <priority>0.6</priority>
</url>
`;
        }
      }
    }

    /* ===============================
       GENRES (Static)
    =============================== */

    const genres = [
      "action","adventure","comedy","drama",
      "fantasy","horror","romance","sci-fi",
      "slice-of-life","sports","thriller"
    ];

    for (const genre of genres) {
      sitemap += `
<url>
  <loc>${BASE_URL}/genre/${genre}</loc>
  <changefreq>weekly</changefreq>
  <priority>0.7</priority>
</url>
`;
    }

    sitemap += `
</urlset>`;

    // Cache it
    sitemapCache = sitemap;
    lastGenerated = Date.now();

    res.set("Content-Type", "application/xml");
    res.send(sitemap);

  } catch (error) {
    console.error("Sitemap error:", error.message);
    res.status(500).send("Sitemap generation failed");
  }
});

/* ===============================
   ROBOTS.TXT
================================ */

router.get("/robots.txt", (req, res) => {
  const robots = `
User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${BASE_URL}/sitemap.xml
`;

  res.set("Content-Type", "text/plain");
  res.send(robots);
});

/* ===============================
   HELPER
================================ */

function createSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default router;
