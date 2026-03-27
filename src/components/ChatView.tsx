import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Sparkles, Loader2, BrainCircuit, Image as ImageIcon, X, LayoutDashboard, History, Plus, Trash2, MessageSquare, FileText, FileUp, Link as LinkIcon, ChevronRight, BookOpen } from 'lucide-react';
import { ChatMessage, Note, Flashcard, ChatSession } from '../types';
import { chatWithAI, processConversation, BreakthroughConfig, startBreakthroughChat, deconstructDocument, deconstructUrl, deconstructScannedDocument, deconstructTOC } from '../services/gemini';
import { cn } from '../lib/utils';
import { AI_MODEL_OPTIONS, getModelOption, getPreferredTextModel, isKnownTextModel, setPreferredTextModel } from '../lib/aiModels';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;

interface ChatViewProps {
  key?: string;
  notes: Note[];
  chatSessions: ChatSession[];
  onProcess: (note: Partial<Note>, flashcards: Partial<Flashcard>[]) => void;
  isProcessing: boolean;
  onBackToDashboard?: () => void;
  onSaveSession: (session: ChatSession) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  breakthroughConfig?: BreakthroughConfig | null;
  onClearBreakthrough?: () => void;
}

function getUserFacingAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const resetMatch = message.match(/reset after (\d+s)/i);
  const resetHint = resetMatch ? ` 预计 ${resetMatch[1]} 后恢复。` : '';

  if (
    message.includes('MODEL_CAPACITY_EXHAUSTED') ||
    message.includes('RATE_LIMIT_EXCEEDED') ||
    message.includes('rateLimitExceeded') ||
    message.includes('No capacity available for model')
  ) {
    return `当前模型临时拥挤，${resetHint || '请稍后再试。'}你也可以切换到 Gemini 2.5 Pro、Gemini 2.5 Flash-Lite 或其他模型继续。`;
  }

  if (
    message.includes('404 Not Found') ||
    message.includes('"status": "NOT_FOUND"') ||
    message.includes('Requested entity was not found')
  ) {
    return '当前选择的模型在这条 Gemini CLI / Code Assist 链路上不可用。建议切换到 Gemini 3 Flash、Gemini 3.1 Pro、Gemini 2.5 Flash 或 Gemini 2.5 Flash-Lite。';
  }

  if (message.includes('未找到可用的 AI 凭证') || message.includes('auth login')) {
    return '当前服务端还没有可用的 AI 凭证。请先完成 Gemini CLI 风格登录，或配置 GEMINI_API_KEY。';
  }

  return '抱歉，我遇到了错误。请重试。';
}

