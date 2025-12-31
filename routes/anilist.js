import express from "express";
import axios from "axios";

const router = express.Router();

// SEARCH (Anime + Manga)
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json([]);

    const gqlQuery = `
      query ($search: String) {
        Page(perPage: 20) {
          media(search: $search) {
            id
            type
            format
            episodes
            chapters
            averageScore
            title {
              romaji
              english
            }
            coverImage {
              large
              medium
            }
            relations {
              edges {
                relationType
                node {
                  id
                  type
                  title {
                    romaji
                    english
                  }
                  chapters
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      "https://graphql.anilist.co",
      {
        query: gqlQuery,
        variables: { search: q }
      },
      { headers: { "Content-Type": "application/json" } }
    );

    res.json(response.data.data.Page.media);
  } catch (err) {
    console.error("AniList search failed:", err.message);
    res.status(500).json([]);
  }
});

// GET MEDIA BY ID (Anime or Manga)
router.get("/media/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      query ($id: Int) {
        Media(id: $id) {
          id
          type
          title {
            romaji
            english
          }
          description(asHtml: true)
          coverImage {
            extraLarge
          }
          bannerImage
          episodes
          chapters
          averageScore
          status
          relations {
            edges {
              relationType
              node {
                id
                type
                title {
                  romaji
                  english
                }
                chapters
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      "https://graphql.anilist.co",
      {
        query,
        variables: { id: parseInt(id) }
      }
    );

    res.json(response.data.data.Media);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch media details" });
  }
});

export default router;
