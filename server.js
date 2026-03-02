import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";

// Import Routes
import anilistRoute from "./routes/anilist.js";
import aiRoute from "./routes/ai.js";
import mangadexRoute from "./routes/mangadex.js";
import homeRoute from "./routes/home.js";
import recommendRoute from "./routes/recommend.js";
import sitemapRoute from "./routes/sitemap.js";
import mangaRoute from "./routes/manga.js";
import commentsRoute from "./routes/comments.js";
import animeRoute from "./routes/anime.js";
import axios from "axios";
dotenv.config();

const app = express();

/* ==========================================================================
   CONFIGURATION & MIDDLEWARE
   Optimized for Free Tier Hosting (Render/Netlify/Vercel)
========================================================================== */

// Trust the proxy (Required for Render/Heroku/Vercel)
app.set("trust proxy", 1);

// Security Headers
// Note: CSP is disabled because we use inline scripts for redirection.
// In a strict environment, we would use a 'nonce', but for this SEO proxy, false is acceptable.
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Gzip/Brotli Compression
app.use(compression());

// CORS Configuration
app.use(cors({
  origin: ["https://manganext.netlify.app", "http://localhost:3000"],
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json()); // CHANGED: Keep JSON parsing before API middleware

app.use((req, res, next) => { // NEW: Add generic ETag and Last-Modified headers for API responses
  if (req.path.startsWith("/api/")) { // NEW: Scope caching headers to /api namespace
    res.setHeader("ETag", `"api-${req.method}-${req.path.length}"`); // NEW: Weak ETag based on method and path length
    res.setHeader("Last-Modified", new Date().toUTCString()); // NEW: Conservative last-modified timestamp
  }
  next(); // NEW: Delegate to subsequent handlers
});

/* ==========================================================================
   CONSTANTS
========================================================================== */

const SITE_URL = "https://manganext-backend.onrender.com";
const FRONTEND_URL = "https://manganext.netlify.app";
const SITE_NAME = "MangaNext";

/* ==========================================================================
   HELPER FUNCTIONS
========================================================================== */

/**
 * Sanitizes the slug to prevent XSS and ensure URL safety.
 * Must stay in sync with frontend slugify.
 */
function cleanSlug(slug) { // CHANGED: Align slug logic with frontend implementation
  if (!slug) return ""; // CHANGED: Guard against falsy values
  return slug // CHANGED: Normalize input then transform
    .toString() // CHANGED: Ensure string operations
    .toLowerCase() // CHANGED: Lowercase for SEO-friendly URLs
    .trim() // CHANGED: Remove stray whitespace
    .replace(/[^a-z0-9]+/g, "-") // CHANGED: Replace non-alphanumerics with hyphens
    .replace(/(^-|-$)/g, ""); // CHANGED: Trim leading and trailing hyphens
}

/**
 * Formats a slug into a readable title.
 * e.g., "attack-on-titan" -> "Attack On Titan"
 */
function formatTitle(slug) {
  if (!slug) return "Unknown Title";
  return cleanSlug(slug)
    .replace(/-/g, " ")
    .replace(/\b\w/g, l => l.toUpperCase());
}

function escapeAttr(str = "") { // NEW: Escape dynamic strings for safe HTML attributes
  return String(str) // NEW: Coerce to string defensively
    .replace(/&/g, "&amp;") // NEW: Escape ampersands
    .replace(/"/g, "&quot;") // NEW: Escape double quotes
    .replace(/</g, "&lt;") // NEW: Escape less-than
    .replace(/>/g, "&gt;"); // NEW: Escape greater-than
}

/**
 * Sets standard SEO headers for caching.
 * Caches content for 30 minutes (1800s) to reduce server load.
 */
function seoHeaders(res) {
  res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=3600");
  res.setHeader("Vary", "User-Agent");
}

/**
 * Validate integer parameters (episodes/chapters).
 * Returns 1 if invalid/NaN.
 */
function safeInt(param) {
  const val = parseInt(param, 10);
  return isNaN(val) || val < 1 ? 1 : val;
}

/* ==========================================================================
   API ROUTES
========================================================================== */

app.use("/api/recommend", recommendRoute);
app.use("/api/anilist", anilistRoute);
app.use("/api/ai", aiRoute);
app.use("/api/mangadex", mangadexRoute);
app.use("/api/home", homeRoute);
app.use("/api/manga", mangaRoute);
app.use("/api/anime", animeRoute);
app.use("/api/comments", commentsRoute);

/* ==========================================================================
   SEO INTERSTITIAL ROUTES (The "SEO Proxy")
   These routes serve static HTML for bots (Google/Discord) and redirect users.
========================================================================== */

// --------------------------------------------------------------------------
// 1. ANIME DETAILS PAGE
// --------------------------------------------------------------------------

app.get("/anime/:id/:slug", async (req, res) => {
  seoHeaders(res);
  const id = parseInt(req.params.id);
  const slug = cleanSlug(req.params.slug);
  const formattedTitle = formatTitle(slug);
  const pageUrl = `${SITE_URL}/anime/${id}/${slug}`; // CHANGED: Keep SEO proxy URL for diagnostics
  const canonicalUrl = `${FRONTEND_URL}/anime/${id}/${slug}`; // NEW: Canonical should point to frontend URL
  const targetUrl = canonicalUrl; // CHANGED: Redirect users to Netlify frontend route

  let animeData = null;

  try {
    const query = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      title { romaji english }
      description(asHtml: false)
      episodes
      averageScore
      status
      season
      seasonYear
      genres
      coverImage { extraLarge }
      bannerImage
    }
  }
`;

    const response = await axios.post(
      "https://graphql.anilist.co",
      { query, variables: { id } },
      { timeout: 8000 }
    );

    animeData = response.data?.data?.Media;
  } catch (err) {
    console.log("AniList fetch failed:", err.message);
  }

  const title =
    animeData?.title?.english ||
    animeData?.title?.romaji ||
    formattedTitle;

  const description =
    animeData?.description?.replace(/<[^>]*>?/gm, "").substring(0, 500) ||
    `Watch ${title} anime online in high quality.`;

  const episodes = animeData?.episodes || "N/A"; // CHANGED: Preserve episodes while omitting N/A from JSON-LD
  const score = animeData?.averageScore || "N/A";
  const status = animeData?.status || "Unknown";
  const genres = animeData?.genres?.join(", ") || "";
  const season = animeData?.season || "";
  const seasonYear = animeData?.seasonYear || "";
  const image = animeData?.coverImage?.extraLarge || "";

  const schemaData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL },
        { "@type": "ListItem", "position": 2, "name": "Anime", "item": `${SITE_URL}/anime` },
        { "@type": "ListItem", "position": 3, "name": title, "item": pageUrl }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "TVSeries",
      "name": title,
      "genre": genres,
      ...(episodes !== "N/A" && { numberOfEpisodes: episodes }),
      "url": canonicalUrl
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `Where does ${title} anime end in the manga?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `The anime adaptation of ${title} typically adapts 2–3 manga chapters per episode. Visit our continuation guide for an exact chapter mapping.`
          }
        },
        {
          "@type": "Question",
          "name": `How many episodes does ${title} have?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `${title} currently has ${episodes} episodes.`
          }
        }
      ]
    }
  ];

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Watch ${escapeAttr(title)} Anime Online (${escapeAttr(season)} ${escapeAttr(seasonYear)}) | ${SITE_NAME}</title>

<meta name="description" content="${escapeAttr(description)}">
<meta name="keywords" content="${escapeAttr(`${title} anime, ${genres}, ${title} episodes, ${title} season ${seasonYear}`)}">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#7c3aed">
<link rel="canonical" href="${escapeAttr(canonicalUrl)}">

<meta property="og:type" content="video.tv_show">
<meta property="og:url" content="${escapeAttr(canonicalUrl)}">
<meta property="og:title" content="Watch ${escapeAttr(title)} Anime Online">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:site_name" content="${SITE_NAME}">
${image ? `<meta property="og:image" content="${escapeAttr(image)}">` : ""}

<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:title" content="Watch ${escapeAttr(title)} Anime Online">
<meta property="twitter:description" content="${escapeAttr(description)}">
${image ? `<meta property="twitter:image" content="${escapeAttr(image)}">` : ""}

<script type="application/ld+json">
${JSON.stringify(schemaData)}
</script>

<noscript>
<meta http-equiv="refresh" content="0;url=${escapeAttr(targetUrl)}">
</noscript>
</head>

<body>
<nav>
  <a href="${FRONTEND_URL}/" rel="noopener">Home</a> |
  <a href="${FRONTEND_URL}/search.html" rel="noopener">Search</a> |
  <a href="${FRONTEND_URL}/" rel="noopener">Browse Anime</a>
</nav>
<h1>Watch ${escapeAttr(title)} Anime Online</h1>

<article>
<p><strong>Episodes:</strong> ${escapeAttr(episodes)}</p>
<p><strong>Average Score:</strong> ${escapeAttr(score)}</p>
<p><strong>Status:</strong> ${escapeAttr(status)}</p>
<p><strong>Genres:</strong> ${escapeAttr(genres)}</p>

<p>${escapeAttr(description)}</p>

<h2>Where Does ${title} Anime End in the Manga?</h2>
<p>
Anime adaptations usually cover multiple manga chapters per episode.
To continue the story after the anime,
visit the detailed guide below.
</p>

<p>
<a href="${FRONTEND_URL}/anime/${id}/${slug}/continue-manga">
Continue ${escapeAttr(title)} in Manga →
</a>
</p>

<h2>Similar Anime</h2>
<p>
<a href="${FRONTEND_URL}/best-anime-like/${slug}">
Best Anime Like ${escapeAttr(title)} →
</a>
</p>
</article>

<div style="margin-top:40px;text-align:center;">
<p>Redirecting you to the full experience...</p>
<p>If not redirected, <a href="${escapeAttr(targetUrl)}">click here</a>.</p>
</div>

<script>
window.location.replace("${targetUrl}");
</script>

</body>
</html>
  `);
});

