import { ChromaClient } from "chromadb";

const client = new ChromaClient({
  path: process.env.CHROMA_PATH || "./data/chroma",
});

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
