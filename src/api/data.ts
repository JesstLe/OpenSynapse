import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { noteRepo } from "../repositories/note.repo";
import { flashcardRepo } from "../repositories/flashcard.repo";
import { chatRepo } from "../repositories/chat.repo";
import { apiKeyRepo } from "../repositories/apiKey.repo";
import { personaRepo } from "../repositories/persona.repo";
import { auth } from "../auth/server";
import { db } from "../db";
import { accounts } from "../db/schema";
import { schedule, Rating } from "../services/fsrs";
import { vectorStore } from "../vector/chroma";
import { generateEmbeddingsServer } from "../services/embeddingService";

const router = Router();

function toFrontendTimestamp(date: Date | null | undefined): number | null {
  return date ? date.getTime() : null;
}

function toDbDate(timestamp: number | undefined): Date | null {
  return timestamp !== undefined ? new Date(timestamp) : null;
}

function mapNoteToFrontend(note: any) {
  return {
    ...note,
    createdAt: toFrontendTimestamp(note.createdAt),
    updatedAt: toFrontendTimestamp(note.updatedAt),
  };
}

function buildNoteEmbeddingText(note: {
  title?: string | null;
  summary?: string | null;
  content?: string | null;
  tags?: string[] | null;
}): string {
  const tagsText = Array.isArray(note.tags) ? note.tags.join(' ') : '';
  return [note.title || '', note.summary || '', note.content || '', tagsText]
    .join('\n')
    .trim();
}

function buildNoteDocument(note: {
  title?: string | null;
  summary?: string | null;
  content?: string | null;
  tags?: string[] | null;
}): string {
  const tagsText = Array.isArray(note.tags) && note.tags.length > 0
    ? `Tags: ${note.tags.join(', ')}`
    : '';

  return [
    note.title ? `Title: ${note.title}` : '',
    note.summary ? `Summary: ${note.summary}` : '',
    note.content ? `Content: ${note.content}` : '',
    tagsText,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

async function syncNoteToChroma(userId: string, note: any): Promise<void> {
  const health = await vectorStore.healthCheck();
  if (!health.healthy) {
    console.warn('[Data API] Chroma unavailable, skip note sync:', health.error);
    return;
  }

  let embedding = Array.isArray(note.embedding) && note.embedding.length > 0
    ? note.embedding
    : null;

  if (!embedding) {
    const embeddingText = buildNoteEmbeddingText(note);
    if (!embeddingText) {
      console.warn('[Data API] Empty note text, skip note embedding sync:', note.id);
      return;
    }

    const generated = await generateEmbeddingsServer([embeddingText]);
    if (generated.degraded || generated.values.length === 0) {
      if (generated.reason) {
        console.warn('[Data API] Failed to generate note embedding, wait next sync opportunity:', generated.reason);
      } else {
        console.warn('[Data API] Failed to generate note embedding, wait next sync opportunity');
      }
      return;
    }

    embedding = generated.values;
    await noteRepo.update(note.id, { embedding });
    note.embedding = embedding;
  }

  const document = buildNoteDocument(note);
  if (!document) {
    console.warn('[Data API] Empty note document, skip Chroma upsert:', note.id);
    return;
  }

  await vectorStore.batchUpsert(userId, [
    {
      noteId: note.id,
      content: document,
      embedding,
      metadata: {
        title: note.title || '',
        summary: note.summary || '',
        source: note.source || '',
      },
    },
  ]);
}

async function deleteNoteFromChroma(userId: string, noteId: string): Promise<void> {
  const health = await vectorStore.healthCheck();
  if (!health.healthy) {
    console.warn('[Data API] Chroma unavailable, skip note deletion sync:', health.error);
    return;
  }

  await vectorStore.deleteNote(userId, noteId);
}

function mapFlashcardToFrontend(card: any) {
  return {
    ...card,
    nextReview: toFrontendTimestamp(card.due),
    lastReview: toFrontendTimestamp(card.lastReview),
    repetitions: card.reps,
    createdAt: toFrontendTimestamp(card.createdAt),
  };
}

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
    res.json(notes.map(mapNoteToFrontend));
  } catch (error) {
    console.error("Failed to list notes:", error);
    res.status(500).json({ error: "Failed to list notes" });
  }
}));

