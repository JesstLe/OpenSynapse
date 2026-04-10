/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Network, 
  BookOpen, 
  Layers, 
  Send, 
  Plus, 
  ChevronRight,
  Brain,
  History,
  Settings,
  X,
  LayoutDashboard,
  Sun,
  Moon,
  CreditCard
} from 'lucide-react';
import { Note, Flashcard, ChatMessage, ChatSession, Persona } from './types';
import { chatWithAI, processConversation, findSemanticLinks, generateEmbedding, BreakthroughConfig, startBreakthroughChat } from './services/gemini';
import { cn, generateUUID } from './lib/utils';
import { schedule, Rating } from './services/maimemo';
import { authClient } from './auth/client';

// Components
import ChatView from './components/ChatView';
import GraphView from './components/GraphView';
import ReviewView from './components/ReviewView';
import NotesView from './components/NotesView';
import DashboardView from './components/DashboardView';
import SettingsView from './components/SettingsView';
import LoginSelection from './components/auth/LoginSelection';

import { notesApi, flashcardsApi, chatSessionsApi, personasApi } from './services/dataApi';
import { AlipayIntegrationView } from './components/AlipayIntegrationView';
type View = 'chat' | 'graph' | 'review' | 'notes' | 'dashboard' | 'settings' | 'alipay';

