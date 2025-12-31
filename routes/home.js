import express from "express";
import axios from "axios";

const router = express.Router();
const ANILIST_URL = "https://graphql.anilist.co";

/**
 * TOP 10 TRENDING ANIME (Hero Slideshow)
 */
router.get("/hero", async (req, res) => {
  try {
    const query = `
      query {
        Page(perPage: 10) {
          media(type: ANIME, sort: TRENDING_DESC) {
            id
            title {
              romaji
              english
            }
            bannerImage
            coverImage {
              extraLarge
            }
            episodes
            status
            averageScore
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_URL, { query });
    res.json(response.data.data.Page.media);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch hero anime" });
  }
});

/**
 * TRENDING RIGHT NOW (Below Hero)
 */
router.get("/trending", async (req, res) => {
  try {
    const query = `
      query {
        Page(perPage: 15) {
          media(type: ANIME, sort: TRENDING_DESC) {
            id
            title {
              romaji
              english
            }
            coverImage {
              large
            }
            averageScore
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_URL, { query });
    res.json(response.data.data.Page.media);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch trending anime" });
  }
});
/**
 * TRENDING MANGA
 */
router.get("/trending-manga", async (req, res) => {
  try {
    const query = `
      query {
        Page(perPage: 15) {
          media(type: MANGA, sort: TRENDING_DESC) {
            id
            title {
              romaji
              english
            }
            coverImage {
              large
            }
            chapters
            averageScore
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_URL, { query });
    res.json(response.data.data.Page.media);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch trending manga" });
  }
});
/**
 * SEASONAL ANIME
 * Query params: season, year
 */
router.get("/seasonal-anime", async (req, res) => {
  try {
    const { season, year } = req.query;

    const query = `
      query ($season: MediaSeason, $year: Int) {
        Page(perPage: 20) {
          media(
            type: ANIME,
            season: $season,
            seasonYear: $year,
            sort: TRENDING_DESC
          ) {
            id
            title {
              romaji
              english
            }
            coverImage {
              large
            }
            episodes
            averageScore
          }
        }
      }
    `;

    const response = await axios.post(
      ANILIST_URL,
      {
        query,
        variables: {
          season: season.toUpperCase(),
          year: parseInt(year)
        }
      }
    );

    res.json(response.data.data.Page.media);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch seasonal anime" });
  }
});
/**
 * MONTHLY TRENDING MANGA
 */
router.get("/monthly-manga", async (req, res) => {
  try {
    const query = `
      query {
        Page(perPage: 20) {
          media(
            type: MANGA,
            sort: [TRENDING_DESC, POPULARITY_DESC]
          ) {
            id
            title {
              romaji
              english
            }
            coverImage {
              large
            }
            chapters
            averageScore
          }
        }
      }
    `;

    const response = await axios.post(ANILIST_URL, { query });
    res.json(response.data.data.Page.media);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch monthly manga" });
  }
});
/**
 * TOP RANKED ANIME
 * Query param: sort = SCORE_DESC | POPULARITY_DESC
 */
router.get("/top-anime", async (req, res) => {
  try {
    const sort = req.query.sort || "SCORE_DESC";

    const query = `
      query ($sort: [MediaSort]) {
        Page(perPage: 20) {
          media(type: ANIME, sort: $sort) {
            id
            title {
              romaji
              english
            }
            coverImage {
              large
            }
            episodes
            averageScore
            popularity
          }
        }
      }
    `;

    const response = await axios.post(
      ANILIST_URL,
      {
        query,
        variables: { sort }
      }
    );

    res.json(response.data.data.Page.media);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch top anime" });
  }
});
/**
 * TOP RANKED MANGA
 * Query param: sort = SCORE_DESC | POPULARITY_DESC
 */
router.get("/top-manga", async (req, res) => {
  try {
    const sort = req.query.sort || "SCORE_DESC";

    const query = `
      query ($sort: [MediaSort]) {
        Page(perPage: 20) {
          media(type: MANGA, sort: $sort) {
            id
            title {
              romaji
              english
            }
            coverImage {
              large
            }
            chapters
            averageScore
            popularity
          }
        }
      }
    `;

    const response = await axios.post(
      ANILIST_URL,
      {
        query,
        variables: { sort }
      }
    );

    res.json(response.data.data.Page.media);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch top manga" });
  }
});

export default router;
