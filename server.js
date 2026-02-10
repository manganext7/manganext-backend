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

/* ---------------- API ROUTES ---------------- */
app.use("/api/recommend", recommendRoute);
app.use("/api/anilist", anilistRoute);
app.use("/api/ai", aiRoute);
app.use("/api/mangadex", mangadexRoute);
app.use("/api/home", homeRoute);

/* ---------------- SEO ROUTES ---------------- */

/**
 * WATCH ANIME SEO PAGE
 * Example: /watch/jujutsu-kaisen
 */
app.get("/watch/:anime/:episode?", (req, res) => {
  const { anime, episode } = req.params;

  const ep = episode?.replace("episode-", "") || "1";

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Watch Anime Episode ${ep} Online | MangaNext</title>
  <meta name="description" content="Watch anime episode ${ep} online in HD. Track progress on MangaNext." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://manganext-backend.onrender.com/watch/${anime}/episode-${ep}" />
</head>
<body>

<h1>Watch Anime Episode ${ep}</h1>

<p>
Watch episode ${ep} online in HD quality.
MangaNext helps you track anime and continue the story in manga.
</p>

<script>
  // Redirect real users to Netlify UI
  window.location.replace(
    "https://manganext.netlify.app/watch.html?id=${anime}&ep=${ep}"
  );
</script>

</body>
</html>
`);
});


/**
 * READ MANGA SEO PAGE
 * Example: /read/jujutsu-kaisen
 */
app.get("/read/:manga", async (req, res) => {
  const mangaSlug = req.params.manga;
  const mangaTitle = mangaSlug
    .replace(/-/g, " ")
    .replace(/\b\w/g, l => l.toUpperCase());

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Read ${mangaTitle} Manga Online | MangaNext</title>
      <meta name="description" content="Read ${mangaTitle} manga online. Latest chapters updated fast on MangaNext." />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href="https://manganext.site/read/${mangaSlug}" />
    </head>
    <body>
      <h1>Read ${mangaTitle} Manga Online</h1>

      <p>
        Read ${mangaTitle} manga online with high-quality scans.
        MangaNext provides fast updates and smooth reading experience.
      </p>

      <div id="app"></div>

      <script>
        window.__MANGA_SLUG__ = "${mangaSlug}";
      </script>
      <script src="/read.js"></script>
    </body>
    </html>
  `);
});

/* ---------------- SITEMAP ---------------- */
app.use("/", sitemapRoute);

/* ---------------- ROOT ---------------- */
app.get("/", (req, res) => {
  res.send("MangaNext API & SEO server is running 🚀");
});

/* ---------------- SERVER ---------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
