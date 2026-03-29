import { ChromaClient } from "chromadb";

const client = new ChromaClient({
  path: process.env.CHROMA_PATH || "./data/chroma",
});

type ChromaCollection = Awaited<ReturnType<typeof client.getOrCreateCollection>>;
export type ChromaQueryResult = Awaited<ReturnType<ChromaCollection['query']>>;

export type VectorUpsertItem = {
  noteId: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, string | number | boolean | null>;
};

type ChromaFilter = Record<string, string | number | boolean>;

export const vectorStore = {
  async getCollection(userId: string) {
    return client.getOrCreateCollection({
      name: `notes_${userId}`,
      metadata: { userId },
    });
  },

  async addNote(
    userId: string,
    noteId: string,
    content: string,
    embedding: number[],
    metadata?: Record<string, any>
  ) {
    const collection = await this.getCollection(userId);
    await collection.add({
      ids: [noteId],
      embeddings: [embedding],
      metadatas: [metadata || {}],
      documents: [content],
    });
  },

  async search(userId: string, queryEmbedding: number[], nResults: number = 5) {
    const collection = await this.getCollection(userId);
    return collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults,
    });
  },

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const heartbeatClient = client as unknown as { heartbeat?: () => Promise<unknown> };
      if (typeof heartbeatClient.heartbeat === 'function') {
        await heartbeatClient.heartbeat();
      } else {
        await client.listCollections();
      }
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Chroma health check failed',
      };
    }
  },

  async searchWithFilter(
    userId: string,
    queryEmbedding: number[],
    filter: ChromaFilter,
    nResults: number = 5
  ): Promise<ChromaQueryResult> {
    const collection = await this.getCollection(userId);
    return collection.query({
      queryEmbeddings: [queryEmbedding],
      where: filter,
      nResults,
    });
  },

  async batchUpsert(userId: string, items: VectorUpsertItem[]): Promise<void> {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    const collection = await this.getCollection(userId);
    await collection.upsert({
      ids: items.map((item) => item.noteId),
      documents: items.map((item) => item.content),
      embeddings: items.map((item) => item.embedding),
      metadatas: items.map((item) => item.metadata || {}),
    });
  },

  async deleteNote(userId: string, noteId: string) {
    const collection = await this.getCollection(userId);
    await collection.delete({ ids: [noteId] });
  },

  async updateNote(
    userId: string,
    noteId: string,
    content: string,
    embedding: number[],
    metadata?: Record<string, any>
  ) {
    await this.deleteNote(userId, noteId);
    await this.addNote(userId, noteId, content, embedding, metadata);
  },
};
