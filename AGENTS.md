# OpenSynapse (突触) - AGENTS.md

**Generated:** 2026-03-27  
**Commit:** 8a8c030  
**Branch:** main

## OVERVIEW

AI-driven knowledge compounding system with spaced repetition (FSRS), knowledge graph visualization, and multi-device sync. Built with React 19 + TypeScript + Vite + Express + Firebase.

## STRUCTURE

```
./
├── server.ts              # Express + Vite dev server
├── cli.ts                 # CLI tool for AI content processing
├── vite.config.ts         # Vite + Tailwind + React config
├── tsconfig.json          # TypeScript config (ES2022, path alias @/)
├── package.json           # Dependencies (React 19, Firebase, D3, etc.)
├── firestore.rules        # Firebase security rules
├── firebase-blueprint.json
├── index.html             # HTML entry point
├── src/
│   ├── main.tsx           # React app entry
│   ├── App.tsx            # Main app component
│   ├── types.ts           # TypeScript interfaces
│   ├── firebase.ts        # Firebase config
│   ├── index.css          # Global styles
│   ├── components/        # React components
│   │   ├── ChatView.tsx
│   │   ├── DashboardView.tsx
│   │   ├── GraphView.tsx
│   │   ├── MiniGraph.tsx
│   │   ├── NotesView.tsx
│   │   └── ReviewView.tsx
│   ├── lib/               # Utilities
│   │   ├── math.ts
│   │   └── utils.ts
│   └── services/          # Business logic
│       ├── fsrs.ts
│       └── gemini.ts
└── data.json              # Local data store (created at runtime)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add API endpoint | `server.ts` | Express routes in `startServer()` |
| Modify CLI | `cli.ts` | Uses GoogleGenAI for content extraction |
| Change build config | `vite.config.ts` | Tailwind 4, React plugin, path alias |
| Update types | `src/types.ts` | Note, Flashcard, ChatMessage interfaces |
| Add React component | `src/components/` | ChatView, DashboardView, GraphView, etc. |
| Modify FSRS algorithm | `src/services/fsrs.ts` | Spaced repetition logic |
| Update Gemini service | `src/services/gemini.ts` | AI content processing |
| Firebase config | `src/firebase.ts` | Auth and Firestore setup |
| Firebase rules | `firestore.rules` | Security rules for Firestore |
| Dependencies | `package.json` | React 19, Firebase 12, Tailwind 4 |

## ENTRY POINTS

- **Development:** `npm run dev` → `tsx server.ts`
- **CLI:** `npx tsx cli.ts <file.txt>`
- **Production:** `npm run build` → Vite builds to `dist/`

## CONVENTIONS

### TypeScript
- Target: ES2022, Module: ESNext
- Path alias: `@/` maps to project root
- Decorators enabled (`experimentalDecorators: true`)
- No emit (`noEmit: true`) - Vite handles compilation

### Code Style
- Use spread operator for immutable updates
- Async/await with try-catch for error handling
- Environment variables required: `GEMINI_API_KEY`, `APP_URL` (optional)

### Project-Specific
- Chinese language output for AI-generated content (`cli.ts`)
- Data stored in `data.json` (created at runtime if missing)
- Note/flashcard IDs use `Math.random().toString(36).substr(2, 9)`

## ANTI-PATTERNS

- **DO NOT** modify HMR configuration in `vite.config.ts` - disabled in AI Studio to prevent flickering
- **DO NOT** hardcode `GEMINI_API_KEY` - must use `.env.local`
- **AVOID** console.log in production code (use proper logging)

## COMMANDS

```bash
# Install dependencies
npm install

# Development (requires GEMINI_API_KEY in .env.local)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check only
npm run lint

# CLI: Process file with AI
npx tsx cli.ts <path_to_exported_chat.txt>
```

## NOTES

- **AI Studio Origin:** This is an exported AI Studio app (https://ai.studio/apps/0908f2c8-7d16-420f-904a-55223d56e571)
- **FSRS Algorithm:** Spaced repetition algorithm implemented in `src/services/fsrs.ts`
- **D3 Graph:** Knowledge graph visualization with force-directed layout in `src/components/GraphView.tsx`
- **Firebase Sync:** Cloud storage for notes and flashcards via `src/firebase.ts`
- **Project Structure:** Standard Vite + React structure with `src/` directory
