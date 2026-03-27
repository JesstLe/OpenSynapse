import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Tag, Calendar, Code, Trash2, ExternalLink, ChevronRight, BookOpen, Sparkles, LayoutDashboard, BrainCircuit, Loader2 } from 'lucide-react';
import { Note } from '../types';
import { cn } from '../lib/utils';
import { cosineSimilarity } from '../lib/math';
import { semanticSearch } from '../services/gemini';

interface NotesViewProps {
  key?: string;
  notes: Note[];
  onDelete: (id: string) => Promise<void>;
  initialSelectedId?: string | null;
  onBackToDashboard?: () => void;
}

export default function NotesView({ notes, onDelete, initialSelectedId, onBackToDashboard }: NotesViewProps) {
  const [search, setSearch] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isSemantic, setIsSemantic] = useState(false);
  const [semanticResults, setSemanticResults] = useState<{ note: Note, similarity: number }[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!isSemantic || !search.trim()) return;
    setIsSearching(true);
    try {
      const results = await semanticSearch(search, notes);
      setSemanticResults(results);
    } catch (error) {
      console.error("Semantic search failed:", error);
    } finally {
      setIsSearching(false);
    }
  };

  React.useEffect(() => {
    if (isSemantic && search.trim()) {
      const timer = setTimeout(handleSearch, 500);
      return () => clearTimeout(timer);
    }
  }, [search, isSemantic]);

  // Find semantically similar notes that are NOT already in relatedIds
  const semanticDiscovery = React.useMemo(() => {
    if (!selectedNote || !selectedNote.embedding) return [];
    
    return notes
      .filter(n => n.id !== selectedNote.id && !selectedNote.relatedIds.includes(n.id))
      .map(n => ({
        note: n,
        similarity: n.embedding ? cosineSimilarity(selectedNote.embedding!, n.embedding) : 0
      }))
      .filter(item => item.similarity > 0.7) // Threshold for discovery
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  }, [selectedNote, notes]);

  React.useEffect(() => {
    if (initialSelectedId) {
      const note = notes.find(n => n.id === initialSelectedId);
      if (note) {
        setSelectedNote(note);
        // Clear search if the selected note is not in the filtered list
        setSearch('');
      }
    }
  }, [initialSelectedId, notes]);

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const deleteNote = async (id: string) => {
    if (confirm("你确定要删除这个知识资产吗？")) {
      await onDelete(id);
      if (selectedNote?.id === id) setSelectedNote(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="w-full md:w-80 border-r border-white/5 flex flex-col bg-[#0A0A0A]">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight">知识库</h2>
            <button 
              onClick={onBackToDashboard}
              className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
              title="返回仪表盘"
            >
              <LayoutDashboard size={18} />
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              type="text"
              placeholder={isSemantic ? "语义搜索 (输入底层逻辑)..." : "搜索概念..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-12 py-2 text-xs focus:outline-none focus:border-orange-500/50 transition-all"
            />
            <button
              onClick={() => setIsSemantic(!isSemantic)}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all",
                isSemantic ? "bg-orange-500 text-white" : "text-white/20 hover:bg-white/5"
              )}
              title={isSemantic ? "切换为普通搜索" : "切换为语义搜索"}
            >
              <BrainCircuit size={14} />
            </button>
          </div>
          {isSemantic && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-0.5 flex-1 bg-gradient-to-r from-orange-500/50 to-transparent rounded-full" />
              <span className="text-[8px] uppercase tracking-widest font-bold text-orange-500/50">语义模式已开启</span>
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isSearching ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/20">
              <Loader2 size={24} className="animate-spin mb-2" />
              <span className="text-[10px] uppercase tracking-widest font-bold">正在进行向量检索...</span>
            </div>
          ) : isSemantic ? (
            semanticResults.length === 0 && search.trim() ? (
              <div className="text-center py-12 text-white/20 text-xs italic">未找到语义相关的资产</div>
            ) : (
              semanticResults.map(({ note, similarity }) => (
                <button
                  key={note.id}
                  onClick={() => setSelectedNote(note)}
                  className={cn(
                    "w-full text-left p-4 rounded-2xl transition-all group relative overflow-hidden",
                    selectedNote?.id === note.id 
                      ? "bg-white/10 border border-white/10" 
                      : "hover:bg-white/5 border border-transparent"
                  )}
                >
                  <div className="absolute top-0 right-0 px-2 py-0.5 bg-orange-500/10 text-orange-500 text-[8px] font-bold">
                    {Math.round(similarity * 100)}% 匹配
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500/70">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm mb-2 line-clamp-1">{note.title}</h3>
                  <div className="flex flex-wrap gap-1">
                    {note.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/5">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))
            )
          ) : (
            filteredNotes.map(note => (
            <button
              key={note.id}
              onClick={() => setSelectedNote(note)}
              className={cn(
                "w-full text-left p-4 rounded-2xl transition-all group relative overflow-hidden",
                selectedNote?.id === note.id 
                  ? "bg-white/10 border border-white/10" 
                  : "hover:bg-white/5 border border-transparent"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500/70">
                  {new Date(note.createdAt).toLocaleDateString()}
                </span>
                <ChevronRight size={14} className={cn(
                  "transition-transform",
                  selectedNote?.id === note.id ? "rotate-90" : "opacity-0 group-hover:opacity-100"
                )} />
              </div>
              <h3 className="font-bold text-sm mb-2 line-clamp-1">{note.title}</h3>
              <div className="flex flex-wrap gap-1">
                {note.tags.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/5">
                    #{tag}
                  </span>
                ))}
              </div>
            </button>
          )))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto bg-[#0A0A0A]">
        <AnimatePresence mode="wait">
          {selectedNote ? (
            <motion.div
              key={selectedNote.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-3xl mx-auto p-12"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold tracking-tighter">{selectedNote.title}</h1>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(selectedNote.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <Tag size={12} />
                        {selectedNote.tags.join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => deleteNote(selectedNote.id)}
                  className="p-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                >
                  <Trash2 size={20} />
                </button>
              </div>

              <div className="space-y-12">
                <section>
                  <h2 className="text-xs uppercase tracking-[0.3em] font-black text-white/20 mb-4">摘要</h2>
                  <p className="text-lg text-white/80 leading-relaxed font-serif italic">
                    "{selectedNote.summary}"
                  </p>
                </section>

                <section>
                  <h2 className="text-xs uppercase tracking-[0.3em] font-black text-white/20 mb-4">深度解析</h2>
                  <div className="prose prose-invert max-w-none text-white/70 leading-loose">
                    {selectedNote.content}
                  </div>
                </section>

                {selectedNote.codeSnippet && (
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xs uppercase tracking-[0.3em] font-black text-white/20">核心实现</h2>
                      <div className="flex items-center gap-2 px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase">
                        <Code size={12} />
                        C++
                      </div>
                    </div>
                    <pre className="p-6 rounded-2xl bg-[#1A1A1A] border border-white/5 overflow-x-auto font-mono text-sm text-blue-300/90 leading-relaxed">
                      <code>{selectedNote.codeSnippet}</code>
                    </pre>
                  </section>
                )}

                {selectedNote.relatedIds.length > 0 && (
                  <section>
                    <h2 className="text-xs uppercase tracking-[0.3em] font-black text-white/20 mb-4">语义连接</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedNote.relatedIds.map(rid => {
                        const related = notes.find(n => n.id === rid);
                        if (!related) return null;
                        return (
                          <button
                            key={rid}
                            onClick={() => setSelectedNote(related)}
                            className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-orange-500/30 transition-all text-left group"
                          >
                            <h4 className="font-bold text-sm group-hover:text-orange-400 transition-colors">{related.title}</h4>
                            <p className="text-[10px] text-white/40 mt-1 line-clamp-1">{related.summary}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {semanticDiscovery.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <h2 className="text-xs uppercase tracking-[0.3em] font-black text-white/20">语义发现</h2>
                      <Sparkles size={12} className="text-orange-500 animate-pulse" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {semanticDiscovery.map(({ note: related, similarity }) => (
                        <button
                          key={related.id}
                          onClick={() => setSelectedNote(related)}
                          className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10 hover:border-orange-500/30 transition-all text-left group relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 px-2 py-0.5 bg-orange-500/10 text-orange-500 text-[8px] font-bold">
                            {Math.round(similarity * 100)}% 相似度
                          </div>
                          <h4 className="font-bold text-sm group-hover:text-orange-400 transition-colors">{related.title}</h4>
                          <p className="text-[10px] text-white/40 mt-1 line-clamp-1">{related.summary}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-white/10">
              <BookOpen size={80} strokeWidth={1} className="mb-6 opacity-20" />
              <p className="text-sm font-bold uppercase tracking-[0.4em]">请选择一个资产以查看</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