// --------------------------------------------------------------------------
// 2. ANIME WATCH EPISODE
// --------------------------------------------------------------------------

app.get("/anime/:id/:slug/episode-:number", (req, res) => {
  seoHeaders(res);
  const id = parseInt(req.params.id);
  const slug = cleanSlug(req.params.slug);
  const ep = safeInt(req.params.number);
  const title = formatTitle(slug);
  const pageUrl = `${SITE_URL}/anime/${id}/${slug}/episode-${ep}`;
  const targetUrl = `${FRONTEND_URL}/watch.html?slug=${slug}&episode=${ep}`;

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    "episodeNumber": ep,
    "name": `${title} Episode ${ep}`,
    "partOfSeries": {
      "@type": "TVSeries",
      "name": title
    },
    "url": pageUrl
  };

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Watch ${title} Episode ${ep} Online | ${SITE_NAME}</title>
    <meta name="description" content="Watch ${title} Episode ${ep} online in HD. High quality streaming for ${title} Ep ${ep}.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">

    <meta property="og:title" content="Watch ${title} Episode ${ep}">
    <meta property="og:description" content="Stream ${title} Episode ${ep} online now.">
    <meta property="og:type" content="video.episode">
    <meta property="og:url" content="${pageUrl}">

    <script type="application/ld+json">
    ${JSON.stringify(schemaData)}
    </script>

    <noscript>
        <meta http-equiv="refresh" content="0;url=${targetUrl}">
    </noscript>
</head>
<body>
    <h1>${title} Episode ${ep}</h1>
    <p>Loading the player for ${title} Episode ${ep}...</p>
    <p><a href="${targetUrl}">Click here if not redirected.</a></p>
    
    <script>
        window.location.replace("${targetUrl}");
    </script>
</body>
</html>
  `);
});

// --------------------------------------------------------------------------
// 3. ANIME EPISODE RELEASE DATE
// --------------------------------------------------------------------------
app.get("/anime/:id/:slug/episode-:number/release-date", (req, res) => {
  seoHeaders(res);
  const id = parseInt(req.params.id);
  const slug = cleanSlug(req.params.slug);
  const ep = safeInt(req.params.number);
  const title = formatTitle(slug);
  const pageUrl = `${SITE_URL}/anime/${id}/${slug}/episode-${ep}/release-date`;
  const targetUrl = `${FRONTEND_URL}/release.html?anime=${slug}&episode=${ep}`;

  const schemaData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": `${title} Episode ${ep} Release Date`,
      "mainEntityOfPage": pageUrl,
      "publisher": { "@type": "Organization", "name": SITE_NAME },
      "description": `Find the official release date and time for ${title} Episode ${ep}. Countdown, streaming info, and delay updates.`
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `When will ${title} Episode ${ep} be released?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `Episode ${ep} of ${title} typically follows a weekly schedule unless delayed by production or broadcast changes.`
          }
        },
        {
          "@type": "Question",
          "name": `Is ${title} Episode ${ep} delayed?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Check official announcements and streaming platforms for delay updates. Most anime episodes follow consistent weekly releases."
          }
        }
      ]
    }
  ];

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} Episode ${ep} Release Date & Time | ${SITE_NAME}</title>
    
    <meta name="description" content="Find the official release date and time for ${title} Episode ${ep}. Countdown, streaming info, and delay updates.">
    <meta name="keywords" content="${title} episode ${ep} release date, ${title} ep ${ep} when, ${title} next episode">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">

    <meta property="og:title" content="${title} Episode ${ep} Release Date">
    <meta property="og:description" content="Official release schedule and countdown for ${title} Episode ${ep}.">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${pageUrl}">

    <script type="application/ld+json">
    ${JSON.stringify(schemaData)}
    </script>

    <noscript>
        <meta http-equiv="refresh" content="0;url=${targetUrl}">
    </noscript>
</head>
<body>
    <article>
        <h1>${title} Episode ${ep} Release Date & Time</h1>
        <p>
            Fans are eagerly waiting for ${title} Episode ${ep}.
            Here is everything you need to know about its expected release schedule,
            airing time, and potential delays.
        </p>

        <h2>Expected Release Schedule</h2>
        <p>
            Most seasonal anime episodes air once per week.
            If no delays occur, Episode ${ep} should release one week after the previous episode.
        </p>

        <h2>Release Time by Region</h2>
        <ul>
            <li>Japan (JST)</li>
            <li>US (PST / EST)</li>
            <li>UK (GMT)</li>
            <li>India (IST)</li>
        </ul>

        <h2>Will There Be a Delay?</h2>
        <p>
            Production delays may occur due to holidays, broadcast changes, or studio schedules.
            We recommend checking official streaming services for confirmation.
        </p>

        <h2>Continue the Story</h2>
        <p>Want to skip the wait? <a href="${SITE_URL}/anime/${slug}/continue-manga">Continue in the manga →</a></p>
        <p><a href="${SITE_URL}/anime/${slug}/episode-${ep}">Watch Episode ${ep} →</a></p>
    </article>

    <script>
        window.location.replace("${targetUrl}");
    </script>
</body>
</html>
  `);
});

