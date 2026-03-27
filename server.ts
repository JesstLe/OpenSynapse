import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { Note, Flashcard } from "./src/types";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const DATA_FILE = path.join(process.cwd(), "data.json");

  app.use(express.json({ limit: '50mb' }));

  // Helper to read/write data
  const getData = async () => {
    try {
      const content = await fs.readFile(DATA_FILE, "utf-8");
      return JSON.parse(content);
    } catch {
      return { notes: [], flashcards: [] };
    }
  };

  const saveData = async (data: any) => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  };

  // API Routes
  app.get("/api/data", async (req, res) => {
    const data = await getData();
    res.json(data);
  });

  app.post("/api/notes", async (req, res) => {
    const { note, flashcards } = req.body;
    const data = await getData();
    
    data.notes.unshift(note);
    data.flashcards.push(...flashcards);
    
    await saveData(data);
    res.json({ success: true });
  });

  app.delete("/api/notes/:id", async (req, res) => {
    const { id } = req.params;
    const data = await getData();
    
    data.notes = data.notes.filter((n: Note) => n.id !== id);
    data.flashcards = data.flashcards.filter((f: Flashcard) => f.noteId !== id);
    
    await saveData(data);
    res.json({ success: true });
  });

  // CLI Sync Endpoint
  app.post("/api/sync", async (req, res) => {
    const { note, flashcards } = req.body;
    if (!note || !flashcards) return res.status(400).json({ error: "Invalid data" });
    
    const data = await getData();
    data.notes.unshift(note);
    data.flashcards.push(...flashcards);
    
    await saveData(data);
    console.log(`[CLI] Synced new note: ${note.title}`);
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
