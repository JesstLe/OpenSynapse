import { Router } from "express";
import { noteRepo } from "../repositories/note.repo";
import { flashcardRepo } from "../repositories/flashcard.repo";
import { chatRepo } from "../repositories/chat.repo";
import { apiKeyRepo } from "../repositories/apiKey.repo";
import { personaRepo } from "../repositories/persona.repo";
import { auth } from "../auth/server";

const router = Router();

async function getUserId(req: any): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

function requireAuth(handler: (req: any, res: any, userId: string) => Promise<void>) {
  return async (req: any, res: any) => {
    const userId = await getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return handler(req, res, userId);
  };
}

router.get("/notes", requireAuth(async (req, res, userId) => {
  try {
    const notes = await noteRepo.findByUser(userId);
    res.json(notes);
  } catch (error) {
    console.error("Failed to list notes:", error);
    res.status(500).json({ error: "Failed to list notes" });
  }
}));

router.post("/notes", requireAuth(async (req, res, userId) => {
  try {
    const note = await noteRepo.create({
      ...req.body,
      userId,
    });
    res.json(note);
  } catch (error) {
    console.error("Failed to create note:", error);
    res.status(500).json({ error: "Failed to create note" });
  }
}));

router.put("/notes/:id", requireAuth(async (req, res, userId) => {
  try {
    const existing = await noteRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const note = await noteRepo.update(req.params.id, req.body);
    res.json(note);
  } catch (error) {
    console.error("Failed to update note:", error);
    res.status(500).json({ error: "Failed to update note" });
  }
}));

router.delete("/notes/:id", requireAuth(async (req, res, userId) => {
  try {
    const existing = await noteRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Note not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await noteRepo.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete note:", error);
    res.status(500).json({ error: "Failed to delete note" });
  }
}));

router.get("/notes/search", requireAuth(async (req, res, userId) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.json([]);
    }
    const notes = await noteRepo.search(userId, query);
    res.json(notes);
  } catch (error) {
    console.error("Failed to search notes:", error);
    res.status(500).json({ error: "Failed to search notes" });
  }
}));

router.get("/flashcards", requireAuth(async (req, res, userId) => {
  try {
    const cards = await flashcardRepo.findByUser(userId);
    res.json(cards);
  } catch (error) {
    console.error("Failed to list flashcards:", error);
    res.status(500).json({ error: "Failed to list flashcards" });
  }
}));

router.get("/flashcards/due", requireAuth(async (req, res, userId) => {
  try {
    const cards = await flashcardRepo.findDueForReview(userId);
    res.json(cards);
  } catch (error) {
    console.error("Failed to list due flashcards:", error);
    res.status(500).json({ error: "Failed to list due flashcards" });
  }
}));

router.post("/flashcards", requireAuth(async (req, res, userId) => {
  try {
    const card = await flashcardRepo.create({
      ...req.body,
      userId,
    });
    res.json(card);
  } catch (error) {
    console.error("Failed to create flashcard:", error);
    res.status(500).json({ error: "Failed to create flashcard" });
  }
}));

router.put("/flashcards/:id", requireAuth(async (req, res, userId) => {
  try {
    const existing = await flashcardRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Flashcard not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const card = await flashcardRepo.update(req.params.id, req.body);
    res.json(card);
  } catch (error) {
    console.error("Failed to update flashcard:", error);
    res.status(500).json({ error: "Failed to update flashcard" });
  }
}));