// --------------------------------------------------------------------------
// 4. BEST ANIME LIKE X (Recommendation Engine SEO)
// --------------------------------------------------------------------------
app.get("/best-anime-like/:slug", (req, res) => {
  seoHeaders(res);

  const slug = cleanSlug(req.params.slug);
  const title = formatTitle(slug);
  const pageUrl = `${SITE_URL}/best-anime-like/${slug}`;
  const targetUrl = `${FRONTEND_URL}/similar.html?anime=${slug}`;

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Best Anime Like ${title}`,
    "description": `Top anime recommendations similar to ${title}.`,
    "itemListOrder": "https://schema.org/ItemListOrderDescending",
    "numberOfItems": 5
  };

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Best Anime Like ${title} (Top Similar Recommendations)</title>
    
    <meta name="description" content="Looking for anime like ${title}? Discover the best similar anime series with comparable themes, action, and storytelling.">
    <meta name="keywords" content="anime like ${title}, similar to ${title}, best anime like ${title}, recommendations after ${title}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">

    <meta property="og:title" content="Best Anime Like ${title}">
    <meta property="og:description" content="Top anime recommendations similar to ${title}.">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${pageUrl}">

    <script type="application/ld+json">
    ${JSON.stringify(schemaData)}
    </script>

    <noscript>
        <meta http-equiv="refresh" content="0;url=${targetUrl}">
    </noscript>
</head>
<body>
    <article>
        <h1>Best Anime Like ${title}</h1>
        <p>
            If you enjoyed watching ${title}, you're probably looking for similar anime
            with the same intensity, action, emotional depth, or storyline structure.
            Here are some great recommendations you should check out.
        </p>

        <h2>Why Fans Love ${title}</h2>
        <p>
            ${title} stands out due to its compelling characters, strong storytelling,
            and engaging plot progression. Fans who appreciate its style often enjoy
            other series within the same genre.
        </p>

        <h2>Top Anime Similar to ${title}</h2>
        <ul>
            <li>Action Packed Alternatives</li>
            <li>Emotionally Driven Stories</li>
            <li>Similar Art Styles</li>
        </ul>

        <p>Want more personalized suggestions? <a href="${SITE_URL}/anime/${slug}">View ${title} Anime Page →</a></p>
    </article>

    <script>
        window.location.replace("${targetUrl}");
    </script>
</body>
</html>
  `);
});

