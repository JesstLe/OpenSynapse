import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Search, Tag, Calendar, Code, Trash2, ExternalLink, ChevronRight, BookOpen, Sparkles, LayoutDashboard, BrainCircuit, Loader2, Filter, X, ChevronDown, ChevronUp, Edit3, Save } from 'lucide-react';
import { Note } from '../types';
import { cn } from '../lib/utils';
import { cosineSimilarity } from '../lib/math';
import { semanticSearch } from '../services/gemini';

interface NotesViewProps {
  key?: string;
  notes: Note[];
  onDelete: (id: string) => Promise<void>;
  onUpdateNote?: (note: Note) => Promise<void>;
  initialSelectedId?: string | null;
  onBackToDashboard?: () => void;
  editMode?: boolean;
  onEditComplete?: () => void;
}

export default function NotesView({ notes, onDelete, onUpdateNote, initialSelectedId, onBackToDashboard, editMode = false, onEditComplete }: NotesViewProps) {
  const [search, setSearch] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isSemantic, setIsSemantic] = useState(false);
  const [semanticResults, setSemanticResults] = useState<{ note: Note, similarity: number }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchContent, setSearchContent] = useState(false);
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Note>>({});

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
        // If editMode is true, enter edit mode automatically
        if (editMode) {
          setIsEditing(true);
          setEditForm({
            title: note.title,
            summary: note.summary,
            content: note.content,
            tags: [...note.tags]
          });
        }
      }
    }
  }, [initialSelectedId, notes, editMode]);

  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    notes.forEach(note => note.tags.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [notes]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const filteredNotes = React.useMemo(() => {
    return notes.filter(n => {
      const searchLower = search.toLowerCase();
      const matchesTextSearch =
        n.title.toLowerCase().includes(searchLower) ||
        n.tags.some(t => t.toLowerCase().includes(searchLower)) ||
        (searchContent && n.content.toLowerCase().includes(searchLower));

      const matchesDateRange = (() => {
        if (!startDate && !endDate) return true;
        const noteDate = new Date(n.createdAt);
        return (!startDate || noteDate >= new Date(startDate)) &&
               (!endDate || noteDate <= new Date(endDate));
      })();

      const matchesTags = selectedTags.length === 0 ||
                          n.tags.some(tag => selectedTags.includes(tag));

      return matchesTextSearch && matchesDateRange && matchesTags;
    });
  }, [notes, search, startDate, endDate, selectedTags, searchContent]);

  const deleteNote = async (id: string) => {
    if (confirm("你确定要删除这个知识资产吗？")) {
      await onDelete(id);
      if (selectedNote?.id === id) setSelectedNote(null);
    }
  };

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="w-full md:w-80 border-r border-border-main flex flex-col bg-sidebar">
        <div className="p-6 border-b border-border-main">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight text-text-main">知识库</h2>
            <button 
              onClick={onBackToDashboard}
              className="p-2 rounded-lg hover:bg-tertiary text-text-muted hover:text-text-main transition-colors"
              title="返回仪表盘"
            >
              <LayoutDashboard size={18} />
            </button>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted opacity-40" />
            <input
              type="text"
              placeholder={isSemantic ? "语义搜索 (输入底层逻辑)..." : "搜索概念..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-tertiary border border-border-main rounded-xl pl-10 pr-12 py-2 text-xs text-text-main placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 transition-all shadow-sm"
            />
            <button
              onClick={() => setIsSemantic(!isSemantic)}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all",
                isSemantic ? "bg-accent text-white" : "text-text-muted hover:bg-tertiary"
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

          {/* Tag Filter */}
          {allTags.length > 0 && (
            <div className="mt-3">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "px-2 py-1 rounded-full text-[9px] font-medium whitespace-nowrap transition-all border",
                      selectedTags.includes(tag)
                        ? "bg-accent text-white border-accent"
                        : "bg-tertiary text-text-sub border-border-main hover:bg-secondary hover:text-text-main"
                    )}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Advanced Filter Toggle */}
          <button
            onClick={() => setIsAdvancedFilterOpen(!isAdvancedFilterOpen)}
            className="mt-3 w-full flex items-center justify-between p-2 rounded-lg bg-tertiary border border-border-main hover:bg-secondary transition-all"
          >
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-accent/70" />
              <span className="text-[10px] font-medium text-text-sub">高级过滤</span>
            </div>
            {isAdvancedFilterOpen ? (
              <ChevronUp size={14} className="text-text-muted" />
            ) : (
              <ChevronDown size={14} className="text-text-muted" />
            )}
          </button>

          {/* Advanced Filter Panel */}
          <AnimatePresence>
            {isAdvancedFilterOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2 p-3 rounded-xl bg-tertiary border border-border-main space-y-3">
                  {/* Date Range */}
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-medium text-text-muted mb-2">
                      <Calendar size={12} className="text-accent/70" />
                      日期范围
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full bg-primary/50 border border-border-main rounded-lg px-2 py-1.5 text-[10px] text-text-main focus:outline-none focus:border-accent/50 transition-all"
                        />
                      </div>
                      <span className="text-text-muted/30 text-[10px] py-1.5">-</span>
                      <div className="flex-1 relative">
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full bg-primary/50 border border-border-main rounded-lg px-2 py-1.5 text-[10px] text-text-main focus:outline-none focus:border-accent/50 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Search Content Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[10px] font-medium text-text-sub">
                      <Search size={12} className="text-accent/70" />
                      搜索包含正文内容
                    </label>
                    <button
                      onClick={() => setSearchContent(!searchContent)}
                      className={cn(
                        "w-10 h-5 rounded-full p-0.5 transition-all relative",
                        searchContent ? "bg-accent" : "bg-primary-sub/20"
                      )}
                    >
                      <motion.div
                        className="w-4 h-4 rounded-full bg-white shadow-sm"
                        animate={{ x: searchContent ? 20 : 0 }}
                        transition={{ duration: 0.2 }}
                      />
                    </button>
                  </div>

                  {/* Clear Filters */}
                  {(startDate || endDate || selectedTags.length > 0 || searchContent) && (
                    <button
                      onClick={() => {
                        setStartDate('');
                        setEndDate('');
                        setSelectedTags([]);
                        setSearchContent(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-all text-[10px] font-medium text-red-500"
                    >
                      <X size={12} />
                      清除所有过滤条件
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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
                    "w-full text-left p-4 rounded-2xl transition-all group relative overflow-hidden border",
                    selectedNote?.id === note.id 
                      ? "bg-accent/10 border-accent/20 text-accent shadow-sm" 
                      : "hover:bg-tertiary border-transparent text-text-sub"
                  )}
                >
                  <div className="absolute top-0 right-0 px-2 py-0.5 bg-accent/10 text-accent text-[8px] font-bold">
                    {Math.round(similarity * 100)}% 匹配
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-bold text-sm mb-2 line-clamp-1">{note.title}</h3>
                  <div className="flex flex-wrap gap-1">
                    {note.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-text-muted border border-border-main">
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
                "w-full text-left p-4 rounded-2xl transition-all group relative overflow-hidden border",
                selectedNote?.id === note.id 
                  ? "bg-accent/10 border-accent/20 text-accent shadow-sm" 
                  : "hover:bg-tertiary border-transparent text-text-sub"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
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
                  <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-text-muted border border-border-main">
                    #{tag}
                  </span>
                ))}
              </div>
            </button>
          )))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto bg-primary">
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
                  <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center shadow-inner">
                    <BookOpen className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold tracking-tighter text-text-main">{selectedNote.title}</h1>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(selectedNote.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Tag size={12} />
                        {selectedNote.tags.join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setIsEditing(true);
                      setEditForm({
                        title: selectedNote.title,
                        summary: selectedNote.summary,
                        content: selectedNote.content,
                        tags: [...selectedNote.tags]
                      });
                    }}
                    className="p-3 rounded-xl bg-accent/10 text-accent hover:bg-accent hover:text-white transition-all shadow-sm"
                  >
                    <Edit3 size={20} />
                  </button>
                  <button 
                    onClick={() => deleteNote(selectedNote.id)}
                    className="p-3 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              <div className="space-y-12">
                <section>
                  <h2 className="text-xs uppercase tracking-[0.3em] font-black text-text-muted opacity-40 mb-4">摘要</h2>
                  <p className="text-lg text-text-sub leading-relaxed font-serif italic border-l-4 border-accent/20 pl-6 py-1">
                    "{selectedNote.summary}"
                  </p>
                </section>

                <section>
                  <h2 className="text-xs uppercase tracking-[0.3em] font-black text-text-muted opacity-40 mb-4">深度解析</h2>
                  <div className="prose dark:prose-invert max-w-none text-text-sub leading-loose prose-headings:text-text-main prose-strong:text-text-main prose-code:text-accent prose-code:bg-accent/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-secondary prose-pre:border prose-pre:border-border-main prose-pre:rounded-2xl prose-a:text-accent prose-a:no-underline hover:prose-a:underline">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[[rehypeKatex, {
                        macros: {
                          '\\xlongequal': '\\stackrel\\text{#1}\\Longequal\\!\\!\\!\\!\\!\\!=',
                          '\\Longequal': '\\Relbar',
                        },
                        strict: false,
                        trust: true,
                      }]]}
                    >
                      {selectedNote.content}
                    </ReactMarkdown>
                  </div>
                </section>

                {selectedNote.codeSnippet && (
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xs uppercase tracking-[0.3em] font-black text-text-muted opacity-40">核心实现</h2>
                      <div className="flex items-center gap-2 px-2 py-1 rounded bg-blue-500/10 text-blue-500 dark:text-blue-400 text-[10px] font-bold uppercase">
                        <Code size={12} />
                        C++
                      </div>
                    </div>
                    <pre className="p-6 rounded-2xl bg-secondary border border-border-main overflow-x-auto font-mono text-sm text-blue-600 dark:text-blue-300/90 leading-relaxed shadow-sm">
                      <code>{selectedNote.codeSnippet}</code>
                    </pre>
                  </section>
                )}

                {selectedNote.relatedIds.length > 0 && (
                  <section>
                    <h2 className="text-xs uppercase tracking-[0.3em] font-black text-text-muted opacity-40 mb-4">语义连接</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedNote.relatedIds.map(rid => {
                        const related = notes.find(n => n.id === rid);
                        if (!related) return null;
                        return (
                          <button
                            key={rid}
                            onClick={() => setSelectedNote(related)}
                            className="p-4 rounded-2xl bg-secondary border border-border-main hover:border-accent/30 transition-all text-left group shadow-sm"
                          >
                            <h4 className="font-bold text-sm text-text-main group-hover:text-accent transition-colors">{related.title}</h4>
                            <p className="text-[10px] text-text-muted mt-1 line-clamp-1 opacity-70">{related.summary}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {semanticDiscovery.length > 0 && (
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <h2 className="text-xs uppercase tracking-[0.3em] font-black text-text-muted opacity-40">语义发现</h2>
                      <Sparkles size={12} className="text-accent animate-pulse" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {semanticDiscovery.map(({ note: related, similarity }) => (
                        <button
                          key={related.id}
                          onClick={() => setSelectedNote(related)}
                          className="p-4 rounded-2xl bg-accent/5 border border-accent/10 hover:border-accent/30 transition-all text-left group relative overflow-hidden shadow-sm"
                        >
                          <div className="absolute top-0 right-0 px-2 py-0.5 bg-accent/10 text-accent text-[8px] font-bold">
                            {Math.round(similarity * 100)}% 相似度
                          </div>
                          <h4 className="font-bold text-sm text-text-main group-hover:text-accent transition-colors">{related.title}</h4>
                          <p className="text-[10px] text-text-muted mt-1 line-clamp-1 opacity-70">{related.summary}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-20">
              <BookOpen size={80} strokeWidth={1} className="mb-6" />
              <p className="text-sm font-bold uppercase tracking-[0.4em]">请选择一个资产以查看</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
