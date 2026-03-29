# RAG Upgrade Notepad

## Current Architecture Analysis

### What Exists

**Unused but Ready:**
- `src/vector/chroma.ts` - 54 lines, complete vector store implementation
  - `getCollection(userId)` - per-user collection
  - `addNote/search/deleteNote/updateNote` - all CRUD
  - Uses `chromadb` client

**Client-Side RAG (Problem):**
- `src/services/gemini.ts:263-285` - `findRelevantNotes()` loads ALL notes, O(n) similarity
- `src/services/gemini.ts:140-153` - `shouldUseRAG()` hardcoded keyword/length check
- `src/services/gemini.ts:511-533` - `generateEmbedding()` calls backend
- Embeddings stored in PostgreSQL `notes.embedding` column (real[])

**Key Constraints:**
- Multi-provider: Gemini native function_declarations + OpenAI-compatible tools
- UserId isolation for Chroma collections: `notes_${userId}`
- SSE streaming must continue working
- Graceful degradation if Chroma unavailable

### Current RAG Flow (Client-Side)

```
ChatView → chatWithAIStream(messages, notes, persona)
  → shouldUseRAG() — keyword/length check (hardcoded)
  → findRelevantNotes(query, notes) — O(n) in browser
    → generateEmbedding(query) → /api/ai/embedContent
    → notes.map(n => cosineSimilarity(...)) 
    → filter > 0.6, sort, take top 3
  → getSystemInstruction(contextText, persona) — static injection
  → generateContentStream(model, contents, systemInstruction)
```

### Current Tool Calling Gap

- `codeAssist.ts` already supports `tools` and `toolConfig` in request body (line 43-44)
- `providerGateway.ts` currently does NOT forward `tools` parameter
- No server-side route for tool execution (retrieval)
- No tool_call SSE event type

## Multi-Provider Tool Calling Mapping

### Gemini (gemini_native)
```typescript
// Request format
tools: [{
  functionDeclarations: [{
    name: string,
    description: string,
    parameters: { type: "object", properties: {...} }
  }]
}]

// Response format
{ functionCall: { name: string, args: Record<string, any> } }
```

### OpenAI Compatible (openai_compat)
```typescript
// Request format  
tools: [{
  type: "function",
  function: {
    name: string,
    description: string,
    parameters: {...}
  }
}]

// Response format
{ index: number, id: string, type: "function", function: { name: string, arguments: string } }
```

### Anthropic Compatible (anthropic_compat)
```typescript
// Request format - different block structure
tools: [{
  name: string,
  description: string,
  input_schema: {...}
}]

// Response format - content blocks
{ type: "tool_use", id: string, name: string, input: {...} }
```

## Decision Records

### DR-1: Tool Calling Architecture
- **Decision**: Agentic loop ON SERVER, not client
- **Rationale**: RAG needs server access to Chroma + DB; client only handles UI
- **Implementation**: Server loops on tool_call, client sees unified text stream
- **Tradeoff**: Server complexity ↑, but correct separation of concerns

### DR-2: System Prompt Strategy
- **Decision**: Keep persona system instruction on client side
- **Rationale**: Different providers need different system instruction format (Gemini vs OpenAI vs Anthropic)
- **Implementation**: Client sends `systemInstruction` + `ragContext` separately
- **Server**: Merges in RAG context before calling provider

### DR-3: Graceful Degradation
- **Decision**: Chroma unavailable → PostgreSQL ILIKE fallback
- **Rationale**: Vector DB may not be available in all deployments
- **Implementation**: `hybridSearch()` tries Chroma first, falls back to `noteRepo.search()`

### DR-4: Embedding Sync
- **Decision**: On note create/update → sync to both PostgreSQL + Chroma
- **Rationale**: Need embedding in Postgres for other features (semanticLinks, graph)
- **Implementation**: `handleSaveNote()` calls both stores

## 2026-03-29 Phase 1.4 + 1.5 Integration Notes

- Server-side RAG injection has been centralized in `src/api/ai.ts` via `injectRagContextIfEnabled(req, userId)` and reused by both `/generateContent` and `/generateContentStream` routes.
- The middleware merges retrieval snippets into existing `req.body.config.systemInstruction` so persona prompt behavior remains intact and RAG is additive.
- Query extraction now uses `extractLastUserMessage(contents)` from request payload content parts, matching current multimodal message shape.
- Frontend chat pipeline no longer performs per-request client note retrieval in `chatWithAI/chatWithAIStream`; it now forwards `enableRAG` for server gating.
- `ChatView` streaming call now passes `userId` + `{ enableRAG: true }` instead of sending full `notes`, reducing client payload coupling for RAG.

## 2026-03-29 Phase 1.6 Chroma Note Sync

- `src/api/data.ts` now centralizes note→Chroma synchronization with non-blocking behavior (`syncNoteToChroma` + `deleteNoteFromChroma`).
- Chroma sync path now checks `vectorStore.healthCheck()` first; if unavailable, it only `console.warn` and continues CRUD flow (no request failure).
- Note create/update now attempt sync after DB write, and delete now attempts Chroma deletion after DB delete.
- If note embedding is missing during sync, server generates it via `generateEmbeddingsServer`, persists it back to PostgreSQL (`noteRepo.update(note.id, { embedding })`), then upserts to Chroma.
- Added `/api/notes/:id/sync` endpoint for explicit/manual resync opportunities when needed.
- `App.tsx` save/update now prefer persisted server note response so client state keeps server-generated embedding when created on backend.