// --------------------------------------------------------------------------
// 5. CONTINUE MANGA (High Traffic / Tool Page)
// --------------------------------------------------------------------------
app.get("/anime/:id/:slug/continue-manga", (req, res) => {
  seoHeaders(res);

  const slug = cleanSlug(req.params.slug);
  const title = formatTitle(slug);
  const id = parseInt(req.params.id);
  const pageUrl = `${SITE_URL}/anime/${id}/${slug}/continue-manga`;
  const targetUrl = `${FRONTEND_URL}/continue/index.html?slug=${slug}`;

  const schemaData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": `Where to Continue ${title} Manga After Anime`,
      "mainEntityOfPage": pageUrl,
      "author": { "@type": "Organization", "name": SITE_NAME },
      "publisher": { "@type": "Organization", "name": SITE_NAME }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `What chapter does ${title} anime end in the manga?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `The anime adaptation of ${title} typically covers multiple manga chapters per episode. The continuation point depends on the final aired episode.`
          }
        },
        {
          "@type": "Question",
          "name": `Is it better to read the manga after finishing ${title} anime?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. The manga often contains additional details, extended story arcs, and character development not fully adapted in the anime."
          }
        }
      ]
    }
  ];

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Where to Continue ${title} Manga After Anime | Exact Chapter Guide</title>

    <meta name="description" content="Find the exact manga chapter to continue ${title} after finishing the anime. Spoiler-free continuation guide, episode to chapter mapping, and reading links.">
    <meta name="keywords" content="${title} manga after anime, where does ${title} anime end, ${title} continue manga chapter, ${title} anime to manga">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">

    <meta property="og:title" content="Continue ${title} in Manga After Anime">
    <meta property="og:description" content="Exact chapter guide to continue ${title} manga after anime ends.">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${pageUrl}">

    <script type="application/ld+json">
    ${JSON.stringify(schemaData)}
    </script>

    <noscript>
        <meta http-equiv="refresh" content="0;url=${targetUrl}">
    </noscript>