router.post("/notes", requireAuth(async (req, res, userId) => {
  try {
    const { title, content, summary, tags, relatedIds, codeSnippet, source, embedding, createdAt, updatedAt } = req.body;
    const note = await noteRepo.create({
      id: req.body.id || crypto.randomUUID(),
      title,
      content,
      summary,
      tags,
      relatedIds,
      codeSnippet,
      source,
      embedding,
      userId,
      createdAt: toDbDate(createdAt),
      updatedAt: updatedAt !== undefined ? toDbDate(updatedAt) : new Date(),
    });

    try {
      await syncNoteToChroma(userId, note);
    } catch (syncError) {
      console.warn('[Data API] Failed to sync created note to Chroma:', syncError);
    }

    res.json(mapNoteToFrontend(note));
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
    const { title, content, summary, tags, relatedIds, codeSnippet, source, embedding } = req.body;
    const updateData = { title, content, summary, tags, relatedIds, codeSnippet, source, embedding };
    const note = await noteRepo.update(req.params.id, updateData);

    try {
      await syncNoteToChroma(userId, note);
    } catch (syncError) {
      console.warn('[Data API] Failed to sync updated note to Chroma:', syncError);
    }

    res.json(mapNoteToFrontend(note));
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

    try {
      await deleteNoteFromChroma(userId, req.params.id);
    } catch (syncError) {
      console.warn('[Data API] Failed to delete note from Chroma:', syncError);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete note:", error);
    res.status(500).json({ error: "Failed to delete note" });
  }
}));

router.post("/notes/:id/sync", requireAuth(async (req, res, userId) => {
  try {
    const note = await noteRepo.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }
    if (note.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await syncNoteToChroma(userId, note);
    res.json({ success: true });
  } catch (error) {
    console.warn('[Data API] Failed to sync note to Chroma:', error);
    res.status(500).json({ error: "Failed to sync note to Chroma" });
  }
}));

router.get("/notes/search", requireAuth(async (req, res, userId) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.json([]);
    }
    const notes = await noteRepo.search(userId, query);
    res.json(notes.map(mapNoteToFrontend));
  } catch (error) {
    console.error("Failed to search notes:", error);
    res.status(500).json({ error: "Failed to search notes" });
  }
}));

router.get("/flashcards", requireAuth(async (req, res, userId) => {
  try {
    const cards = await flashcardRepo.findByUser(userId);
    res.json(cards.map(mapFlashcardToFrontend));
  } catch (error) {
    console.error("Failed to list flashcards:", error);
    res.status(500).json({ error: "Failed to list flashcards" });
  }
}));

router.get("/flashcards/due", requireAuth(async (req, res, userId) => {
  try {
    const cards = await flashcardRepo.findDueForReview(userId);
    res.json(cards.map(mapFlashcardToFrontend));
  } catch (error) {
    console.error("Failed to list due flashcards:", error);
    res.status(500).json({ error: "Failed to list due flashcards" });
  }
}));

router.post("/flashcards", requireAuth(async (req, res, userId) => {
  try {
    const { question, answer, stability, difficulty, elapsedDays, scheduledDays, state, nextReview, repetitions, createdAt, noteId } = req.body;
    const card = await flashcardRepo.create({
      id: crypto.randomUUID(),
      question,
      answer,
      stability,
      difficulty,
      elapsedDays,
      scheduledDays,
      state,
      noteId,
      userId,
      due: nextReview !== undefined ? toDbDate(nextReview) : new Date(),
      reps: repetitions !== undefined ? repetitions : 0,
      createdAt: toDbDate(createdAt),
    });
    res.json(mapFlashcardToFrontend(card));
  } catch (error) {
    console.error("Failed to create flashcard:", error);
    res.status(500).json({ error: "Failed to create flashcard" });
  }
}));

router.post("/flashcards/batch", requireAuth(async (req, res, userId) => {
  try {
    const { cards } = req.body;
    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: "cards must be a non-empty array" });
    }
    const items = cards.map((c: any) => ({
      id: c.id || crypto.randomUUID(),
      question: c.question,
      answer: c.answer,
      stability: c.stability,
      difficulty: c.difficulty,
      elapsedDays: c.elapsedDays,
      scheduledDays: c.scheduledDays,
      state: c.state,
      noteId: c.noteId,
      userId,
      due: c.nextReview !== undefined ? toDbDate(c.nextReview) : new Date(),
      reps: c.repetitions !== undefined ? c.repetitions : 0,
      createdAt: toDbDate(c.createdAt),
    }));
    const created = await flashcardRepo.createBatch(items);
    res.json(created.map(mapFlashcardToFrontend));
  } catch (error) {
    console.error("Failed to batch create flashcards:", error);
    res.status(500).json({ error: "Failed to batch create flashcards" });
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
    const { question, answer, stability, difficulty, elapsedDays, scheduledDays, state, nextReview, repetitions } = req.body;
    const updatePayload: any = { question, answer, stability, difficulty, elapsedDays, scheduledDays, state };
    if (nextReview !== undefined) updatePayload.due = toDbDate(nextReview);
    if (repetitions !== undefined) updatePayload.reps = repetitions;
    const card = await flashcardRepo.update(req.params.id, updatePayload);
    res.json(mapFlashcardToFrontend(card));
  } catch (error) {
    console.error("Failed to update flashcard:", error);
    res.status(500).json({ error: "Failed to update flashcard" });
  }
}));