interface BetterAuthUser {
  id: string;
  email?: string;
  name?: string;
  image?: string;
  emailVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

function generateUserAvatarColor(name: string): string {
  const colors = [
    '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
    '#EF4444', '#6366F1', '#14B8A6', '#F97316', '#84CC16'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getUserInitials(name: string): string {
  if (!name || name === 'U') return 'U';
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.charAt(0).toUpperCase();
}

function sanitizeChatSession(session: ChatSession, userId: string) {
  const base: Record<string, any> = {
    id: session.id,
    title: session.title || '新会话',
    messages: session.messages.map((message) => {
      const m: Record<string, any> = { role: message.role, text: message.text };
      if (message.image) m.image = message.image;
      if (message.thought) m.thought = message.thought;
      return m;
    }),
    updatedAt: session.updatedAt,
    userId,
  };
  if (session.source) base.source = session.source;
  if (session.importedAt) base.importedAt = session.importedAt;
  if (session.fingerprint) base.fingerprint = session.fingerprint;
  if (session.originalExportedAt) base.originalExportedAt = session.originalExportedAt;
  if (session.personaId) base.personaId = session.personaId;
  if (session.model) base.model = session.model;
  return base;
}

function sanitizeNoteForStorage(note: Note) {
  const payload: Record<string, any> = {
    id: note.id,
    title: note.title,
    summary: note.summary,
    content: note.content,
    tags: note.tags,
    relatedIds: note.relatedIds,
    createdAt: note.createdAt,
    userId: note.userId,
  };

  if (typeof note.codeSnippet === 'string') {
    payload.codeSnippet = note.codeSnippet;
  }

  if (Array.isArray(note.embedding)) {
    payload.embedding = note.embedding;
  }

  return payload;
}

function isEmbeddingUnsupportedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('embedding 仅支持 API Key 路径');
}

const appEnv = (import.meta as { env?: Record<string, string | boolean | undefined> }).env;
const DEV_AUTH_BYPASS_ENABLED = Boolean(appEnv?.DEV) && appEnv?.VITE_DISABLE_AUTH !== '0';
const DEV_USER_ID = '__dev_local_user__';

if (DEV_AUTH_BYPASS_ENABLED) {
  (window as any).__DEV_AUTH_BYPASS__ = true;
}

export default function App() {
  const [activeView, setActiveView] = useState<View>('chat');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [user, setUser] = useState<BetterAuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [breakthroughConfig, setBreakthroughConfig] = useState<BreakthroughConfig | null>(null);
  const [noteEditMode, setNoteEditMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });
  const isUsingDevAuthBypass = DEV_AUTH_BYPASS_ENABLED && !user;
  const effectiveUserId = user?.id ?? (isUsingDevAuthBypass ? DEV_USER_ID : null);

  const [showHiddenPersonas, setShowHiddenPersonas] = useState(() => {
    return localStorage.getItem('os_show_hidden_personas') === 'true';
  });
  const logoClicks = useRef({ count: 0, lastTime: 0 });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const { data } = await authClient.getSession();
        if (!cancelled) {
          setUser(data?.user ?? null);
          setIsAuthReady(true);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setIsAuthReady(true);
        }
      }
    };
    checkAuth();

    const interval = setInterval(() => {
      authClient.getSession().then(({ data }) => {
        if (cancelled) return;
        const newUser = data?.user ?? null;
        setUser(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newUser)) {
            return newUser as BetterAuthUser | null;
          }
          return prev;
        });
      }).catch(() => {
        // 服务器不可达时静默忽略，等待下次轮询重试
      });
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!user) {
      if (!isUsingDevAuthBypass) {
        setNotes([]);
        setFlashcards([]);
        setChatSessions([]);
      }
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);

    const loadData = async () => {
      try {
        const [notesData, cardsData, sessionsData, personasData] = await Promise.all([
          notesApi.list(),
          flashcardsApi.list(),
          chatSessionsApi.list(),
          personasApi.list(),
        ]);

        setNotes(notesData.sort((a, b) => b.createdAt - a.createdAt));
        setFlashcards(cardsData);
        setChatSessions(sessionsData.sort((a, b) => b.updatedAt - a.updatedAt));
        setCustomPersonas(personasData);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [isAuthReady, user, isUsingDevAuthBypass]);

  const handleLogin = async (provider: 'google' | 'github' | 'discord') => {
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: window.location.origin,
      });
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    if (isUsingDevAuthBypass) {
      setNotes([]);
      setFlashcards([]);
      setChatSessions([]);
      setSelectedNoteId(null);
      setActiveView('dashboard');
      setBreakthroughConfig(null);
      return;
    }
    try {
      await authClient.signOut();
      setUser(null);
      setActiveView('dashboard');
      setBreakthroughConfig(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleStartBreakthrough = (tag: string, weakPoints: string[]) => {
    setBreakthroughConfig({ tag, weakPoints });
    setActiveView('chat');
  };

  const handleSaveNote = async (newNoteData: Partial<Note>, newFlashcards: Partial<Flashcard>[]) => {
    if (!effectiveUserId) return;
    setIsProcessing(true);
    try {
      const noteId = generateUUID();
      const note: Note = {
        id: noteId,
        title: newNoteData.title || '无标题笔记',
        summary: newNoteData.summary || '',
        content: newNoteData.content || '',
        tags: newNoteData.tags || [],
        relatedIds: [],
        createdAt: Date.now(),
        userId: effectiveUserId,
      } as any;

      if (typeof newNoteData.codeSnippet === 'string') {
        note.codeSnippet = newNoteData.codeSnippet;
      }

      const cards: Flashcard[] = newFlashcards.map(cf => ({
        id: generateUUID(),
        noteId: noteId,
        question: cf.question || '',
        answer: cf.answer || '',
        nextReview: Date.now(),
        lastReview: 0,
        stability: 0,
        difficulty: 0,
        repetitions: 0,
        state: 0,
        userId: effectiveUserId,
      } as any));

      // 并行：embedding 生成 + 语义链接（embedding 完成后才能做本地相似度）
      const embeddingText = `${note.title} ${note.summary} ${note.tags.join(' ')}`;
      const embeddingResult = await generateEmbedding(embeddingText).catch(e => {
        if (!isEmbeddingUnsupportedError(e)) {
          console.warn("Failed to generate embedding:", e);
        }
        return [] as number[];
      });
      (note as any).embedding = embeddingResult;

      // embedding 可用时做本地相似度，不可用时跳过（避免额外 AI 调用）
      if (embeddingResult.length > 0) {
        note.relatedIds = await findSemanticLinks(note, notes);
      }

      if (isUsingDevAuthBypass || !user) {
        setNotes(prev => [note, ...prev.filter(existing => existing.id !== note.id)]);
        setFlashcards(prev => [...cards, ...prev.filter(existing => !cards.some(card => card.id === existing.id))]);
        setActiveView('notes');
        return;
      }

      // 并行：保存笔记 + 批量保存闪卡
      let persistedNote: Note = note;
      const [, batchResult] = await Promise.all([
        (async () => {
          try {
            const saved = await notesApi.create(sanitizeNoteForStorage(note) as any);
            persistedNote = {
              ...note,
              ...saved,
              embedding: Array.isArray((saved as any).embedding)
                ? (saved as any).embedding
                : note.embedding,
            };
          } catch (error) {
            console.error('Failed to save note:', error);
          }
        })(),
        (async () => {
          if (cards.length === 0) return [];
          try {
            return await flashcardsApi.createBatch(cards);
          } catch (error) {
            console.error('批量保存闪卡失败，回退逐条保存:', error);
            const results: Flashcard[] = [];
            for (const card of cards) {
              try {
                const saved = await flashcardsApi.create(card);
                results.push(saved);
              } catch (e) {
                console.error('Failed to save flashcard:', e);
              }
            }
            return results;
          }
        })(),
      ]);

      setNotes(prev => [persistedNote, ...prev.filter(existing => existing.id !== persistedNote.id)]);
      setFlashcards(prev => [...cards, ...prev]);
      setActiveView('notes');
    } catch (error) {
      console.error("Failed to save note:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!effectiveUserId) return;
    if (isUsingDevAuthBypass || !user) {
      setNotes(prev => prev.filter(note => note.id !== id));
      setFlashcards(prev => prev.filter(card => card.noteId !== id));
      if (selectedNoteId === id) setSelectedNoteId(null);
      return;
    }
    try {
      await notesApi.delete(id);
      await flashcardsApi.deleteByNoteId(id);
      setNotes(prev => prev.filter(note => note.id !== id));
      setFlashcards(prev => prev.filter(card => card.noteId !== id));
      if (selectedNoteId === id) setSelectedNoteId(null);
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  const handleUpdateNote = async (updatedNote: Note) => {
    if (!effectiveUserId) return;
    if (isUsingDevAuthBypass || !user) {
      setNotes(prev => prev.map(note => note.id === updatedNote.id ? updatedNote : note));
      return;
    }
    try {
      const persisted = await notesApi.update(updatedNote.id, sanitizeNoteForStorage(updatedNote));
      const mergedNote: Note = {
        ...updatedNote,
        ...persisted,
        embedding: Array.isArray((persisted as any).embedding)
          ? (persisted as any).embedding
          : updatedNote.embedding,
      };
      setNotes(prev => prev.map(note => note.id === mergedNote.id ? mergedNote : note));
    } catch (error) {
      console.error("Failed to update note:", error);
    }
  };

  const navigateToNote = (id: string, editMode = false) => {
    setSelectedNoteId(id);
    setNoteEditMode(editMode);
    setActiveView('notes');
  };

  if (!isAuthReady || isLoadingData) {
    return (
      <div className="h-screen bg-primary flex flex-col items-center justify-center gap-6">
        <div className="w-24 h-24 rounded-3xl bg-secondary overflow-hidden flex items-center justify-center animate-pulse shadow-2xl border border-border-main relative">
          <div className="absolute inset-0 bg-accent/5 animate-pulse" />
          <img src="/logo.png" className="w-16 h-16 object-contain relative z-10" alt="OpenSynapse Logo" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-accent animate-pulse">Synapse</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted opacity-40">正在同步突触资产...</p>
        </div>
      </div>
    );
  }

  if (!user && !isUsingDevAuthBypass) {
    return (
      <LoginSelection
        onSocialLogin={handleLogin}
        onAuthError={(error) => console.error('Login error:', error)}
      />
    );
  }

  const handleSavePersona = async (persona: Persona) => {
    if (isUsingDevAuthBypass || !effectiveUserId) {
      setCustomPersonas(prev => [persona, ...prev.filter(p => p.id !== persona.id)]);
      return;
    }
    try {
      const existing = customPersonas.find(p => p.id === persona.id);
      if (existing) {
        await personasApi.update(persona.id, { ...persona, userId: effectiveUserId });
      } else {
        await personasApi.create({ ...persona, userId: effectiveUserId });
      }
      setCustomPersonas(prev => [persona, ...prev.filter(p => p.id !== persona.id)]);
    } catch (error) {
      console.error('Failed to save persona:', error);
    }
  };

  const handleDeletePersona = async (id: string) => {
    if (isUsingDevAuthBypass || !effectiveUserId) {
      setCustomPersonas(prev => prev.filter(p => p.id !== id));
      return;
    }
    try {
      await personasApi.delete(id);
      setCustomPersonas(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete persona:', error);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen font-sans overflow-hidden transition-colors duration-300 bg-primary text-text-main">
      {/* Sidebar (Desktop) */}
      <nav className="hidden md:flex w-64 flex-col transition-colors duration-300 bg-sidebar border-r border-border-main">
        <div 
          className="p-6 flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity group"
          onClick={() => {
            const now = Date.now();
            if (now - logoClicks.current.lastTime < 500) {
              logoClicks.current.count++;
              if (logoClicks.current.count >= 7) {
                const newState = !showHiddenPersonas;
                setShowHiddenPersonas(newState);
                localStorage.setItem('os_show_hidden_personas', newState.toString());
                logoClicks.current.count = 0;
              }
            } else {
              logoClicks.current.count = 1;
            }
            logoClicks.current.lastTime = now;
            setActiveView('dashboard');
          }}
        >
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-300 shadow-sm bg-secondary border border-border-main group-hover:border-accent/30",
            showHiddenPersonas && "shadow-[0_0_15px_rgba(168,85,247,0.4)] border-purple-500/30"
          )}>
            <img src="/logo.png" className={cn("w-8 h-8 object-contain", showHiddenPersonas && "hue-rotate-[280deg]")} alt="Logo" />
          </div>
          <span className={cn(
            "font-bold text-lg tracking-tight group-hover:text-accent transition-colors",
            showHiddenPersonas && "text-purple-500"
          )}>
            Synapse {showHiddenPersonas ? '· 隐' : '突触'}
          </span>
        </div>

        <div className="flex-1 px-4 space-y-2 mt-4">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="仪表盘" 
            active={activeView === 'dashboard'} 
            onClick={() => setActiveView('dashboard')} 
            isDarkMode={isDarkMode}
          />
          <NavItem 
            icon={<MessageSquare size={20} />} 
            label="学习对话" 
            active={activeView === 'chat'} 
            onClick={() => setActiveView('chat')} 
            isDarkMode={isDarkMode}
          />
          <NavItem 
            icon={<Network size={20} />} 
            label="知识图谱" 
            active={activeView === 'graph'} 
            onClick={() => setActiveView('graph')} 
            isDarkMode={isDarkMode}
          />
          <NavItem 
            icon={<Layers size={20} />} 
            label="主动召回" 
            active={activeView === 'review'} 
            onClick={() => setActiveView('review')} 
            badge={flashcards.filter(c => c.nextReview <= Date.now()).length}
            isDarkMode={isDarkMode}
          />
          <NavItem 
            icon={<BookOpen size={20} />} 
            label="知识库" 
            active={activeView === 'notes'} 
            onClick={() => setActiveView('notes')} 
            isDarkMode={isDarkMode}
          />
          <NavItem
            icon={<Settings size={20} />}
            label="设置"
            active={activeView === 'settings'}
            onClick={() => setActiveView('settings')}
            isDarkMode={isDarkMode}
          />
          <NavItem
            icon={<CreditCard size={20} />}
            label="会员"
            active={activeView === 'alipay'}
            onClick={() => setActiveView('alipay')}
            isDarkMode={isDarkMode}
          />
        </div>

        <div className="p-4 space-y-2 border-t border-border-main">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-text-muted">
              {isUsingDevAuthBypass ? '开发模式' : '账户'}
            </span>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-lg transition-all duration-200 hover:scale-110 bg-tertiary text-text-sub"
              title={isDarkMode ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <div className="px-4 py-2 flex items-center gap-3">
            {user?.image ? (
              <img 
                src={user.image} 
                className="w-8 h-8 rounded-full border border-border-main" 
                alt={user.name || ''} 
              />
            ) : (
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-300 border border-border-main"
                style={{
                  backgroundColor: generateUserAvatarColor(user?.name || user?.email || 'U'),
                  color: '#ffffff'
                }}
              >
                {isUsingDevAuthBypass ? 'DEV' : getUserInitials(user?.name || user?.email || 'U')}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{user?.name || '本地开发免登录'}</p>
              <button 
                onClick={handleLogout} 
                className="text-[10px] transition-colors hover:text-accent text-text-muted"
              >
                {isUsingDevAuthBypass ? '清空开发态' : '退出登录'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 flex items-center justify-around px-2 z-50 transition-colors duration-300 bg-sidebar border-t border-border-main">
        <MobileNavItem 
          icon={<LayoutDashboard size={20} />} 
          active={activeView === 'dashboard'} 
          onClick={() => setActiveView('dashboard')} 
          isDarkMode={isDarkMode}
        />
        <MobileNavItem 
          icon={<MessageSquare size={20} />} 
          active={activeView === 'chat'} 
          onClick={() => setActiveView('chat')} 
          isDarkMode={isDarkMode}
        />
        <MobileNavItem 
          icon={<Network size={20} />} 
          active={activeView === 'graph'} 
          onClick={() => setActiveView('graph')} 
          isDarkMode={isDarkMode}
        />
        <MobileNavItem 
          icon={<Layers size={20} />} 
          active={activeView === 'review'} 
          onClick={() => setActiveView('review')} 
          badge={flashcards.filter(c => c.nextReview <= Date.now()).length}
          isDarkMode={isDarkMode}
        />
        <MobileNavItem 
          icon={<BookOpen size={20} />} 
          active={activeView === 'notes'} 
          onClick={() => setActiveView('notes')} 
          isDarkMode={isDarkMode}
        />
        <MobileNavItem
          icon={<Settings size={20} />}
          active={activeView === 'settings'}
          onClick={() => setActiveView('settings')}
          isDarkMode={isDarkMode}
        />
      </nav>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-col pb-16 md:pb-0">
        <AnimatePresence mode="wait">
          {activeView === 'dashboard' && (
            <DashboardView 
              notes={notes} 
              flashcards={flashcards} 
              chatSessions={chatSessions}
              onStartBreakthrough={handleStartBreakthrough}
            />
          )}
          {activeView === 'chat' && (
            <ChatView
              key="chat"
              notes={notes}
              chatSessions={chatSessions}
              userId={effectiveUserId || undefined}
              onProcess={handleSaveNote} 
              isProcessing={isProcessing}
              onBackToDashboard={() => setActiveView('dashboard')}
              showHiddenPersonas={showHiddenPersonas}
              customPersonas={customPersonas}
              onSaveSession={async (session) => {
                if (isUsingDevAuthBypass || !user) {
                  setChatSessions(prev => {
                    const next = [sanitizeChatSession(session, effectiveUserId || DEV_USER_ID) as ChatSession, ...prev.filter(item => item.id !== session.id)];
                    return next.sort((a, b) => b.updatedAt - a.updatedAt);
                  });
                  return;
                }
                try {
                  const existing = chatSessions.find(s => s.id === session.id);
                  if (existing) {
                    await chatSessionsApi.update(session.id, sanitizeChatSession(session, user.id));
                  } else {
                    await chatSessionsApi.create(sanitizeChatSession(session, user.id) as ChatSession);
                  }
                  setChatSessions(prev => {
                    const next = [sanitizeChatSession(session, user.id) as ChatSession, ...prev.filter(item => item.id !== session.id)];
                    return next.sort((a, b) => b.updatedAt - a.updatedAt);
                  });
                } catch (error) {
                  console.error('Failed to save session:', error);
                }
              }}
              onDeleteSession={async (id) => {
                if (isUsingDevAuthBypass || !user) {
                  setChatSessions(prev => prev.filter(session => session.id !== id));
                  return;
                }
                try {
                  await chatSessionsApi.delete(id);
                  setChatSessions(prev => prev.filter(session => session.id !== id));
                } catch (error) {
                  console.error('Failed to delete session:', error);
                }
              }}
              breakthroughConfig={breakthroughConfig}
              onClearBreakthrough={() => setBreakthroughConfig(null)}
            />
          )}
          {activeView === 'graph' && (
            <GraphView 
              key="graph" 
              notes={notes} 
              flashcards={flashcards}
              onNodeClick={navigateToNote}
              onNodeEdit={(id) => navigateToNote(id, true)}
              isDarkMode={isDarkMode}
            />
          )}
          {activeView === 'review' && (
            <ReviewView 
              key="review" 
              flashcards={flashcards} 
              notes={notes}
              onBackToDashboard={() => setActiveView('dashboard')}
              onReview={async (card, rating) => {
                const updatedCard = schedule(card, rating);
                if (isUsingDevAuthBypass || !user) {
                  setFlashcards(prev => prev.map(item => item.id === card.id ? updatedCard : item));
                  return;
                }
                try {
                  await flashcardsApi.update(card.id, updatedCard);
                  setFlashcards(prev => prev.map(item => item.id === card.id ? updatedCard : item));
                } catch (error) {
                  console.error('Failed to review card:', error);
                }
              }}
            />
          )}
          {activeView === 'notes' && (
            <NotesView
              key="notes"
              notes={notes}
              onDelete={handleDeleteNote}
              onUpdateNote={handleUpdateNote}
              initialSelectedId={selectedNoteId}
              onBackToDashboard={() => setActiveView('dashboard')}
              editMode={noteEditMode}
              onEditComplete={() => setNoteEditMode(false)}
            />
          )}
          {activeView === 'settings' && (
            <SettingsView
              onBackToChat={() => setActiveView('chat')}
              customPersonas={customPersonas}
              onSavePersona={handleSavePersona}
              onDeletePersona={handleDeletePersona}
              user={user as any}
            />
          )}
          {activeView === 'alipay' && (
            <AlipayIntegrationView />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function MobileNavItem({ icon, active, onClick, badge, isDarkMode }: { icon: React.ReactNode; active: boolean; onClick: () => void; badge?: number; isDarkMode?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative p-3 rounded-xl transition-all",
        active 
          ? "text-accent bg-accent/10" 
          : "text-text-muted hover:text-text-main hover:bg-tertiary"
      )}
    >
      {icon}
      {badge !== undefined && badge > 0 && (
        <span 
          className="absolute top-2 right-2 w-4 h-4 text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 bg-accent border-sidebar"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function NavItem({ icon, label, active, onClick, badge, isDarkMode }: { 
  icon: React.ReactNode; 
  label: string; 
  active: boolean; 
  onClick: () => void;
  badge?: number;
  isDarkMode?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
        active 
          ? "bg-accent/10 text-text-main shadow-sm"
          : "hover:bg-tertiary text-text-sub"
      )}
    >
      <div className={cn(
        "transition-transform duration-200",
        active ? "scale-110" : "group-hover:scale-110"
      )}>
        <span style={{ color: active ? 'var(--accent-color)' : 'inherit' }}>
          {icon}
        </span>
      </div>
      <span className="hidden md:block font-medium text-sm">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span 
          className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
          style={{ backgroundColor: 'var(--accent-color)' }}
        >
          {badge}
        </span>
      )}
      {active && (
        <motion.div 
          layoutId="active-pill"
          className="absolute left-0 w-1 h-6 rounded-r-full"
          style={{ backgroundColor: 'var(--accent-color)' }}
        />
      )}
    </button>
  );
}