</head>
<body>
    <article>
        <h1>Where to Continue ${title} Manga After Anime</h1>
        <p>
            Finished watching ${title} anime and wondering where to continue in the manga?
            You're not alone. Many fans want to continue the story immediately after the latest episode.
            This guide explains exactly where the anime adaptation ends and which manga chapter to start from.
        </p>

        <h2>Does the Anime Cover the Full Manga?</h2>
        <p>
            Anime adaptations usually adapt 2–3 manga chapters per episode.
            Depending on the number of episodes and seasons released,
            the anime may cover only part of the full manga storyline.
        </p>

        <h2>Estimated Manga Chapter After Anime</h2>
        <p>Based on average adaptation pacing, you can typically start around:</p>
        <p><strong>Chapter (Episodes × 2–3)</strong></p>

        <p>For an accurate calculation based on your watched episodes:</p>
        <p><a href="${targetUrl}">Find Exact Chapter →</a></p>

        <h2>Why Continue in the Manga?</h2>
        <ul>
            <li>Unadapted story arcs</li>
            <li>Faster story progression</li>
            <li>More character depth</li>
            <li>Extended battles and scenes</li>
        </ul>

        <h2>Related Guides</h2>
        <p>
            <a href="${SITE_URL}/anime/${slug}">Watch ${title} Anime →</a><br>
            <a href="${SITE_URL}/best-anime-like/${slug}">Best Anime Like ${title} →</a><br>
            <a href="${SITE_URL}/best-manga-like/${slug}">Best Manga Like ${title} →</a>
        </p>
    </article>

    <script>
        window.location.replace("${targetUrl}");
    </script>
