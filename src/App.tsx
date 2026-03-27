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
  LayoutDashboard
} from 'lucide-react';
import { Note, Flashcard, ChatMessage, ChatSession } from './types';
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

type View = 'chat' | 'graph' | 'review' | 'notes' | 'dashboard';

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
  return {
    id: session.id,
    title: session.title || '新会话',
    messages: session.messages.map((message) =>
      message.image
        ? { role: message.role, text: message.text, image: message.image }
        : { role: message.role, text: message.text }
    ),
    updatedAt: session.updatedAt,
    userId,
  };
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

export default function App() {
  const [activeView, setActiveView] = useState<View>('chat');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [breakthroughConfig, setBreakthroughConfig] = useState<BreakthroughConfig | null>(null);
  const [noteEditMode, setNoteEditMode] = useState(false);
  const isUsingDevAuthBypass = DEV_AUTH_BYPASS_ENABLED && !user;
  const effectiveUserId = user?.uid ?? (isUsingDevAuthBypass ? DEV_USER_ID : null);

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
        console.warn("Failed to generate embedding:", e);
      }

      // Find semantic links
      const relatedIds = await findSemanticLinks(note, notes);
      note.relatedIds = relatedIds;

      // Save note to Firestore
      try {
        await setDoc(doc(db, 'notes', noteId), note);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `notes/${noteId}`);
      }

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
      <div className="h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-orange-500 animate-pulse flex items-center justify-center">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/20">正在同步突触资产...</p>
      </div>
    );
  }

  if (!user && !isUsingDevAuthBypass) {
    return (
      <div className="h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-3xl bg-orange-500 flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.4)] mb-8">
          <Brain className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-4xl font-black tracking-tighter mb-4 text-center">Synapse 突触</h1>
        <p className="text-white/40 text-center max-w-md mb-12 leading-relaxed">
          欢迎来到你的外挂式海马体。通过 AI 驱动的知识捕获与算法化复习，构建你的神经网络。
        </p>
        <button
          onClick={handleLogin}
          className="px-8 py-4 bg-white text-black rounded-2xl font-bold flex items-center gap-3 hover:bg-orange-500 hover:text-white transition-all active:scale-95"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
          使用 Google 账号登录
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#0A0A0A] text-white font-sans overflow-hidden">
      {/* Sidebar (Desktop) */}
      <nav className="hidden md:flex w-64 border-r border-white/10 flex-col bg-[#0F0F0F]">
        <div 
          className="p-6 flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setActiveView('dashboard')}
        >
          <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.3)]">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Synapse 突触</span>
        </div>

        <div className="flex-1 px-4 space-y-2 mt-4">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="仪表盘" 
            active={activeView === 'dashboard'} 
            onClick={() => setActiveView('dashboard')} 
          />
          <NavItem 
            icon={<MessageSquare size={20} />} 
            label="学习对话" 
            active={activeView === 'chat'} 
            onClick={() => setActiveView('chat')} 
          />
          <NavItem 
            icon={<Network size={20} />} 
            label="知识图谱" 
            active={activeView === 'graph'} 
            onClick={() => setActiveView('graph')} 
          />
          <NavItem 
            icon={<Layers size={20} />} 
            label="主动召回" 
            active={activeView === 'review'} 
            onClick={() => setActiveView('review')} 
            badge={flashcards.filter(c => c.nextReview <= Date.now()).length}
          />
          <NavItem 
            icon={<BookOpen size={20} />} 
            label="知识库" 
            active={activeView === 'notes'} 
            onClick={() => setActiveView('notes')} 
          />
        </div>

        <div className="p-4 border-t border-white/5 space-y-2">
          <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-white/40 font-semibold">
            {isUsingDevAuthBypass ? '开发模式' : '账户'}
          </div>
          <div className="px-4 py-2 flex items-center gap-3">
            {user?.photoURL ? (
              <img src={user.photoURL} className="w-8 h-8 rounded-full border border-white/10" alt={user.displayName || ''} />
            ) : (
              <div className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-xs font-bold text-white/60">
                {isUsingDevAuthBypass ? 'DEV' : '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{user?.displayName || '本地开发免登录'}</p>
              <button onClick={handleLogout} className="text-[10px] text-white/40 hover:text-orange-400 transition-colors">
                {isUsingDevAuthBypass ? '清空开发态' : '退出登录'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0F0F0F] border-t border-white/10 flex items-center justify-around px-2 z-50">
        <MobileNavItem 
          icon={<LayoutDashboard size={20} />} 
          active={activeView === 'dashboard'} 
          onClick={() => setActiveView('dashboard')} 
        />
        <MobileNavItem 
          icon={<MessageSquare size={20} />} 
          active={activeView === 'chat'} 
          onClick={() => setActiveView('chat')} 
        />
        <MobileNavItem 
          icon={<Network size={20} />} 
          active={activeView === 'graph'} 
          onClick={() => setActiveView('graph')} 
        />
        <MobileNavItem 
          icon={<Layers size={20} />} 
          active={activeView === 'review'} 
          onClick={() => setActiveView('review')} 
          badge={flashcards.filter(c => c.nextReview <= Date.now()).length}
        />
        <MobileNavItem 
          icon={<BookOpen size={20} />} 
          active={activeView === 'notes'} 
          onClick={() => setActiveView('notes')} 
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
        </AnimatePresence>
      </main>
    </div>
  );
}

function MobileNavItem({ icon, active, onClick, badge }: { icon: React.ReactNode; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative p-3 rounded-xl transition-all",
        active ? "text-orange-500 bg-orange-500/10" : "text-white/40 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-2 right-2 w-4 h-4 bg-orange-500 text-white text-[8px] font-black flex items-center justify-center rounded-full border-2 border-[#0F0F0F]">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function NavItem({ icon, label, active, onClick, badge }: { 
  icon: React.ReactNode; 
  label: string; 
  active: boolean; 
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
        active 
          ? "bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]" 
          : "text-white/50 hover:text-white hover:bg-white/5"
      )}
    >
      <div className={cn(
        "transition-transform duration-200",
        active ? "scale-110 text-orange-400" : "group-hover:scale-110"
      )}>
        {icon}
      </div>
      <span className="hidden md:block font-medium text-sm">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-orange-500 text-[10px] font-bold flex items-center justify-center text-white">
          {badge}
        </span>
      )}
      {active && (
        <motion.div 
          layoutId="active-pill"
          className="absolute left-0 w-1 h-6 bg-orange-500 rounded-r-full"
        />
      )}
    </button>
  );
}
