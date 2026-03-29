import { noteRepo } from '../repositories/note.repo.js';
import { generateEmbeddingsServer, type EmbeddingCredentials } from '../services/embeddingService.js';
import { vectorStore, type ChromaQueryResult } from '../vector/chroma.js';

type SearchSource = 'vector' | 'keyword';

export type SearchResult = {
  noteId: string;
  title: string;
  content: string;
  summary?: string;
  score: number;
  sources: SearchSource[];
  vectorScore?: number;
  keywordScore?: number;
};

export type RAGConfig = {
  embeddingModelId?: string;
  embeddingCredentials?: EmbeddingCredentials;
  vectorWeight?: number;
  keywordWeight?: number;
  vectorTopK?: number;
  keywordTopK?: number;
  maxResults?: number;
  minScore?: number;
  enableVector?: boolean;
};

type RankedCandidate = {
  noteId: string;
  title: string;
  content: string;
  summary?: string | null;
  signalScore: number;
};

const DEFAULT_RAG_CONFIG: Required<Omit<RAGConfig, 'embeddingModelId' | 'embeddingCredentials'>> = {
  vectorWeight: 0.7,
  keywordWeight: 0.3,
  vectorTopK: 8,
  keywordTopK: 8,
  maxResults: 6,
  minScore: 0.08,
  enableVector: true,
};

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,.;:!?，。；：！？、()\[\]{}"'`“”‘’]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function computeKeywordSignal(query: string, title: string, content: string): number {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) {
    return 0;
  }

  const haystack = `${title}\n${content}`.toLowerCase();
  let matched = 0;
  for (const term of terms) {
    if (haystack.includes(term)) {
      matched += 1;
    }
  }

  return matched / terms.length;
}

function distanceToSimilarity(distance: number | undefined): number {
  if (typeof distance !== 'number' || Number.isNaN(distance)) {
    return 0;
  }

  if (distance <= 0) {
    return 1;
  }

  return 1 / (1 + distance);
}

function extractVectorCandidates(
  queryResult: ChromaQueryResult,
  noteMap: Map<string, { title: string; content: string; summary: string | null }>
): RankedCandidate[] {
  const ids = Array.isArray(queryResult?.ids?.[0]) ? queryResult.ids[0] : [];
  const distances = Array.isArray(queryResult?.distances?.[0]) ? queryResult.distances[0] : [];
  const documents = Array.isArray(queryResult?.documents?.[0]) ? queryResult.documents[0] : [];

  const candidates: RankedCandidate[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    const noteId = ids[i];
    if (!noteId) {
      continue;
    }

    const linked = noteMap.get(noteId);
    const fallbackContent = typeof documents[i] === 'string' ? documents[i] : '';
    if (!linked && !fallbackContent) {
      continue;
    }

    candidates.push({
      noteId,
      title: linked?.title || 'Untitled Note',
      content: linked?.content || fallbackContent,
      summary: linked?.summary,
      signalScore: distanceToSimilarity(distances[i]),
    });
  }

  return candidates;
}

function fuseWithRRF(
  vectorRanked: RankedCandidate[],
  keywordRanked: RankedCandidate[],
  config: Required<Omit<RAGConfig, 'embeddingModelId' | 'embeddingCredentials'>>
): SearchResult[] {
  const fused = new Map<string, SearchResult>();

  const applyList = (items: RankedCandidate[], source: SearchSource, weight: number): void => {
    items.forEach((item, index) => {
      const existing = fused.get(item.noteId) || {
        noteId: item.noteId,
        title: item.title,
        content: item.content,
        summary: item.summary || undefined,
        score: 0,
        sources: [],
      };

      existing.score += weight * (1 / (index + 1));
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
      }

      if (source === 'vector') {
        existing.vectorScore = item.signalScore;
      } else {
        existing.keywordScore = item.signalScore;
      }

      fused.set(item.noteId, existing);
    });
  };

  applyList(vectorRanked, 'vector', config.vectorWeight);
  applyList(keywordRanked, 'keyword', config.keywordWeight);

  return Array.from(fused.values())
    .filter((item) => item.score >= config.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.maxResults);
}

export async function hybridSearch(
  userId: string,
  query: string,
  config: RAGConfig = {}
): Promise<SearchResult[]> {
  const mergedConfig = {
    ...DEFAULT_RAG_CONFIG,
    ...config,
  };

  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return [];
  }

  const [keywordHits, userNotes] = await Promise.all([
    noteRepo.search(userId, normalizedQuery),
    noteRepo.findByUser(userId),
  ]);

  const noteMap = new Map(
    userNotes.map((note) => [
      note.id,
      {
        title: note.title,
        content: note.content,
        summary: note.summary,
      },
    ])
  );

  const keywordRanked: RankedCandidate[] = keywordHits
    .map((note) => ({
      noteId: note.id,
      title: note.title,
      content: note.content,
      summary: note.summary,
      signalScore: computeKeywordSignal(normalizedQuery, note.title, note.content),
    }))
    .filter((item) => item.signalScore > 0)
    .sort((a, b) => b.signalScore - a.signalScore)
    .slice(0, mergedConfig.keywordTopK);

  let vectorRanked: RankedCandidate[] = [];
  if (mergedConfig.enableVector) {
    const health = await vectorStore.healthCheck();
    if (health.healthy) {
      const embedding = await generateEmbeddingsServer(
        [normalizedQuery],
        config.embeddingModelId,
        config.embeddingCredentials
      );

      if (!embedding.degraded && embedding.values.length > 0) {
        try {
          const queryResult = await vectorStore.search(userId, embedding.values, mergedConfig.vectorTopK);
          vectorRanked = extractVectorCandidates(queryResult, noteMap).slice(0, mergedConfig.vectorTopK);
        } catch (error) {
          console.warn('[RAG] Vector search failed, fallback to keyword-only mode:', error);
        }
      } else if (embedding.reason) {
        console.warn('[RAG] Embedding degraded, fallback to keyword-only mode:', embedding.reason);
      }
    } else {
      console.warn('[RAG] Chroma unavailable, fallback to keyword-only mode:', health.error);
    }
  }

  return fuseWithRRF(vectorRanked, keywordRanked, mergedConfig);
}

export function buildRAGContext(results: SearchResult[]): string {
  if (!Array.isArray(results) || results.length === 0) {
    return '';
  }

  return results
    .map((item, index) => {
      const excerpt = item.content.length > 500
        ? `${item.content.slice(0, 500)}...`
        : item.content;
      return [
        `### 检索结果 ${index + 1}: ${item.title}`,
        item.summary ? `摘要: ${item.summary}` : '',
        `内容: ${excerpt}`,
        `来源: ${item.sources.join('+')}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

export function shouldRetrieveRAG(query: string): boolean {
  const normalized = query.trim();
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  const smallTalkPattern = /^(hi|hello|你好|早上好|晚上好|谢谢|thanks|ok|好的|在吗)[!！。,. ]*$/i;
  if (smallTalkPattern.test(lower)) {
    return false;
  }

  const strongIntentPattern = /(笔记|总结|复盘|回顾|复习|之前|历史|根据|基于|还记得|what did|from my notes|knowledge)/i;
  if (strongIntentPattern.test(lower)) {
    return true;
  }

  const hasQuestion = /[?？]/.test(normalized);
  if (hasQuestion && normalized.length >= 12) {
    return true;
  }

  const termCount = tokenizeQuery(normalized).length;
  return termCount >= 4;
}