router.delete("/flashcards/note/:noteId", requireAuth(async (req, res, userId) => {
  try {
    const cards = await flashcardRepo.findByNote(req.params.noteId);
    for (const card of cards) {
      await flashcardRepo.delete(card.id);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete flashcards by note:", error);
    res.status(500).json({ error: "Failed to delete flashcards" });
  }
}));

router.post("/flashcards/:id/review", requireAuth(async (req, res, userId) => {
  try {
    const existing = await flashcardRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Flashcard not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const card = await flashcardRepo.update(req.params.id, {
      ...req.body,
      lastReview: new Date(),
    });
    res.json(card);
  } catch (error) {
    console.error("Failed to review flashcard:", error);
    res.status(500).json({ error: "Failed to review flashcard" });
  }
}));

router.get("/chat-sessions", requireAuth(async (req, res, userId) => {
  try {
    const sessions = await chatRepo.session.findByUser(userId);
    const sessionsWithMessages = await Promise.all(
      sessions.map(async (session) => {
        const messages = await chatRepo.message.findBySession(session.id);
        return {
          ...session,
          messages: messages.map(m => ({
            role: m.role,
            text: m.content,
            thought: m.thinking,
            image: m.image,
          })),
        };
      })
    );
    res.json(sessionsWithMessages);
  } catch (error) {
    console.error("Failed to list chat sessions:", error);
    res.status(500).json({ error: "Failed to list chat sessions" });
  }
}));

router.post("/chat-sessions", requireAuth(async (req, res, userId) => {
  try {
    const { id, messages, ...sessionData } = req.body;
    const sessionId = id || crypto.randomUUID();
    const session = await chatRepo.session.create({
      id: sessionId,
      userId,
      title: sessionData.title || '新会话',
      ...sessionData,
    });
    if (messages && Array.isArray(messages)) {
      for (const msg of messages) {
        await chatRepo.message.create({
          id: crypto.randomUUID(),
          sessionId: sessionId,
          role: msg.role,
          content: msg.text || msg.content || '',
          thinking: msg.thought || msg.thinking,
          image: msg.image,
        });
      }
    }
    res.json({ ...session, messages: messages || [] });
  } catch (error) {
    console.error("Failed to create chat session:", error);
    res.status(500).json({ error: "Failed to create chat session" });
  }
}));

router.put("/chat-sessions/:id", requireAuth(async (req, res, userId) => {
  try {
    const existing = await chatRepo.session.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { messages, ...sessionData } = req.body;
    const session = await chatRepo.session.update(req.params.id, sessionData);
    if (messages && Array.isArray(messages)) {
      await chatRepo.message.deleteBySession(req.params.id);
      for (const msg of messages) {
        await chatRepo.message.create({
          id: crypto.randomUUID(),
          sessionId: req.params.id,
          role: msg.role,
          content: msg.text || msg.content || '',
          thinking: msg.thought || msg.thinking,
          image: msg.image,
        });
      }
    }
    res.json({ ...session, messages: messages || [] });
  } catch (error) {
    console.error("Failed to update chat session:", error);
    res.status(500).json({ error: "Failed to update chat session" });
  }
}));

router.delete("/chat-sessions/:id", requireAuth(async (req, res, userId) => {
  try {
    const existing = await chatRepo.session.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await chatRepo.message.deleteBySession(req.params.id);
    await chatRepo.session.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete chat session:", error);
    res.status(500).json({ error: "Failed to delete chat session" });
  }
}));

router.get("/api-keys", requireAuth(async (req, res, userId) => {
  try {
    const keys = await apiKeyRepo.findByUser(userId);
    const result: Record<string, string> = {};
    for (const key of keys) {
      result[`${key.provider}ApiKey`] = key.key;
    }
    res.json(result);
  } catch (error) {
    console.error("Failed to get API keys:", error);
    res.status(500).json({ error: "Failed to get API keys" });
  }
}));

router.put("/api-keys", requireAuth(async (req, res, userId) => {
  try {
    const providers = ['gemini', 'openai', 'minimax', 'zhipu', 'moonshot'];
    for (const provider of providers) {
      const key = req.body[`${provider}ApiKey`];
      if (key !== undefined) {
        const existing = await apiKeyRepo.findByUserAndProvider(userId, provider);
        if (existing) {
          await apiKeyRepo.update(userId, provider, key);
        } else if (key) {
          await apiKeyRepo.create({
            id: crypto.randomUUID(),
            userId,
            provider,
            key,
          });
        }
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to update API keys:", error);
    res.status(500).json({ error: "Failed to update API keys" });
  }
}));

router.get("/personas", requireAuth(async (req, res, userId) => {
  try {
    const personas = await personaRepo.findByUser(userId);
    res.json(personas);
  } catch (error) {
    console.error("Failed to list personas:", error);
    res.status(500).json({ error: "Failed to list personas" });
  }
}));

router.post("/personas", requireAuth(async (req, res, userId) => {
  try {
    const persona = await personaRepo.create({
      id: crypto.randomUUID(),
      userId,
      name: req.body.name,
      description: req.body.description,
      systemPrompt: req.body.systemPrompt,
      icon: req.body.icon,
      isHidden: req.body.isHidden || false,
    });
    res.json(persona);
  } catch (error) {
    console.error("Failed to create persona:", error);
    res.status(500).json({ error: "Failed to create persona" });
  }
}));

router.put("/personas/:id", requireAuth(async (req, res, userId) => {
  try {
    const existing = await personaRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Persona not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const persona = await personaRepo.update(req.params.id, req.body);
    res.json(persona);
  } catch (error) {
    console.error("Failed to update persona:", error);
    res.status(500).json({ error: "Failed to update persona" });
  }
}));

router.delete("/personas/:id", requireAuth(async (req, res, userId) => {
  try {
    const existing = await personaRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Persona not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await personaRepo.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete persona:", error);
    res.status(500).json({ error: "Failed to delete persona" });
  }
}));

export default router;
