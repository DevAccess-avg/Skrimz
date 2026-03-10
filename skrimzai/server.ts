import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db = new Database("skrimz.db");

// Initialize Database with new schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    is_pro INTEGER DEFAULT 0,
    theme TEXT DEFAULT 'crimson',
    message_count INTEGER DEFAULT 0,
    last_message_at DATETIME,
    image_count INTEGER DEFAULT 0,
    last_image_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    title TEXT,
    messages TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/status", (req, res) => {
    res.json({ status: "Operational", latency: "8ms", load: "Optimal" });
  });

  // Auth: Register (Direct creation, no 2FA)
  app.post("/api/auth/register", (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    try {
      // Check if exists
      const existing = db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").get(username, email);
      if (existing) {
        return res.status(400).json({ error: "Username or Email already exists" });
      }

      const info = db.prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)")
        .run(username, email, password);
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
      
      res.json(user);
    } catch (e: any) {
      console.error("Registration Error Details:", e);
      res.status(500).json({ error: `Registration failed: ${e.message || 'Unknown error'}` });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?").get(email, password) as any;
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    res.json(user);
  });

  // Usage Tracking
  app.get("/api/usage/:userId", (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.userId) as any;
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({
      is_pro: user.is_pro,
      message_count: user.message_count,
      last_message_at: user.last_message_at,
      image_count: user.image_count,
      last_image_at: user.last_image_at
    });
  });

  app.post("/api/usage/track", (req, res) => {
    const { userId, type } = req.body;
    const now = new Date().toISOString();
    if (type === 'message') {
      db.prepare("UPDATE users SET message_count = message_count + 1, last_message_at = ? WHERE id = ?").run(now, userId);
    } else {
      db.prepare("UPDATE users SET image_count = image_count + 1, last_image_at = ? WHERE id = ?").run(now, userId);
    }
    res.json({ success: true });
  });

  app.post("/api/usage/reset", (req, res) => {
    const { userId, type } = req.body;
    if (type === 'message') {
      db.prepare("UPDATE users SET message_count = 0 WHERE id = ?").run(userId);
    } else {
      db.prepare("UPDATE users SET image_count = 0 WHERE id = ?").run(userId);
    }
    res.json({ success: true });
  });

  // Settings
  app.post("/api/settings/update", (req, res) => {
    const { userId, theme, is_pro } = req.body;
    if (theme !== undefined) {
      db.prepare("UPDATE users SET theme = ? WHERE id = ?").run(theme, userId);
    }
    if (is_pro !== undefined) {
      db.prepare("UPDATE users SET is_pro = ? WHERE id = ?").run(is_pro, userId);
    }
    res.json({ success: true });
  });

  app.delete("/api/users/:userId", (req, res) => {
    db.prepare("DELETE FROM chats WHERE user_id = ?").run(req.params.userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.userId);
    res.json({ success: true });
  });

  app.get("/api/chats/:userId", (req, res) => {
    const chats = db.prepare("SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC").all(req.params.userId);
    res.json(chats.map((c: any) => ({ ...c, messages: JSON.parse(c.messages) })));
  });

  app.post("/api/chats", (req, res) => {
    const { id, userId, title, messages } = req.body;
    db.prepare("INSERT OR REPLACE INTO chats (id, user_id, title, messages, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)")
      .run(id, userId, title, JSON.stringify(messages));
    res.json({ success: true });
  });

  app.post("/api/users/upgrade", (req, res) => {
    const { userId } = req.body;
    db.prepare("UPDATE users SET is_pro = 1 WHERE id = ?").run(userId);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SkrimzAI Server running on http://localhost:${PORT}`);
  });
}

startServer();
