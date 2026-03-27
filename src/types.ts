export interface Note {
  id: string;
  title: string;
  summary: string;
  content: string;
  codeSnippet?: string;
  tags: string[];
  relatedIds: string[];
  createdAt: number;
  embedding?: number[];
  userId: string;
}

export interface Flashcard {
  id: string;
  noteId: string;
  question: string;
  answer: string;
  nextReview: number;
  lastReview: number;
  stability: number;
  difficulty: number;
  repetitions: number;
  state: number; // 0: New, 1: Learning, 2: Review, 3: Relearning
  userId: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string; // base64 string
}

export interface ChatSession {
  id: string;
  title?: string;
  messages: ChatMessage[];
  updatedAt: number;
  userId: string;
}