</body>
</html>
  `);
});

// --------------------------------------------------------------------------
// 6. MANGA DETAIL
// --------------------------------------------------------------------------


app.get("/manga/:slug", async (req, res) => {
  seoHeaders(res);

  const slug = cleanSlug(req.params.slug);
  const formattedTitle = formatTitle(slug);
  const pageUrl = `${SITE_URL}/manga/${slug}`;
  const targetUrl = `${FRONTEND_URL}/manga.html?slug=${slug}`;

  let mangaData = null;

  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: MANGA) {
          title { romaji english }
          description(asHtml: false)
          chapters
          volumes
          averageScore
          status
          genres
          coverImage { extraLarge }
          bannerImage
        }
      }
    `;

    const response = await axios.post(
  "https://graphql.anilist.co",
  { query, variables: { search: formattedTitle } },
  { timeout: 8000 }
);

    mangaData = response.data?.data?.Media;
  } catch (err) {
    console.log("AniList fetch failed:", err.message);
  }

  const title =
    mangaData?.title?.english ||
    mangaData?.title?.romaji ||
    formattedTitle;

  const description =
    mangaData?.description?.replace(/<[^>]*>?/gm, "").substring(0, 500) ||
    `Read ${title} manga online with latest chapters.`;

  const chapters = mangaData?.chapters || "N/A";
  const volumes = mangaData?.volumes || "N/A";
  const score = mangaData?.averageScore || "N/A";
  const status = mangaData?.status || "Unknown";
  const genres = mangaData?.genres?.join(", ") || "";
  const image = mangaData?.coverImage?.extraLarge || "";

  const schemaData = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL },
        { "@type": "ListItem", "position": 2, "name": "Manga", "item": `${SITE_URL}/manga` },
        { "@type": "ListItem", "position": 3, "name": title, "item": pageUrl }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "Book",
      "name": title,
      "numberOfPages": chapters,
      "genre": genres,
      "url": pageUrl
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `How many chapters does ${title} have?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `${title} currently has ${chapters} chapters.`
          }
        },
        {
          "@type": "Question",
          "name": `Is ${title} manga finished?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `${title} status is currently ${status}.`
          }
        }
      ]
    }
  ];

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>Read ${title} Manga Online (${chapters} Chapters) | ${SITE_NAME}</title>

<meta name="description" content="${description}">
<meta name="keywords" content="${title} manga, read ${title}, ${genres}, ${title} chapters online">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${pageUrl}">

<meta property="og:type" content="book">
<meta property="og:url" content="${pageUrl}">
<meta property="og:title" content="Read ${title} Manga Online">
<meta property="og:description" content="${description}">
<meta property="og:site_name" content="${SITE_NAME}">
${image ? `<meta property="og:image" content="${image}">` : ""}

<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:title" content="Read ${title} Manga Online">
<meta property="twitter:description" content="${description}">
${image ? `<meta property="twitter:image" content="${image}">` : ""}

<script type="application/ld+json">
${JSON.stringify(schemaData)}
</script>

<noscript>
<meta http-equiv="refresh" content="0;url=${targetUrl}">
</noscript>
</head>

<body>
<h1>Read ${title} Manga Online</h1>

<article>
<p><strong>Total Chapters:</strong> ${chapters}</p>
<p><strong>Total Volumes:</strong> ${volumes}</p>
<p><strong>Average Score:</strong> ${score}</p>
<p><strong>Status:</strong> ${status}</p>
<p><strong>Genres:</strong> ${genres}</p>

<p>${description}</p>

<h2>Latest Chapters</h2>
<ul>
  <li><a href="${pageUrl}/chapter-1">Chapter 1</a></li>
  <li><a href="${pageUrl}/chapter-2">Chapter 2</a></li>
  <li><a href="${pageUrl}/chapter-3">Chapter 3</a></li>
</ul>

<h2>Similar Manga</h2>
<p>
<a href="${SITE_URL}/best-manga-like/${slug}">
Best Manga Like ${title} →
</a>
</p>
</article>

