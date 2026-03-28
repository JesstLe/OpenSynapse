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
  Moon
} from 'lucide-react';
import { Note, Flashcard, ChatMessage, ChatSession, Persona } from './types';
import { chatWithAI, processConversation, findSemanticLinks, generateEmbedding, BreakthroughConfig, startBreakthroughChat } from './services/gemini';
import { cn } from './lib/utils';
import { schedule, Rating } from './services/fsrs';
import { auth, db } from './firebase';

// Components
import ChatView from './components/ChatView';
import GraphView from './components/GraphView';
import ReviewView from './components/ReviewView';
import NotesView from './components/NotesView';
import DashboardView from './components/DashboardView';
import SettingsView from './components/SettingsView';

import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  setDoc, 
  getDocs,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';

type View = 'chat' | 'graph' | 'review' | 'notes' | 'dashboard' | 'settings';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
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
  // 保留导入元数据（Firestore 不接受 undefined，仅写入有值的字段）
  if (session.source) base.source = session.source;
  if (session.importedAt) base.importedAt = session.importedAt;
  if (session.fingerprint) base.fingerprint = session.fingerprint;
  if (session.originalExportedAt) base.originalExportedAt = session.originalExportedAt;
  if (session.personaId) base.personaId = session.personaId;
  return base;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const appEnv = (import.meta as { env?: Record<string, string | boolean | undefined> }).env;
const DEV_AUTH_BYPASS_ENABLED = Boolean(appEnv?.DEV) && appEnv?.VITE_DISABLE_AUTH !== '0';
const DEV_USER_ID = '__dev_local_user__';

function isEmbeddingUnsupportedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('embedding 仅支持 API Key 路径');
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
  const [user, setUser] = useState<User | null>(null);
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
  const effectiveUserId = user?.uid ?? (isUsingDevAuthBypass ? DEV_USER_ID : null);

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
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
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

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const notesQuery = query(collection(db, 'notes'), where('userId', '==', user.uid));
    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({ ...doc.data() } as Note));
      setNotes(notesData.sort((a, b) => (b.createdAt as any) - (a.createdAt as any)));
      setIsLoadingData(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notes');
    });

    const cardsQuery = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
    const unsubscribeCards = onSnapshot(cardsQuery, (snapshot) => {
      const cardsData = snapshot.docs.map(doc => ({ ...doc.data() } as Flashcard));
      setFlashcards(cardsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'flashcards');
    });

    const sessionsQuery = query(collection(db, 'chat_sessions'), where('userId', '==', user.uid));
    const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
      const sessionsData = snapshot.docs.map(doc => ({ ...doc.data() } as ChatSession));
      setChatSessions(sessionsData.sort((a, b) => b.updatedAt - a.updatedAt));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chat_sessions');
    });

    return () => {
      unsubscribeNotes();
      unsubscribeCards();
      unsubscribeSessions();
    };
  }, [isAuthReady, user, isUsingDevAuthBypass]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
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
      await signOut(auth);
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
      const noteId = crypto.randomUUID();
      const note: Note = {
        id: noteId,
        title: newNoteData.title || '无标题笔记',
        summary: newNoteData.summary || '',
        content: newNoteData.content || '',
        codeSnippet: newNoteData.codeSnippet,
        tags: newNoteData.tags || [],
        relatedIds: [],
        createdAt: Date.now(),
        userId: effectiveUserId,
      } as any;

      // Generate embedding for semantic search
      try {
        const embeddingText = `${note.title} ${note.summary} ${note.tags.join(' ')}`;
        (note as any).embedding = await generateEmbedding(embeddingText);
      } catch (e) {
        if (!isEmbeddingUnsupportedError(e)) {
          console.warn("Failed to generate embedding:", e);
        }
      }

      // Find semantic links
      const relatedIds = await findSemanticLinks(note, notes);
      note.relatedIds = relatedIds;

      // Save flashcards to Firestore
      const cards: Flashcard[] = newFlashcards.map(cf => ({
        id: crypto.randomUUID(),
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

      if (isUsingDevAuthBypass || !user) {
        setNotes(prev => [note, ...prev.filter(existing => existing.id !== note.id)]);
        setFlashcards(prev => [...cards, ...prev.filter(existing => !cards.some(card => card.id === existing.id))]);
        setActiveView('notes');
        return;
      }

      // Save note to Firestore
      try {
        await setDoc(doc(db, 'notes', noteId), note);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `notes/${noteId}`);
      }

      for (const card of cards) {
        try {
          await setDoc(doc(db, 'flashcards', card.id), card);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `flashcards/${card.id}`);
        }
      }

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
      // Delete note
      try {
        await deleteDoc(doc(db, 'notes', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `notes/${id}`);
      }

      // Delete associated flashcards
      const cardsToDelete = flashcards.filter(f => f.noteId === id);
      for (const card of cardsToDelete) {
        try {
          await deleteDoc(doc(db, 'flashcards', card.id));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `flashcards/${card.id}`);
        }
      }

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
      await setDoc(doc(db, 'notes', updatedNote.id), updatedNote);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `notes/${updatedNote.id}`);
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
      <div className="h-screen bg-primary flex flex-col items-center justify-center p-6 text-text-main">
        <div className="w-32 h-32 rounded-[2.5rem] bg-secondary flex items-center justify-center shadow-2xl mb-10 overflow-hidden transform hover:scale-110 transition-transform duration-500 border border-border-main relative group">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <img src="/logo.png" className="w-24 h-24 object-contain relative z-10" alt="OpenSynapse Logo" />
        </div>
        <h1 className="text-5xl font-black tracking-tighter mb-4 text-center bg-gradient-to-br from-text-main to-text-main/60 bg-clip-text text-transparent">Synapse 突触</h1>
        <p className="text-text-sub text-center max-w-sm mb-12 leading-relaxed opacity-60 font-medium">
          通过 AI 驱动的知识捕获与算法化复习，构建你的神经网络。
        </p>
        <button
          onClick={handleLogin}
          className="px-8 py-4 bg-accent text-white rounded-2xl font-bold flex items-center gap-3 hover:bg-accent-hover transition-all active:scale-95 shadow-xl shadow-accent/20 hover:shadow-accent/40"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 bg-white rounded-sm p-0.5" alt="Google" />
          使用 Google 账号登录
        </button>
      </div>
    );
  }

  const handleSavePersona = async (persona: Persona) => {
    if (isUsingDevAuthBypass || !effectiveUserId) {
      setCustomPersonas(prev => [persona, ...prev.filter(p => p.id !== persona.id)]);
      return;
    }
    try {
      await setDoc(doc(db, 'custom_personas', persona.id), {
        ...persona,
        userId: effectiveUserId,
        updatedAt: Date.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `custom_personas/${persona.id}`);
    }
  };

  const handleDeletePersona = async (id: string) => {
    if (isUsingDevAuthBypass || !effectiveUserId) {
      setCustomPersonas(prev => prev.filter(p => p.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'custom_personas', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `custom_personas/${id}`);
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
                // 震动或控制台视觉反馈（可选）
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
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                className="w-8 h-8 rounded-full border border-border-main" 
                alt={user.displayName || ''} 
              />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-300 border border-border-main bg-tertiary text-text-muted">
                {isUsingDevAuthBypass ? 'DEV' : '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{user?.displayName || '本地开发免登录'}</p>
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
              key="dashboard"
              notes={notes} 
              flashcards={flashcards} 
              onStartBreakthrough={handleStartBreakthrough}
            />
          )}
          {activeView === 'chat' && (
            <ChatView 
              key="chat" 
              notes={notes} 
              chatSessions={chatSessions}
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
                  await setDoc(
                    doc(db, 'chat_sessions', session.id),
                    sanitizeChatSession(session, user.uid)
                  );
                } catch (error) {
                  handleFirestoreError(error, OperationType.WRITE, `chat_sessions/${session.id}`);
                }
              }}
              onDeleteSession={async (id) => {
                if (isUsingDevAuthBypass || !user) {
                  setChatSessions(prev => prev.filter(session => session.id !== id));
                  return;
                }
                try {
                  await deleteDoc(doc(db, 'chat_sessions', id));
                } catch (error) {
                  handleFirestoreError(error, OperationType.DELETE, `chat_sessions/${id}`);
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
                  await setDoc(doc(db, 'flashcards', card.id), updatedCard);
                } catch (error) {
                  handleFirestoreError(error, OperationType.WRITE, `flashcards/${card.id}`);
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
              key="settings"
              onBackToChat={() => setActiveView('chat')}
              customPersonas={customPersonas}
              onSavePersona={handleSavePersona}
              onDeletePersona={handleDeletePersona}
            />
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
