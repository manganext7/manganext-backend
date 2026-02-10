import express from "express";
import axios from "axios";

const router = express.Router();

const ANILIST_URL = "https://graphql.anilist.co";
const SEO_DOMAIN = "https://manganext-backend.onrender.com";

// Fetch popular anime only (anime pages bring traffic)
async function fetchAnime(page = 1) {
  const query = `
    query ($page: Int) {
      Page(page: $page, perPage: 50) {
        media(type: ANIME, sort: POPULARITY_DESC) {
          id
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  const res = await axios.post(ANILIST_URL, {
    query,
    variables: { page }
  });

  return res.data.data.Page;
}

router.get("/sitemap.xml", async (req, res) => {
  try {
    let urls = [];
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= 5) {
      const data = await fetchAnime(page);

      data.media.forEach(item => {
        urls.push(`
<url>
  <loc>${SEO_DOMAIN}/watch/${item.id}/episode-1</loc>
  <changefreq>weekly</changefreq>
  <priority>0.9</priority>
</url>
        `);
      });

      hasNext = data.pageInfo.hasNextPage;
      page++;
    }

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url>
  <loc>${SEO_DOMAIN}/</loc>
  <priority>1.0</priority>
</url>
${urls.join("")}
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.send(sitemap);

  } catch (err) {
    console.error("Sitemap error", err);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