router.delete("/flashcards/note/:noteId", requireAuth(async (req, res, userId) => {
  try {
    const cards = await flashcardRepo.findByNote(req.params.noteId);
    for (const card of cards) {
      if (card.userId === userId) {
        await flashcardRepo.delete(card.id);
      }
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

    const { rating, stability, difficulty, elapsedDays, scheduledDays, state, nextReview, repetitions } = req.body;
    const updatePayload: any = {
      lastReview: new Date(),
    };

    const fsrsFieldsProvided = stability !== undefined || difficulty !== undefined ||
                               elapsedDays !== undefined || scheduledDays !== undefined ||
                               state !== undefined || nextReview !== undefined || repetitions !== undefined;

    if (rating !== undefined && !fsrsFieldsProvided) {
      const ratingValue = typeof rating === 'number' && rating >= 1 && rating <= 4 ? rating : 3;
      const currentCard = {
        ...existing,
        lastReview: existing.lastReview?.getTime() || 0,
        nextReview: existing.due?.getTime() || Date.now(),
        repetitions: existing.reps || 0,
      };
      const scheduledCard = schedule(currentCard as any, ratingValue as Rating);
      updatePayload.stability = scheduledCard.stability;
      updatePayload.difficulty = scheduledCard.difficulty;
      updatePayload.state = scheduledCard.state;
      updatePayload.reps = scheduledCard.repetitions;
      updatePayload.elapsedDays = Math.floor((Date.now() - scheduledCard.lastReview) / (1000 * 60 * 60 * 24));
      updatePayload.scheduledDays = Math.max(1, Math.round(scheduledCard.stability));
      updatePayload.due = new Date(scheduledCard.nextReview);
    } else {
      if (stability !== undefined) updatePayload.stability = stability;
      if (difficulty !== undefined) updatePayload.difficulty = difficulty;
      if (elapsedDays !== undefined) updatePayload.elapsedDays = elapsedDays;
      if (scheduledDays !== undefined) updatePayload.scheduledDays = scheduledDays;
      if (state !== undefined) updatePayload.state = state;
      if (nextReview !== undefined) updatePayload.due = toDbDate(nextReview);
      if (repetitions !== undefined) updatePayload.reps = repetitions;
    }

    const card = await flashcardRepo.update(req.params.id, updatePayload);
    res.json(mapFlashcardToFrontend(card));
  } catch (error) {
    console.error("Failed to review flashcard:", error);
    res.status(500).json({ error: "Failed to review flashcard" });
  }
}));

router.get("/chat-sessions", requireAuth(async (req, res, userId) => {
  try {
    console.log("[DEBUG] Getting chat sessions for user:", userId);
    const sessions = await chatRepo.session.findByUser(userId);
    console.log("[DEBUG] Found sessions:", sessions.length, sessions.map(s => ({ id: s.id, title: s.title, userId: s.userId })));
    const sessionsWithMessages = await Promise.all(
      sessions.map(async (session) => {
        const messages = await chatRepo.message.findBySession(session.id);
        return {
          ...session,
          updatedAt: toFrontendTimestamp(session.updatedAt),
          messages: messages.map(m => ({
            role: m.role,
            text: m.content,
            thought: m.thinking,
            image: m.image,
          })),
        };
      })
    );
    console.log("[DEBUG] Returning sessions with messages:", sessionsWithMessages.length);
    res.json(sessionsWithMessages);
  } catch (error) {
    console.error("Failed to list chat sessions:", error);
    res.status(500).json({ error: "Failed to list chat sessions" });
  }
}));

router.post("/chat-sessions", requireAuth(async (req, res, userId) => {
  try {
    const { id, messages, userId: _userId, title, model, personaId } = req.body;
    const sessionId = id || crypto.randomUUID();
    const session = await chatRepo.session.create({
      id: sessionId,
      userId,
      title: title || '新会话',
      model,
      personaId,
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
    const { messages, userId: _userId, title, model, personaId } = req.body;
    const updatePayload: any = {};
    if (title !== undefined) updatePayload.title = title;
    if (model !== undefined) updatePayload.model = model;
    if (personaId !== undefined) updatePayload.personaId = personaId;
    const session = await chatRepo.session.update(req.params.id, updatePayload);
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
    const { name, description, systemPrompt, icon, isHidden } = req.body;
    const updateData = { name, description, systemPrompt, icon, isHidden };
    const persona = await personaRepo.update(req.params.id, updateData);
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

router.get("/account/connected-providers", requireAuth(async (req, res, userId) => {
  try {
    const userAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, userId),
    });
    const providers = userAccounts.map(acc => ({
      provider: acc.providerId,
      accountId: acc.accountId,
    }));
    res.json({ accounts: providers });
  } catch (error) {
    console.error("Failed to get connected providers:", error);
    res.status(500).json({ error: "Failed to get connected providers" });
  }
}));

router.post("/account/unlink-provider", requireAuth(async (req, res, userId) => {
  try {
    const { provider } = req.body;
    const userAccounts = await db.query.accounts.findMany({
      where: eq(accounts.userId, userId),
    });
    
    if (userAccounts.length <= 1) {
      return res.status(400).json({ error: "Cannot unlink the only remaining login method" });
    }
    
    await db.delete(accounts).where(and(eq(accounts.userId, userId), eq(accounts.providerId, provider)));
    
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to unlink provider:", error);
    res.status(500).json({ error: "Failed to unlink provider" });
  }
}));

export default router;