export default function ChatView({ notes, chatSessions, onProcess, isProcessing, onBackToDashboard, onSaveSession, onDeleteSession, breakthroughConfig, onClearBreakthrough }: ChatViewProps) {
  const [selectedModel, setSelectedModel] = useState(() => getPreferredTextModel());
  const [customModelInput, setCustomModelInput] = useState(() => {
    const currentModel = getPreferredTextModel();
    return isKnownTextModel(currentModel) ? '' : currentModel;
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isDeconstructing, setIsDeconstructing] = useState(false);
  const [pdfAnalysis, setPdfAnalysis] = useState<{ chapters: any[], pageCount: number } | null>(null);
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [customRange, setCustomRange] = useState({ start: 1, end: 20 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isCustomModel = !isKnownTextModel(selectedModel);
  const currentModelOption = getModelOption(selectedModel);

  const applyModel = (modelId: string) => {
    const nextModel = setPreferredTextModel(modelId);
    setSelectedModel(nextModel);
    if (isKnownTextModel(nextModel)) {
      setCustomModelInput('');
    } else {
      setCustomModelInput(nextModel);
    }
  };

  useEffect(() => {
    if (breakthroughConfig) {
      handleStartBreakthrough();
    } else if (messages.length === 0) {
      setMessages([
        { role: 'model', text: "你好！我是你的计算机科学导师。今天我们要学习什么？我可以帮你把新概念与你已有的知识连接起来。" }
      ]);
    }
  }, [breakthroughConfig]);

  const handleStartBreakthrough = async () => {
    if (!breakthroughConfig) return;
    setIsLoading(true);
    setMessages([{ role: 'user', text: `开始针对 [${breakthroughConfig.tag}] 的专项攻坚。` }]);
    try {
      const response = await startBreakthroughChat(breakthroughConfig, notes);
      setMessages([
        { role: 'user', text: `开始针对 [${breakthroughConfig.tag}] 的专项攻坚。` },
        { role: 'model', text: response }
      ]);
      onClearBreakthrough?.();
    } catch (error) {
      console.error("Breakthrough failed:", error);
      setMessages(prev => [...prev, { role: 'model', text: "抱歉，启动攻坚计划时遇到了错误。" }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startNewChat = () => {
    setCurrentSessionId(null);
    setMessages([
      { role: 'model', text: "你好！我是你的计算机科学导师。今天我们要学习什么？我可以帮你把新概念与你已有的知识连接起来。" }
    ]);
    setShowHistory(false);
  };

  const loadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setShowHistory(false);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const extractTextFromPDF = async (file: File, startPage: number = 1, endPage: number = 20): Promise<{ text: string, isScanned: boolean, pageCount: number }> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    const pageCount = pdf.numPages;
    
    const actualEndPage = Math.min(pageCount, endPage);
    
    for (let i = startPage; i <= actualEndPage; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }
    
    // If very little text is extracted from many pages, it's likely a scanned PDF
    const isScanned = fullText.trim().length < 50 && pageCount > 0 && (actualEndPage - startPage + 1) > 0;
    
    return { text: fullText, isScanned, pageCount };
  };

  const extractTOC = async (file: File): Promise<string> => {
    // Extract first 10 pages to find TOC
    const { text } = await extractTextFromPDF(file, 1, 10);
    return text;
  };

  const renderPDFPageToImage = async (file: File, pageNum: number): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    if (context) {
      // @ts-ignore - pdfjs-dist types might be slightly different in this environment
      await page.render({ canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    throw new Error("Failed to get canvas context");
  };

  const handleDeconstruct = async (start?: number, end?: number) => {
    if (!selectedFile || isDeconstructing) return;
    setIsDeconstructing(true);
    try {
      if (selectedFile.type === "application/pdf") {
        const { text, isScanned, pageCount } = await extractTextFromPDF(selectedFile, start || 1, end || 20);
        
        if (isScanned) {
          const imageData = await renderPDFPageToImage(selectedFile, start || 1);
          const result = await deconstructScannedDocument(imageData);
          onProcess(result.note, result.flashcards);
        } else {
          const result = await deconstructDocument(text);
          onProcess(result.note, result.flashcards);
        }
      } else {
        const text = await selectedFile.text();
        const result = await deconstructDocument(text);
        onProcess(result.note, result.flashcards);
      }
      setSelectedFile(null);
      setShowPdfOptions(false);
      setPdfAnalysis(null);
    } catch (error) {
      console.error("Deconstruction failed:", error);
      alert("文档解构失败，请检查文件格式或重试。");
    } finally {
      setIsDeconstructing(false);
    }
  };

  const handleAnalyzeTOC = async () => {
    if (!selectedFile || isDeconstructing) return;
    setIsDeconstructing(true);
    try {
      const { pageCount } = await extractTextFromPDF(selectedFile, 1, 1);
      const tocText = await extractTOC(selectedFile);
      const result = await deconstructTOC(tocText);
      setPdfAnalysis({ chapters: result.chapters, pageCount });
    } catch (error) {
      console.error("TOC analysis failed:", error);
      alert("目录解析失败。");
    } finally {
      setIsDeconstructing(false);
    }
  };

  useEffect(() => {
    if (selectedFile && selectedFile.type === "application/pdf") {
      setShowPdfOptions(true);
    }
  }, [selectedFile]);

  const handleUrlImport = async () => {
    if (!urlInput.trim() || isDeconstructing) return;
    setIsDeconstructing(true);
    try {
      const result = await deconstructUrl(urlInput);
      onProcess(result.note, result.flashcards);
      setUrlInput('');
      setShowUrlInput(false);
    } catch (error) {
      console.error("URL deconstruction failed:", error);
      alert("网页解构失败，请检查 URL 是否有效。");
    } finally {
      setIsDeconstructing(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMsg: ChatMessage = selectedImage
      ? { role: 'user', text: input, image: selectedImage }
      : { role: 'user', text: input };
    
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      // If it's a breakthrough session, we might want to use a different prompt or handle it differently
      // but for now, chatWithAI handles context and RAG which is good.
      const response = await chatWithAI(newMessages, notes);
      const finalMessages: ChatMessage[] = [...newMessages, { role: 'model', text: response }];
      setMessages(finalMessages);
      
      // Save/Update session
      const sessionId = currentSessionId || crypto.randomUUID();
      if (!currentSessionId) setCurrentSessionId(sessionId);
      
      const title = finalMessages.find(m => m.role === 'user')?.text.slice(0, 30) || '新会话';
      
      await onSaveSession({
        id: sessionId,
        title,
        messages: finalMessages,
        updatedAt: Date.now(),
        userId: '' // Will be set by App.tsx
      });

    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', text: getUserFacingAiError(error) }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcess = async () => {
    if (messages.length < 2 || isProcessing) return;
    
    const chatHistory = messages.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.text}`);
    const result = await processConversation(chatHistory);
    onProcess(result.note, result.flashcards);
  };

  const handleModelSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    if (nextValue === '__custom__') {
      const fallback = customModelInput.trim() || selectedModel;
      applyModel(fallback);
      return;
    }
    applyModel(nextValue);
  };

  const handleCustomModelSubmit = () => {
    const nextModel = customModelInput.trim();
    if (!nextModel) return;
    applyModel(nextModel);
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="fixed inset-y-0 left-0 w-72 bg-[#0F0F0F] border-r border-white/10 z-50 flex flex-col shadow-2xl"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <History size={18} className="text-orange-500" />
                历史会话
              </h3>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-lg">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4">
              <button 
                onClick={startNewChat}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/10 transition-all mb-4"
              >
                <Plus size={18} />
                开启新对话
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6">
              {chatSessions.length === 0 ? (
                <div className="text-center py-12 text-white/20 text-xs font-bold uppercase tracking-widest">
                  暂无历史记录
                </div>
              ) : (
                chatSessions.map(session => (
                  <div 
                    key={session.id}
                    className={cn(
                      "group flex items-center gap-2 p-3 rounded-xl transition-all cursor-pointer",
                      currentSessionId === session.id ? "bg-white/10 border border-white/10" : "hover:bg-white/5 border border-transparent"
                    )}
                    onClick={() => loadSession(session)}
                  >
                    <MessageSquare size={16} className={cn(
                      currentSessionId === session.id ? "text-orange-500" : "text-white/20"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{session.title || '无标题会话'}</p>
                      <p className="text-[10px] text-white/20 uppercase font-bold">{new Date(session.updatedAt).toLocaleDateString()}</p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("确定删除此会话吗？")) {
                          onDeleteSession(session.id);
                          if (currentSessionId === session.id) startNewChat();
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay for mobile history */}
      {showHistory && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden" 
          onClick={() => setShowHistory(false)}
        />
      )}

      <div className="flex flex-col h-full max-w-4xl mx-auto w-full relative">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowHistory(true)}
              className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors"
              title="查看历史"
            >
              <History size={20} />
            </button>
            <div>
              <h2 className="text-xl font-bold tracking-tight">学习会话</h2>
              <p className="text-sm text-white/40">通过对话构建你的知识资产。</p>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 md:items-end">
            <div className="flex flex-col gap-2 md:items-end">
              <div className="flex items-center gap-2 justify-end">
                <span className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-bold">
                  模型
                </span>
                <select
                  value={isCustomModel ? '__custom__' : selectedModel}
                  onChange={handleModelSelect}
                  className="min-w-[14rem] bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm font-medium text-white outline-none hover:bg-white/10 focus:border-orange-500/40"
                >
                  {AI_MODEL_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id} className="bg-[#111111] text-white">
                      {option.label}
                    </option>
                  ))}
                  <option value="__custom__" className="bg-[#111111] text-white">
                    自定义模型 ID
                  </option>
                </select>
              </div>
              <p className="max-w-[20rem] text-left md:text-right text-[11px] leading-relaxed text-white/35">
                {currentModelOption?.description || `当前使用自定义模型：${selectedModel}`}
              </p>
              {isCustomModel && (
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <input
                    value={customModelInput}
                    onChange={(event) => setCustomModelInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleCustomModelSubmit();
                      }
                    }}
                    placeholder="例如 gemini-3.1-pro-preview"
                    className="w-full md:w-64 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-orange-500/40"
                  />
                  <button
                    onClick={handleCustomModelSubmit}
                    className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 transition-colors"
                  >
                    应用
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={onBackToDashboard}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm bg-white/5 hover:bg-white/10 transition-all"
              >
                <LayoutDashboard size={16} />
                仪表盘
              </button>
              <button
                onClick={handleProcess}
                disabled={messages.length < 3 || isProcessing}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all",
                  messages.length < 3 || isProcessing
                    ? "bg-white/5 text-white/20 cursor-not-allowed"
                    : "bg-orange-500 hover:bg-orange-600 text-white shadow-[0_0_20px_rgba(249,115,22,0.2)] active:scale-95"
                )}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isProcessing ? "处理中..." : "提取资产"}
              </button>
            </div>
          </div>
        </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide relative"
      >
        <AnimatePresence>
          {(isProcessing || isDeconstructing) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-12 text-center"
            >
              <div className="relative w-32 h-32 mb-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 border-2 border-dashed border-orange-500/30 rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-4 bg-orange-500/10 rounded-full flex items-center justify-center"
                >
                  <BrainCircuit className="w-12 h-12 text-orange-500" />
                </motion.div>
                <motion.div
                  animate={{ y: [-60, 60, -60] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute left-0 right-0 h-0.5 bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.8)]"
                />
              </div>
              <h3 className="text-xl font-bold mb-2">{isDeconstructing ? "正在深度解构文档..." : "正在提取知识资产..."}</h3>
              <p className="text-white/40 text-sm max-w-xs">
                {isDeconstructing 
                  ? "AI 正在扫描文档中的底层逻辑，并将其转化为结构化笔记与闪卡。" 
                  : "AI 正在扫描对话中的底层逻辑，并将其“结晶”为笔记与闪卡。"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        {messages.map((msg, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={i}
            className={cn(
              "flex flex-col max-w-[85%]",
              msg.role === 'user' ? "ml-auto items-end" : "items-start"
            )}
          >
            <div className={cn(
              "px-4 py-3 rounded-2xl text-sm leading-relaxed",
              msg.role === 'user' 
                ? "bg-white/10 text-white rounded-tr-none" 
                : "bg-[#1A1A1A] text-white/90 border border-white/5 rounded-tl-none"
            )}>
              {msg.image && (
                <div className="mb-3 rounded-lg overflow-hidden border border-white/10">
                  <img src={msg.image} alt="User upload" className="max-w-full h-auto" referrerPolicy="no-referrer" />
                </div>
              )}
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
            <span className="text-[10px] mt-1 text-white/20 uppercase tracking-widest font-bold">
              {msg.role === 'user' ? '你' : '导师'}
            </span>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-white/40 text-xs font-medium animate-pulse">
            <BrainCircuit className="w-4 h-4" />
            导师正在思考...
          </div>
        )}
      </div>

      {/* PDF Options Modal */}
      <AnimatePresence>
        {showPdfOptions && selectedFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1A1A1A] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">文档解构选项</h3>
                    <p className="text-xs text-white/40 truncate max-w-[200px]">{selectedFile.name}</p>
                  </div>
                </div>
                <button onClick={() => { setSelectedFile(null); setShowPdfOptions(false); setPdfAnalysis(null); }} className="p-2 hover:bg-white/5 rounded-xl">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
                {!pdfAnalysis ? (
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      onClick={() => handleDeconstruct(1, 20)}
                      className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all group"
                    >
                      <div className="text-left">
                        <div className="font-bold group-hover:text-orange-500 transition-colors">快速解构</div>
                        <div className="text-xs text-white/40">分析文档前 20 页内容</div>
                      </div>
                      <ChevronRight size={18} className="text-white/20" />
                    </button>

                    <button
                      onClick={handleAnalyzeTOC}
                      disabled={isDeconstructing}
                      className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all group"
                    >
                      <div className="text-left">
                        <div className="font-bold group-hover:text-orange-500 transition-colors">
                          {isDeconstructing ? "正在解析目录..." : "分段解构 (推荐教材)"}
                        </div>
                        <div className="text-xs text-white/40">AI 自动识别目录，让你选择特定章节</div>
                      </div>
                      {isDeconstructing ? <Loader2 size={18} className="animate-spin text-orange-500" /> : <BookOpen size={18} className="text-white/20" />}
                    </button>

                    <div className="p-4 bg-white/5 border border-white/5 rounded-xl">
                      <div className="font-bold mb-3">自定义范围</div>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          value={customRange.start}
                          onChange={(e) => setCustomRange({ ...customRange, start: parseInt(e.target.value) })}
                          className="w-20 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm"
                          min={1}
                        />
                        <span className="text-white/40">至</span>
                        <input
                          type="number"
                          value={customRange.end}
                          onChange={(e) => setCustomRange({ ...customRange, end: parseInt(e.target.value) })}
                          className="w-20 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm"
                          min={customRange.start}
                        />
                        <button
                          onClick={() => handleDeconstruct(customRange.start, customRange.end)}
                          className="flex-1 bg-orange-500 text-white font-bold py-1.5 rounded-lg text-sm hover:bg-orange-600"
                        >
                          开始解构
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-sm font-bold text-orange-500 flex items-center gap-2">
                      <Sparkles size={14} /> AI 已识别以下章节：
                    </div>
                    {pdfAnalysis.chapters.map((chapter, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleDeconstruct(chapter.startPage, chapter.endPage)}
                        className="w-full text-left p-4 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all group"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="font-bold group-hover:text-orange-500 transition-colors">{chapter.title}</div>
                          <div className="text-[10px] bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded-full">
                            P{chapter.startPage} - P{chapter.endPage}
                          </div>
                        </div>
                        <div className="text-xs text-white/40 line-clamp-2">{chapter.summary}</div>
                      </button>
                    ))}
                    <button
                      onClick={() => setPdfAnalysis(null)}
                      className="w-full py-2 text-xs text-white/20 hover:text-white transition-colors"
                    >
                      返回选项
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="p-6 bg-gradient-to-t from-[#0A0A0A] to-transparent">
        <AnimatePresence>
          {showUrlInput && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-4 flex gap-2"
            >
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="输入文章或网页 URL..."
                className="flex-1 bg-[#1A1A1A] border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-orange-500/50"
              />
              <button
                onClick={handleUrlImport}
                disabled={!urlInput.trim() || isDeconstructing}
                className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50"
              >
                导入并解构
              </button>
              <button
                onClick={() => setShowUrlInput(false)}
                className="p-2 hover:bg-white/5 rounded-xl"
              >
                <X size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-4 mb-4">
          {selectedImage && (
            <div className="relative inline-block">
              <img src={selectedImage} alt="Preview" className="w-24 h-24 object-cover rounded-xl border border-white/20" referrerPolicy="no-referrer" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {selectedFile && (
            <div className="relative flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-xl min-w-[200px]">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-500">
                <FileText size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{selectedFile.name}</p>
                <p className="text-[10px] text-white/40 uppercase">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => handleDeconstruct()}
                  className="p-1.5 hover:bg-orange-500/20 text-orange-500 rounded-lg transition-all"
                  title="解构文档"
                >
                  <Sparkles size={16} />
                </button>
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="relative group">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageSelect} 
            accept="image/*" 
            className="hidden" 
          />
          <input 
            type="file" 
            ref={docInputRef} 
            onChange={handleFileSelect} 
            accept=".pdf,.txt,.md" 
            className="hidden" 
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
              title="上传图片"
            >
              <ImageIcon size={18} />
            </button>
            <button
              onClick={() => docInputRef.current?.click()}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all"
              title="上传文档 (PDF/Text)"
            >
              <FileUp size={18} />
            </button>
            <button
              onClick={() => setShowUrlInput(!showUrlInput)}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                showUrlInput ? "text-orange-500 bg-orange-500/10" : "text-white/40 hover:text-white hover:bg-white/5"
              )}
              title="从 URL 导入"
            >
              <LinkIcon size={18} />
            </button>
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="询问概念、算法或代码..."
            className="w-full bg-[#1A1A1A] border border-white/10 rounded-2xl pl-40 pr-16 py-4 text-sm focus:outline-none focus:border-orange-500/50 transition-all resize-none h-16 group-hover:border-white/20"
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !selectedImage) || isLoading}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              (!input.trim() && !selectedImage) || isLoading
                ? "text-white/20"
                : "bg-orange-500 text-white hover:bg-orange-600 shadow-lg"
            )}
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-[10px] text-center mt-3 text-white/20 uppercase tracking-widest font-medium">
          按 Enter 发送 • Shift+Enter 换行
        </p>
      </div>
    </div>
  </div>
);
}
