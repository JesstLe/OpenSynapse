import { Note, Flashcard, ChatSession, Persona } from "../types";

const API_BASE = "/api";

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (typeof window !== 'undefined' && (window as any).__DEV_AUTH_BYPASS__) {
    headers['X-Dev-Bypass'] = '1';
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Notes API
export const notesApi = {
  async list(): Promise<Note[]> {
    return fetchWithAuth(`${API_BASE}/notes`);
  },

  async create(note: Omit<Note, "id" | "createdAt">): Promise<Note> {
    return fetchWithAuth(`${API_BASE}/notes`, {
      method: "POST",
      body: JSON.stringify(note),
    });
  },

  async update(id: string, note: Partial<Note>): Promise<Note> {
    return fetchWithAuth(`${API_BASE}/notes/${id}`, {
      method: "PUT",
      body: JSON.stringify(note),
    });
  },

  async delete(id: string): Promise<void> {
    return fetchWithAuth(`${API_BASE}/notes/${id}`, {
      method: "DELETE",
    });
  },

  async search(query: string): Promise<Note[]> {
    return fetchWithAuth(`${API_BASE}/notes/search?q=${encodeURIComponent(query)}`);
  },
};

// Flashcards API
export const flashcardsApi = {
  async list(): Promise<Flashcard[]> {
    return fetchWithAuth(`${API_BASE}/flashcards`);
  },

  async listDue(): Promise<Flashcard[]> {
    return fetchWithAuth(`${API_BASE}/flashcards/due`);
  },

  async create(card: Omit<Flashcard, "id">): Promise<Flashcard> {
    return fetchWithAuth(`${API_BASE}/flashcards`, {
      method: "POST",
      body: JSON.stringify(card),
    });
  },

  async createBatch(cards: Omit<Flashcard, "id">[]): Promise<Flashcard[]> {
    return fetchWithAuth(`${API_BASE}/flashcards/batch`, {
      method: "POST",
      body: JSON.stringify({ cards }),
    });
  },

  async update(id: string, card: Partial<Flashcard>): Promise<Flashcard> {
    return fetchWithAuth(`${API_BASE}/flashcards/${id}`, {
      method: "PUT",
      body: JSON.stringify(card),
    });
  },

  async deleteByNoteId(noteId: string): Promise<void> {
    return fetchWithAuth(`${API_BASE}/flashcards/note/${noteId}`, {
      method: "DELETE",
    });
  },

  async review(id: string, rating: number): Promise<Flashcard> {
    return fetchWithAuth(`${API_BASE}/flashcards/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ rating }),
    });
  },
};

// Chat Sessions API
export const chatSessionsApi = {
  async list(): Promise<ChatSession[]> {
    return fetchWithAuth(`${API_BASE}/chat-sessions`);
  },

  async create(session: Omit<ChatSession, "id">): Promise<ChatSession> {
    return fetchWithAuth(`${API_BASE}/chat-sessions`, {
      method: "POST",
      body: JSON.stringify(session),
    });
  },

  async update(id: string, session: Partial<ChatSession>): Promise<ChatSession> {
    return fetchWithAuth(`${API_BASE}/chat-sessions/${id}`, {
      method: "PUT",
      body: JSON.stringify(session),
    });
  },

  async delete(id: string): Promise<void> {
    return fetchWithAuth(`${API_BASE}/chat-sessions/${id}`, {
      method: "DELETE",
    });
  },
};

// Personas API
export const personasApi = {
  async list(): Promise<Persona[]> {
    return fetchWithAuth(`${API_BASE}/personas`);
  },

  async create(persona: Omit<Persona, "id">): Promise<Persona> {
    return fetchWithAuth(`${API_BASE}/personas`, {
      method: "POST",
      body: JSON.stringify(persona),
    });
  },

  async update(id: string, persona: Partial<Persona>): Promise<Persona> {
    return fetchWithAuth(`${API_BASE}/personas/${id}`, {
      method: "PUT",
      body: JSON.stringify(persona),
    });
  },

  async delete(id: string): Promise<void> {
    return fetchWithAuth(`${API_BASE}/personas/${id}`, {
      method: "DELETE",
    });
  },
};

// User API Keys API
export const apiKeysApi = {
  async get(): Promise<{
    geminiApiKey?: string;
    openaiApiKey?: string;
    minimaxApiKey?: string;
    zhipuApiKey?: string;
    moonshotApiKey?: string;
  }> {
    return fetchWithAuth(`${API_BASE}/api-keys`);
  },

  async update(keys: {
    geminiApiKey?: string;
    openaiApiKey?: string;
    minimaxApiKey?: string;
    zhipuApiKey?: string;
    moonshotApiKey?: string;
  }): Promise<void> {
    return fetchWithAuth(`${API_BASE}/api-keys`, {
      method: "PUT",
      body: JSON.stringify(keys),
    });
  },
};

// Payment API
export const paymentApi = {
  async getConfig(): Promise<{
    configured: boolean;
    products: { code: string; subject: string; amount: string; body: string }[];
  }> {
    return fetchWithAuth(`${API_BASE}/payment/config`);
  },

  async createOrder(productCode: string): Promise<{
    orderId: string;
    outTradeNo: string;
    html: string;
  }> {
    return fetchWithAuth(`${API_BASE}/payment/create`, {
      method: 'POST',
      body: JSON.stringify({ productCode }),
    });
  },

  async getOrderStatus(orderId: string): Promise<{
    id: string;
    outTradeNo: string;
    status: string;
    totalAmount: string;
    subject: string;
    productCode: string;
    paidAt: string | null;
    createdAt: string | null;
  }> {
    return fetchWithAuth(`${API_BASE}/payment/status/${orderId}`);
  },

  async getOrders(): Promise<Array<{
    id: string;
    outTradeNo: string;
    status: string;
    totalAmount: string;
    subject: string;
    productCode: string;
    paidAt: string | null;
    createdAt: string | null;
  }>> {
    return fetchWithAuth(`${API_BASE}/payment/orders`);
  },

  async getPremiumStatus(): Promise<{ premium: boolean }> {
    return fetchWithAuth(`${API_BASE}/payment/premium-status`);
  },
};
