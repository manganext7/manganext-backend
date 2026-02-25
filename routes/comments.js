import express from "express";

const router = express.Router();

/* ===============================
   CONFIG (FREE PLAN SAFE)
================================ */

let comments = {};

const MAX_COMMENTS_PER_CHAPTER = 200;
const MAX_REPLIES_PER_COMMENT = 50;
const MAX_TEXT_LENGTH = 500;
const MAX_USERNAME_LENGTH = 30;

// Simple rate limit per IP (very lightweight)
const requestTracker = {};
const RATE_LIMIT_WINDOW = 10000; // 10 seconds
const MAX_REQUESTS = 5;

/* ===============================
   HELPERS
================================ */

function cleanInput(str, maxLength) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/[<>]/g, "") // basic XSS prevention
    .trim()
    .substring(0, maxLength);
}

function rateLimit(ip) {
  const now = Date.now();

  if (!requestTracker[ip]) {
    requestTracker[ip] = [];
  }

  requestTracker[ip] = requestTracker[ip].filter(
    (time) => now - time < RATE_LIMIT_WINDOW
  );

  if (requestTracker[ip].length >= MAX_REQUESTS) {
    return false;
  }

  requestTracker[ip].push(now);
  return true;
}

/* ===============================
   GET COMMENTS
================================ */

router.get("/:mangaSlug/:chapterNumber", (req, res) => {
  const { mangaSlug, chapterNumber } = req.params;
  const key = `${mangaSlug}-${chapterNumber}`;

  res.json({
    comments: comments[key] || [],
    total: (comments[key] || []).length
  });
});

/* ===============================
   POST COMMENT
================================ */

router.post("/:mangaSlug/:chapterNumber", (req, res) => {
  const ip = req.ip;

  if (!rateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { mangaSlug, chapterNumber } = req.params;
  const { username, text, rating } = req.body;

  const cleanUsername = cleanInput(username, MAX_USERNAME_LENGTH);
  const cleanText = cleanInput(text, MAX_TEXT_LENGTH);

  if (!cleanText) {
    return res.status(400).json({ error: "Comment text is required" });
  }

  if (!cleanUsername) {
    return res.status(400).json({ error: "Username is required" });
  }

  const key = `${mangaSlug}-${chapterNumber}`;

  if (!comments[key]) {
    comments[key] = [];
  }

  // Limit total comments per chapter
  if (comments[key].length >= MAX_COMMENTS_PER_CHAPTER) {
    comments[key].pop(); // remove oldest
  }

  const newComment = {
    id: Date.now().toString(),
    username: cleanUsername,
    text: cleanText,
    rating:
      typeof rating === "number" && rating >= 1 && rating <= 5
        ? rating
        : null,
    timestamp: new Date().toISOString(),
    likes: 0,
    replies: []
  };

  comments[key].unshift(newComment);

  res.json({
    success: true,
    comment: newComment
  });
});

/* ===============================
   LIKE COMMENT
================================ */

router.post("/:mangaSlug/:chapterNumber/:commentId/like", (req, res) => {
  const { mangaSlug, chapterNumber, commentId } = req.params;
  const key = `${mangaSlug}-${chapterNumber}`;

  if (!comments[key]) {
    return res.status(404).json({ error: "No comments found" });
  }

  const comment = comments[key].find(c => c.id === commentId);

  if (!comment) {
    return res.status(404).json({ error: "Comment not found" });
  }

  comment.likes += 1;

  res.json({
    success: true,
    likes: comment.likes
  });
});

/* ===============================
   REPLY TO COMMENT
================================ */

router.post("/:mangaSlug/:chapterNumber/:commentId/reply", (req, res) => {
  const ip = req.ip;

  if (!rateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests" });
  }

  const { mangaSlug, chapterNumber, commentId } = req.params;
  const { username, text } = req.body;

  const cleanUsername = cleanInput(username, MAX_USERNAME_LENGTH);
  const cleanText = cleanInput(text, MAX_TEXT_LENGTH);

  if (!cleanText || !cleanUsername) {
    return res.status(400).json({ error: "Invalid reply data" });
  }

  const key = `${mangaSlug}-${chapterNumber}`;

  if (!comments[key]) {
    return res.status(404).json({ error: "No comments found" });
  }

  const comment = comments[key].find(c => c.id === commentId);

  if (!comment) {
    return res.status(404).json({ error: "Comment not found" });
  }

  if (comment.replies.length >= MAX_REPLIES_PER_COMMENT) {
    comment.replies.shift(); // remove oldest reply
  }

  const reply = {
    id: Date.now().toString(),
    username: cleanUsername,
    text: cleanText,
    timestamp: new Date().toISOString(),
    likes: 0
  };

  comment.replies.push(reply);

  res.json({
    success: true,
    reply
  });
});

/* ===============================
   DELETE COMMENT
================================ */

router.delete("/:mangaSlug/:chapterNumber/:commentId", (req, res) => {
  const { mangaSlug, chapterNumber, commentId } = req.params;
  const key = `${mangaSlug}-${chapterNumber}`;

  if (!comments[key]) {
    return res.status(404).json({ error: "No comments found" });
  }

  const index = comments[key].findIndex(c => c.id === commentId);

  if (index === -1) {
    return res.status(404).json({ error: "Comment not found" });
  }

  comments[key].splice(index, 1);

  res.json({ success: true });
});

/* ===============================
   TRENDING COMMENTS
================================ */

router.get("/trending", (req, res) => {
  const trending = Object.keys(comments)
    .map(key => {
      const [mangaSlug, chapterNumber] = key.split("-");
      return {
        mangaSlug,
        chapterNumber,
        commentCount: comments[key].length,
        recentActivity: comments[key][0]?.timestamp || null
      };
    })
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 10);

  res.json({ trending });
});

export default router;