<div style="margin-top:40px;text-align:center;">
<p>Redirecting you to the full reader...</p>
<p>If not redirected, <a href="${targetUrl}">click here</a>.</p>
</div>

<script>
window.location.replace("${targetUrl}");
</script>

</body>
</html>
  `);
});

// --------------------------------------------------------------------------
// 7. MANGA CHAPTER
// --------------------------------------------------------------------------
app.get("/manga/:slug/chapter-:number", (req, res) => {
  seoHeaders(res);

  const slug = cleanSlug(req.params.slug);
  const ch = safeInt(req.params.number);
  const title = formatTitle(slug);
  const pageUrl = `${SITE_URL}/manga/${slug}/chapter-${ch}`;
  const targetUrl = `${FRONTEND_URL}/manga.html?slug=${slug}&chapter=${ch}`;

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "Chapter",
    "name": `${title} Chapter ${ch}`,
    "chapterNumber": ch,
    "isPartOf": {
      "@type": "Book",
      "name": title
    },
    "url": pageUrl
  };

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} Chapter ${ch} - Read Online | ${SITE_NAME}</title>
    
    <meta name="description" content="Read ${title} Chapter ${ch} online in high quality. No ads, fast loading.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">

    <meta property="og:title" content="${title} Chapter ${ch}">
    <meta property="og:description" content="Read ${title} Chapter ${ch} online in high quality.">
    <meta property="og:type" content="book">
    <meta property="og:url" content="${pageUrl}">

    <script type="application/ld+json">
    ${JSON.stringify(schemaData)}
    </script>

    <noscript>
        <meta http-equiv="refresh" content="0;url=${targetUrl}">
    </noscript>
</head>
<body>
    <h1>${title} Chapter ${ch}</h1>
    <p>Loading chapter images...</p>
    <script>
        window.location.replace("${targetUrl}");
    </script>
</body>
</html>
  `);
});

// --------------------------------------------------------------------------
// 8. MANGA CHAPTER RELEASE DATE
// --------------------------------------------------------------------------
app.get("/manga/:slug/chapter-:number/release-date", (req, res) => {
  seoHeaders(res);

  const slug = cleanSlug(req.params.slug);
  const ch = safeInt(req.params.number);
  const title = formatTitle(slug);
  const pageUrl = `${SITE_URL}/manga/${slug}/chapter-${ch}/release-date`;
  const targetUrl = `${FRONTEND_URL}/release.html?manga=${slug}&chapter=${ch}`;

  const schemaData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": `${title} Chapter ${ch} Release Date`,
      "mainEntityOfPage": pageUrl,
      "publisher": { "@type": "Organization", "name": SITE_NAME },
      "description": `Get the official release date, countdown, and delay updates for ${title} Chapter ${ch}.`
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": `When will ${title} Chapter ${ch} be released?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": `Most manga series follow a weekly or monthly release schedule depending on the publisher. Chapter ${ch} will typically follow the standard publishing interval.`
          }
        },
        {
          "@type": "Question",
          "name": `Is ${title} Chapter ${ch} delayed?`,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Release delays may occur due to holidays or publication breaks. Official publisher announcements confirm exact dates."
          }
        }
      ]
    }
  ];

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} Chapter ${ch} Release Date & Countdown | ${SITE_NAME}</title>

    <meta name="description" content="Get the official release date, countdown, and delay updates for ${title} Chapter ${ch}. Find out when the next chapter drops.">
    <meta name="keywords" content="${title} chapter ${ch} release date, ${title} ${ch} when, ${title} next chapter">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">

    <meta property="og:title" content="${title} Chapter ${ch} Release Date">
    <meta property="og:description" content="Official release schedule and delay updates for ${title} Chapter ${ch}.">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${pageUrl}">

    <script type="application/ld+json">
    ${JSON.stringify(schemaData)}
    </script>

    <noscript>
        <meta http-equiv="refresh" content="0;url=${targetUrl}">
    </noscript>
