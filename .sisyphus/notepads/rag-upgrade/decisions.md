# RAG Upgrade Decisions

## 2026-03-29

- Keep RAG injection on server API boundary (`ai.ts`) instead of chat service layer to ensure all providers and both sync/stream routes share identical retrieval behavior.
- Preserve client-side RAG helper functions with `@deprecated` tags in `gemini.ts` for backward compatibility during phased migration.

## 2026-03-29 (Phase 1.6)

- Place Chroma note sync at server data boundary (`src/api/data.ts`) instead of direct frontend vector calls, so all writes follow auth isolation and non-blocking fallback consistently.
- Treat Chroma as optional infrastructure: health-check before sync/delete and never fail main note CRUD when vector operations fail.
- Persist missing embeddings on server during sync (if generation succeeds) to avoid repeated client-side embedding dependency and improve future sync success probability.