</head>
<body>
    <article>
        <h1>${title} Chapter ${ch} Release Date</h1>
        <p>
            Fans are eagerly waiting for ${title} Chapter ${ch}.
            Here’s everything you need to know about the expected release schedule,
            potential delays, and global availability.
        </p>

        <h2>Expected Release Schedule</h2>
        <p>
            Weekly manga chapters are usually released once per week,
            while monthly series release once every month.
            If the series follows a weekly pattern,
            Chapter ${ch} should release approximately seven days after the previous chapter.
        </p>

        <h2>Global Release Timing</h2>
        <ul>
            <li>Japan (JST)</li>
            <li>US (PST / EST)</li>
            <li>UK (GMT)</li>
            <li>India (IST)</li>
        </ul>

        <h2>Will There Be a Break?</h2>
        <p>
            Occasional publication breaks may happen due to holidays or magazine schedules.
            Always check official publisher sources for confirmation.
        </p>

        <h2>Read Previous Chapter</h2>
        <p><a href="${SITE_URL}/manga/${slug}/chapter-${ch - 1}">Read Chapter ${ch - 1} →</a></p>

        <h2>Related Guides</h2>
        <p>
            <a href="${SITE_URL}/manga/${slug}">Read ${title} Manga →</a><br>
            <a href="${SITE_URL}/best-manga-like/${slug}">Best Manga Like ${title} →</a>
        </p>
    </article>

    <script>
        window.location.replace("${targetUrl}");
    </script>
</body>
</html>
  `);
});

// --------------------------------------------------------------------------
// 9. BEST MANGA LIKE X
// --------------------------------------------------------------------------
app.get("/best-manga-like/:slug", (req, res) => {
  seoHeaders(res);

  const slug = cleanSlug(req.params.slug);
  const title = formatTitle(slug);
  const pageUrl = `${SITE_URL}/best-manga-like/${slug}`;
  const targetUrl = `${FRONTEND_URL}/similar.html?manga=${slug}`;

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Best Manga Like ${title}`,
    "description": `Top manga recommendations similar to ${title}.`,
    "itemListOrder": "https://schema.org/ItemListOrderDescending",
    "numberOfItems": 5
  };

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Best Manga Like ${title} (Top Similar Reads)</title>

    <meta name="description" content="Looking for manga like ${title}? Discover similar manga series with comparable themes, art style, and story depth.">
    <meta name="keywords" content="manga like ${title}, similar manga to ${title}, best manga like ${title}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">

    <meta property="og:title" content="Best Manga Like ${title}">
    <meta property="og:description" content="Top manga recommendations similar to ${title}.">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${pageUrl}">

    <script type="application/ld+json">
    ${JSON.stringify(schemaData)}
    </script>

    <noscript>
        <meta http-equiv="refresh" content="0;url=${targetUrl}">
    </noscript>
</head>
<body>
    <article>
        <h1>Best Manga Like ${title}</h1>
        <p>
            If you enjoyed reading ${title}, you might be searching for manga
            with similar themes, pacing, or character development.
            Here are some top picks you should explore next.
        </p>

        <h2>Why Readers Love ${title}</h2>
        <p>
            ${title} captivates readers with its strong narrative progression,
            memorable characters, and unique artistic direction.
            Manga with similar elements often provide the same immersive experience.
        </p>

        <h2>Top Manga Similar to ${title}</h2>
        <ul>
            <li>Manga Recommendation 1</li>
            <li>Manga Recommendation 2</li>
            <li>Manga Recommendation 3</li>
        </ul>

        <p>Explore more: <a href="${SITE_URL}/manga/${slug}">Read ${title} Manga →</a></p>
    </article>

    <script>
        window.location.replace("${targetUrl}");
    </script>
</body>
</html>
  `);
});

/* ==========================================================================
   SYSTEM ROUTES
========================================================================== */

// Sitemap Integration
app.use("/", sitemapRoute);

// 404 Handler for undefined API routes
// This catches /api/* errors. For the SEO pages, we generally rely on Express's default behavior
// or you could add a wildcard handler at the very end.
app.get("/api/*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Root Route - Health Check
app.get("/", (req, res) => {
  res.status(200).send(`${SITE_NAME} Backend Running 🚀`);
});

/* ==========================================================================
   SERVER INITIALIZATION
========================================================================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n================================`);
  console.log(`🚀 ${SITE_NAME} Server Started`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`================================\n`);
});

// Handling Uncaught Exceptions to prevent server crash
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});