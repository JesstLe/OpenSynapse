import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Send, Sparkles, Loader2, BrainCircuit, Image as ImageIcon, X, LayoutDashboard, History, Plus, Trash2, MessageSquare, FileText, FileUp, Link as LinkIcon, ChevronRight, BookOpen, Square, RefreshCw, Pencil, Copy, Check, Edit3, Download, Search, Filter, Gavel, TrendingUp, Sigma, ShieldAlert } from 'lucide-react';
import { ChatMessage, Note, Flashcard, ChatSession, Persona } from '../types';
import { PRESET_PERSONAS, DEFAULT_PERSONA_ID, getCSTutorPersona } from '../lib/personas';
import { chatWithAI, chatWithAIStream, processConversation, BreakthroughConfig, startBreakthroughChat, startBreakthroughChatStream, deconstructDocument, deconstructUrl, deconstructScannedDocument, deconstructTOC, type StreamChunk } from '../services/gemini';
import { cn, generateUUID } from '../lib/utils';
import { AI_MODEL_OPTIONS, getModelOption, getPreferredTextModel, isKnownTextModel, parseModelSelection, setPreferredTextModel } from '../lib/aiModels';
import ImportDialog from './ImportDialog';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;

interface ChatViewProps {
  key?: string;
  notes: Note[];
  chatSessions: ChatSession[];
  userId?: string;
  onProcess: (note: Partial<Note>, flashcards: Partial<Flashcard>[]) => Promise<void>;
  isProcessing: boolean;
  onBackToDashboard?: () => void;
  onSaveSession: (session: ChatSession) => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  breakthroughConfig?: BreakthroughConfig | null;
  onClearBreakthrough?: () => void;
  showHiddenPersonas?: boolean;
  customPersonas?: Persona[];
}

function getUserFacingAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const resetMatch = message.match(/reset after (\d+s)/i);
  const resetHint = resetMatch ? ` 预计 ${resetMatch[1]} 后恢复。` : '';
  const envVarMatch = message.match(/需要配置 ([A-Z0-9_]+)/);

  if (
    message.includes('MODEL_CAPACITY_EXHAUSTED') ||
    message.includes('RATE_LIMIT_EXCEEDED') ||
    message.includes('rateLimitExceeded') ||
    message.includes('No capacity available for model')
  ) {
    return `当前模型临时拥挤，${resetHint || '请稍后再试。'}你也可以切换到其他 provider 的模型继续。`;
  }

  if (
    message.includes('404 Not Found') ||
    message.includes('"status": "NOT_FOUND"') ||
    message.includes('Requested entity was not found')
  ) {
    return '当前选择的模型在对应供应商 API 上不可用。请切换到同 provider 的其他模型，或改用官方稳定模型。';
  }

  if (envVarMatch) {
    return `当前模型对应的供应商尚未配置密钥。请在 .env.local 中设置 ${envVarMatch[1]} 后重启服务。`;
  }

  if (message.includes('未找到可用的 AI 凭证') || message.includes('auth login')) {
    return '当前服务端还没有可用的 AI 凭证。请先完成 Gemini CLI 风格登录，或配置 GEMINI_API_KEY。';
  }

  if (message.includes('500 Internal Server Error') || message.includes('system error') || message.includes('api_error')) {
    return 'AI 服务暂时出现内部错误，请稍后重试。如果持续出现，请切换到其他模型。';
  }

  if (message.includes('无法解析 JSON') || message.includes('返回了空内容')) {
    return 'AI 模型未能返回有效的结构化数据，请重试。如果持续出现，请尝试切换模型。';
  }

  if (message.includes('Failed to generate content')) {
    // 提取服务端返回的实际错误信息
    const serverErrorMatch = message.match(/Failed to generate content:\s*(.*)/);
    const serverError = serverErrorMatch ? serverErrorMatch[1].trim() : '';
    try {
      const parsed = JSON.parse(serverError);
      if (parsed.error) {
        return `AI 服务错误：${parsed.error}`;
      }
    } catch {}
    if (serverError) {
      return `AI 服务错误：${serverError.substring(0, 150)}`;
    }
  }

  // 兜底：包含实际错误信息便于排查
  const brief = message.length > 150 ? message.substring(0, 150) + '...' : message;
  return `遇到未预期的错误：${brief}`;
}

// 思考过程组件，处理自动滚动
function ThoughtProcess({ thought, isStreaming }: { thought: string; isStreaming: boolean }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (isStreaming && detailsRef.current) {
      detailsRef.current.scrollTop = detailsRef.current.scrollHeight;
    }
  }, [thought, isStreaming]);

  return (
    <details
      ref={detailsRef}
      className="mb-1 w-full text-xs text-text-muted bg-tertiary border border-border-main rounded-xl p-2 max-h-48 overflow-y-auto"
      {...(isStreaming ? { open: true } : {})}
    >
      <summary className="cursor-pointer font-bold select-none opacity-60">💭 思考过程</summary>
      <div className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed opacity-50">{thought}</div>
    </details>
  );
}

function ThinkingIndicator({ thought, isStreaming, modelName }: { thought?: string; isStreaming: boolean; modelName: string }) {
  const [elapsed, setElapsed] = useState(0);
  const steps = [
    '正在理解问题...',
    '正在检索相关知识...',
    '正在分析关联概念...',
    '正在组织回答结构...',
    '正在生成详细内容...',
  ];

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const currentStep = steps[Math.min(Math.floor(elapsed / 2), steps.length - 1)];
  const hasRealThought = thought && thought.trim().length > 0;

  if (hasRealThought) {
    return <ThoughtProcess thought={thought} isStreaming={isStreaming} />;
  }

  return (
    <div className="mb-2 w-full text-xs text-text-muted">
      <div className="flex items-center gap-2 bg-tertiary border border-border-main rounded-xl p-2">
        <Loader2 className="w-3 h-3 animate-spin text-accent" />
        <span className="font-medium">{currentStep}</span>
        <span className="text-[10px] opacity-40">({modelName})</span>
      </div>
    </div>
  );
}

export default function ChatView({

  notes,
  chatSessions,
  userId,
  onProcess,
  isProcessing,
  onBackToDashboard,
  onSaveSession,
  onDeleteSession,
  breakthroughConfig,
  onClearBreakthrough,
  showHiddenPersonas = false,
  customPersonas = []
}: ChatViewProps) {
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
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isAssetProcessing, setIsAssetProcessing] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [editingMessageIdx, setEditingMessageIdx] = useState<number | null>(null);
  const [editInput, setEditInput] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historySourceFilter, setHistorySourceFilter] = useState<'all' | 'native' | 'gemini_import' | 'chatgpt_import' | 'other_import'>('all');
  const [assetProcessStatus, setAssetProcessStatus] = useState<'idle' | 'analyzing' | 'extracting' | 'connecting' | 'success'>('idle');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(DEFAULT_PERSONA_ID);
  
  // 获取所有人格列表（预设 + 自定义 + 隐藏）
  const allAvailablePersonas: Persona[] = [
    ...PRESET_PERSONAS.filter(p => !p.isHidden),
    ...customPersonas,
    ...(showHiddenPersonas ? [getCSTutorPersona()] : [])
  ];

  const currentPersona = allAvailablePersonas.find(p => p.id === selectedPersonaId) || allAvailablePersonas[0];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isCustomModel = !isKnownTextModel(selectedModel);
  const currentModelOption = getModelOption(selectedModel);

  // 搜索 + 来源筛选的对话列表
  const filteredSessions = chatSessions.filter(session => {
    // 来源筛选
    if (historySourceFilter !== 'all') {
      const src = session.source || 'native';
      if (historySourceFilter === 'other_import') {
        if (!src.includes('import') || src === 'gemini_import' || src === 'chatgpt_import') return false;
      } else if (src !== historySourceFilter) {
        return false;
      }
    }
    // 关键字搜索（标题 + 首条消息内容）
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      const titleMatch = (session.title || '').toLowerCase().includes(q);
      const contentMatch = session.messages.some(m => m.text.toLowerCase().includes(q));
      if (!titleMatch && !contentMatch) return false;
    }
    return true;
  });

  const hasExtractableConversation =
    messages.some((message) => message.role === 'user' && message.text.trim()) &&
    messages.some((message, index) => index > 0 && message.role === 'model' && message.text.trim());
  const isProcessBusy = isProcessing || isAssetProcessing || isDeconstructing;

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
        { role: 'model', text: `你好！我是你的${currentPersona.name}。今天我们要学习什么？我可以帮你把新概念与你已有的知识连接起来。` }
      ]);
    }
  }, [breakthroughConfig, currentPersona]);

  const handleStartBreakthrough = async () => {
    if (!breakthroughConfig) return;
    setIsLoading(true);
    const controller = new AbortController();
    setAbortController(controller);
    setMessages([{ role: 'user', text: `开始针对 [${breakthroughConfig.tag}] 的专项攻坚。` }]);
    try {
      setMessages(prev => [...prev, { role: 'model', text: '', thought: '' }]);
      
      let fullText = '';
      let fullThought = '';
      const stream = startBreakthroughChatStream(breakthroughConfig, notes, controller.signal);
      
      for await (const chunk of stream) {
        if (chunk.thought) fullThought += chunk.thought;
        if (chunk.text) fullText += chunk.text;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'model') {
            updated[updated.length - 1] = { ...last, text: fullText, thought: fullThought };
          }
          return updated;
        });
      }
      onClearBreakthrough?.();
    } catch (error: any) {
      if (controller.signal.aborted) return;
      console.error("Breakthrough failed:", error);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last.role === 'model' && !last.text) {
          return prev.slice(0, -1).concat({ role: 'model', text: "抱歉，启动攻坚计划时遇到了错误。" });
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
      setAbortController(null);
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
      { role: 'model', text: `你好！我是你的${currentPersona.name}。今天我们要学习什么？我可以帮你把新概念与你已有的知识连接起来。` }
    ]);
    // 保留当前的 persona，而不是重置为默认
    setShowHistory(false);
  };

  const handlePersonaSwitch = async (newPersonaId: string, newPersona: Persona) => {
    if (newPersonaId === selectedPersonaId) return;

    const hasUserMessages = messages.some(m => m.role === 'user');
    const hasRealConversation = messages.length > 1 || hasUserMessages;

    if (hasRealConversation) {
      const sessionId = currentSessionId || generateUUID();
      const title = messages.find(m => m.role === 'user')?.text.slice(0, 30) || '新会话';
      await onSaveSession({
        id: sessionId,
        title,
        messages: messages.filter(m => !m.thought),
        updatedAt: Date.now(),
        userId: '',
        personaId: selectedPersonaId,
        model: selectedModel,
      });

      setCurrentSessionId(null);
      setSelectedPersonaId(newPersonaId);
      setMessages([
        { role: 'model', text: `你好！我是你的${newPersona.name}。今天我们要学习什么？我可以帮你把新概念与你已有的知识连接起来。` }
      ]);
    } else {
      setSelectedPersonaId(newPersonaId);
      setMessages([
        { role: 'model', text: `你好！我是你的${newPersona.name}。今天我们要学习什么？我可以帮你把新概念与你已有的知识连接起来。` }
      ]);
    }
  };

  const loadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setSelectedPersonaId(session.personaId || DEFAULT_PERSONA_ID);
    setShowHistory(false);
  };



  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const currentModelOption = AI_MODEL_OPTIONS.find(m => m.id === selectedModel);
      const parsed = parseModelSelection(selectedModel);
      const hasVisionSupport = currentModelOption?.supportsVision;
      // 支持智谱 OCR 和 MiniMax 图片理解(Token Plan)
      const canProcessImage = parsed.provider === 'zhipu' || parsed.provider === 'minimax';
      
      if (!hasVisionSupport && !canProcessImage) {
        alert(`当前模型 (${currentModelOption?.label || selectedModel}) 不支持图片。请切换到 Gemini、GPT、智谱或 MiniMax 系列模型。`);
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小超过 5MB 限制，请选择更小的图片。');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.onerror = () => {
        alert('图片读取失败，请重试。');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 限制文档大小为 20MB
      if (file.size > 20 * 1024 * 1024) {
        alert('文档大小超过 20MB 限制，请选择更小的文档。');
        return;
      }
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

  // 通用的流式发送逻辑（handleSend 和 handleRegenerate 共用）
  const handleSendWithMessages = async (messagesToSend: ChatMessage[]) => {
    setIsLoading(true);
    const controller = new AbortController();
    setAbortController(controller);

    try {
      setMessages(prev => [...prev, { role: 'model', text: '', thought: '' }]);

      let fullText = '';
      let fullThought = '';
      const stream = chatWithAIStream(
        messagesToSend,
        notes,
        currentPersona,
        controller.signal
      );

      for await (const chunk of stream) {
        if (chunk.thought) fullThought += chunk.thought;
        if (chunk.text) fullText += chunk.text;
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'model') {
            updated[updated.length - 1] = { ...last, text: fullText, thought: fullThought };
          }
          return updated;
        });
      }

      // 保存会话（thought 不持久化到 Firestore，节省空间）
      const finalMessages: ChatMessage[] = [...messagesToSend, { role: 'model', text: fullText }];
      const sessionId = currentSessionId || generateUUID();
      if (!currentSessionId) setCurrentSessionId(sessionId);
      const title = finalMessages.find(m => m.role === 'user')?.text.slice(0, 30) || '新会话';
      await onSaveSession({
        id: sessionId,
        title,
        messages: finalMessages,
        updatedAt: Date.now(),
        userId: '',
        personaId: selectedPersonaId,
        model: selectedModel,
      });
    } catch (error: any) {
      if (controller.signal.aborted) return; // 用户主动停止，不显示错误
      console.error("Chat error:", error);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last.role === 'model' && !last.text) {
          return prev.slice(0, -1).concat({ role: 'model', text: getUserFacingAiError(error) });
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
      setAbortController(null);
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
    await handleSendWithMessages(newMessages);
  };

  // 停止生成
  const handleStop = () => {
    abortController?.abort();
    setAbortController(null);
    setIsLoading(false);
  };

  // 重新生成最后一条 AI 回复
  const handleRegenerate = async () => {
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const truncated = messages.slice(0, lastUserIdx + 1);
    setMessages(truncated);
    await handleSendWithMessages(truncated);
  };

  const handleProcess = async () => {
    if (!hasExtractableConversation || isProcessBusy) return;
    setIsAssetProcessing(true);
    setAssetProcessStatus('analyzing');
    try {
      const chatHistory = messages.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.text}`);
      
      // Step 1: AI Analysis
      setAssetProcessStatus('extracting');
      const result = await processConversation(chatHistory);
      
      // Step 2: Saving and Linking (handled by App.tsx through onProcess)
      setAssetProcessStatus('connecting');
      await onProcess(result.note, result.flashcards);
      
      // Step 3: Success
      setAssetProcessStatus('success');
      // 给用户一点时间看到成功的提示
await new Promise(resolve => setTimeout(resolve, 400));
    } catch (error) {
      console.error('提取资产失败:', error);
      setMessages(prev => [...prev, {
        role: 'model',
        text: `⚠️ 提取资产失败：${getUserFacingAiError(error)}`,
      }]);
    } finally {
      setIsAssetProcessing(false);
      setAssetProcessStatus('idle');
    }
  };

  // 复制消息内容
  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // fallback
    }
  };

  // 编辑用户消息后重发
  const handleEditResend = async (idx: number, newText: string) => {
    setEditingMessageIdx(null);
    const truncated = messages.slice(0, idx);
    const editedMsg: ChatMessage = { role: 'user', text: newText };
    const newMessages = [...truncated, editedMsg];
    setMessages(newMessages);
    await handleSendWithMessages(newMessages);
  };

  // 重命名会话
  const handleRenameSession = async (session: ChatSession, newTitle: string) => {
    setRenamingSessionId(null);
    if (!newTitle.trim() || newTitle.trim() === session.title) return;
    await onSaveSession({ ...session, title: newTitle.trim() });
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
            className="fixed inset-y-0 left-0 w-72 bg-sidebar border-r border-border-main z-50 flex flex-col shadow-2xl"
          >
            <div className="p-6 border-b border-border-main flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2">
                <History size={18} className="text-accent" />
                历史会话
              </h3>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-tertiary rounded-lg text-text-muted transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 space-y-2">
              <button 
                onClick={startNewChat}
                className="w-full flex items-center justify-center gap-2 py-3 bg-tertiary border border-border-main rounded-xl text-sm font-bold hover:bg-secondary transition-all text-text-main shadow-sm"
              >
                <Plus size={18} />
                开启新对话
              </button>
              <button 
                onClick={() => { setShowHistory(false); setShowImportDialog(true); }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-accent/10 border border-accent/20 rounded-xl text-sm font-bold hover:bg-accent/20 transition-all text-accent shadow-sm"
              >
                <Download size={18} />
                导入 Gemini 对话
              </button>
            </div>

            {/* 搜索与筛选 */}
            <div className="px-4 pb-3 space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="搜索对话..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-tertiary border border-border-main text-sm text-text-main placeholder:text-text-muted/40 outline-none focus:border-accent/40 transition-colors"
                />
                {historySearch && (
                  <button
                    onClick={() => setHistorySearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { key: 'all' as const, label: '全部' },
                  { key: 'native' as const, label: '原生' },
                  { key: 'gemini_import' as const, label: 'Gemini' },
                  { key: 'chatgpt_import' as const, label: 'ChatGPT' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setHistorySourceFilter(f.key)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                      historySourceFilter === f.key
                        ? "bg-accent/20 text-accent"
                        : "bg-tertiary text-text-muted hover:text-text-main"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6">
              {filteredSessions.length === 0 ? (
                <div className="text-center py-12 text-text-muted/30 text-xs font-bold uppercase tracking-widest">
                  {historySearch || historySourceFilter !== 'all' ? '没有匹配的对话' : '暂无历史记录'}
                </div>
              ) : (
                filteredSessions.map(session => (
                  <div 
                    key={session.id}
                    className={cn(
                      "group flex items-center gap-2 p-3 rounded-xl transition-all cursor-pointer border",
                      currentSessionId === session.id 
                        ? "bg-accent/10 border-accent/20 text-accent" 
                        : "hover:bg-tertiary border-transparent text-text-sub"
                    )}
                    onClick={() => loadSession(session)}
                  >
                    <MessageSquare size={16} className={cn(
                      currentSessionId === session.id ? "text-accent" : "text-text-muted"
                    )} />
                    <div className="flex-1 min-w-0">
                      {renamingSessionId === session.id ? (
                        <input
                          autoFocus
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleRenameSession(session, renameInput); }
                            if (e.key === 'Escape') setRenamingSessionId(null);
                          }}
                          onBlur={() => handleRenameSession(session, renameInput)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-primary border border-accent/50 rounded-lg px-2 py-1 text-sm outline-none text-text-main"
                        />
                      ) : (
                        <>
                          <p className="text-sm font-medium truncate flex items-center gap-1.5">
                            {session.title || '无标题会话'}
                            {session.source && session.source !== 'native' && (
                              <span className={cn(
                                "inline-block px-1.5 py-0 rounded text-[8px] font-black uppercase tracking-wider",
                                session.source === 'gemini_import' ? "bg-blue-500/10 text-blue-500" :
                                session.source === 'chatgpt_import' ? "bg-green-500/10 text-green-500" :
                                "bg-purple-500/10 text-purple-500"
                              )}>
                                {session.source === 'gemini_import' ? 'Gemini' :
                                 session.source === 'chatgpt_import' ? 'GPT' : '导入'}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-text-muted uppercase font-bold">{new Date(session.updatedAt).toLocaleDateString()}</p>
                        </>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingSessionId(session.id);
                        setRenameInput(session.title || '');
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-tertiary text-text-muted rounded-lg transition-all"
                      title="重命名"
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("确定删除此会话吗？")) {
                          onDeleteSession(session.id);
                          if (currentSessionId === session.id) startNewChat();
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 text-red-500 rounded-lg transition-all"
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

      <div className="flex flex-col h-full max-w-5xl xl:max-w-6xl mx-auto w-full relative">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border-main flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-primary/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4 text-text-main">
            <button 
              onClick={() => setShowHistory(true)}
              className="p-2 rounded-lg hover:bg-tertiary text-text-muted hover:text-text-main transition-colors"
              title="查看历史"
            >
              <History size={20} />
            </button>
            <div className="flex items-center gap-3 select-none">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-300 bg-secondary border border-border-main group-hover:border-accent/30 shadow-sm",
                showHiddenPersonas && "ring-2 ring-purple-500/50 border-purple-500/30"
              )}>
                <img src="/logo.png" className={cn("w-8 h-8 object-contain", showHiddenPersonas && "hue-rotate-[280deg]")} alt="Logo" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-xl font-bold tracking-tight">
                  {currentPersona.name} {showHiddenPersonas && <span className="text-purple-500 text-xs ml-1 opacity-60">· 隐</span>}
                </h2>
                <p className="text-[10px] text-text-muted font-bold opacity-60 uppercase tracking-widest leading-none">OpenSynapse AI 导师系统</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 md:items-end">
            <div className="flex flex-col gap-2 md:items-end">
              <div className="flex items-center gap-2 justify-end">
                <span className="text-[10px] uppercase tracking-[0.22em] text-text-muted font-bold">
                  模型
                </span>
                <select
                  value={isCustomModel ? '__custom__' : selectedModel}
                  onChange={handleModelSelect}
                  className="min-w-[14rem] bg-tertiary border border-border-main rounded-full px-4 py-2 text-sm font-medium text-text-main outline-none hover:bg-secondary focus:border-accent/40"
                >
                  {AI_MODEL_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id} className="bg-primary text-text-main">
                      {option.label}
                    </option>
                  ))}
                  <option value="__custom__" className="bg-primary text-text-main">
                    自定义模型 ID
                  </option>
                </select>
              </div>
              {/* 模型描述已隐藏以节省空间 */}
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
                    placeholder="例如 openai/gpt-5.2 或 gemini/gemini-3.1-pro-preview"
                    className="w-full md:w-64 rounded-full border border-border-main bg-tertiary px-4 py-2 text-sm text-text-main placeholder:text-text-muted/40 outline-none focus:border-accent/40"
                  />
                  <button
                    onClick={handleCustomModelSubmit}
                    className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-text-main hover:bg-tertiary transition-colors"
                  >
                    应用
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={onBackToDashboard}
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm bg-tertiary text-text-sub hover:bg-secondary transition-all"
              >
                <LayoutDashboard size={16} />
                仪表盘
              </button>
              <button
                onClick={handleProcess}
                disabled={!hasExtractableConversation || isProcessBusy}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all shadow-md",
                  !hasExtractableConversation || isProcessBusy
                    ? "bg-tertiary text-text-muted/40 cursor-not-allowed"
                    : "bg-accent hover:bg-accent-hover text-white shadow-accent/20 active:scale-95"
                )}
              >
                {isProcessBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isProcessBusy ? "处理中..." : "提取资产"}
              </button>
            </div>
          </div>
        </div>

      {/* Messages */}
      
      <AnimatePresence>
          {(isProcessing || isDeconstructing || isAssetProcessing) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-12 text-center"
            >
              <div className="relative w-32 h-32 mb-8">
                {assetProcessStatus === 'success' ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute inset-0 bg-green-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.5)]"
                  >
                    <Check className="w-16 h-16 text-white" strokeWidth={3} />
                  </motion.div>
                ) : (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                      className={cn(
                        "absolute inset-0 border-2 border-dashed rounded-full",
                        isDeconstructing ? "border-blue-500/30" : "border-orange-500/30"
                      )}
                    />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className={cn(
                        "absolute inset-4 rounded-full flex items-center justify-center",
                        isDeconstructing ? "bg-blue-500/10" : "bg-orange-500/10"
                      )}
                    >
                      {isDeconstructing ? (
                        <Sparkles className="w-12 h-12 text-blue-500" />
                      ) : (
                        <BrainCircuit className="w-12 h-12 text-orange-500" />
                      )}
                    </motion.div>
                    <motion.div
                      animate={{ y: [-60, 60, -60] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className={cn(
                        "absolute left-0 right-0 h-0.5 shadow-[0_0_15px_rgba(249,115,22,0.8)]",
                        isDeconstructing ? "bg-blue-500" : "bg-orange-500"
                      )}
                    />
                  </>
                )}
              </div>
              <div className="flex flex-col items-center gap-3">
                <h3 className={cn(
                  "text-2xl font-black tracking-tighter uppercase",
                  assetProcessStatus === 'success' ? "text-green-500" : 
                  isDeconstructing ? "text-blue-500" : "text-orange-500"
                )}>
                  {assetProcessStatus === 'success' ? "提取成功" : 
                   isDeconstructing ? "正在解构资产" : "正在提取知识"}
                </h3>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-text-muted text-sm font-bold uppercase tracking-widest opacity-60">
                    {assetProcessStatus === 'analyzing' && "正在分析对话内容..."}
                    {assetProcessStatus === 'extracting' && "AI 正在提取核心知识点..."}
                    {assetProcessStatus === 'connecting' && "正在建立语义连接并保存..."}
                    {assetProcessStatus === 'success' && "正在跳转至笔记视图..."}
                    {(!assetProcessStatus || assetProcessStatus === 'idle') && "请稍候..."}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Loader2 size={12} className="animate-spin text-text-muted/40" />
                    <span className="text-[10px] text-text-muted/40 font-bold uppercase tracking-widest">
                      加密同步中 • NEURAL SYNC
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-hide relative"
      >
        {messages.map((msg, i) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={i}
            className={cn(
              "flex flex-col",
              msg.role === 'user' ? "ml-auto items-end max-w-[85%] md:max-w-[80%]" : "items-start max-w-[95%] md:max-w-[92%]"
            )}
          >
            {/* 思考过程折叠展示 */}
            {msg.role === 'model' && showThinking && (msg.thought || (isLoading && i === messages.length - 1)) && (
              <ThinkingIndicator
                thought={msg.thought}
                isStreaming={isLoading && i === messages.length - 1}
                modelName={currentModelOption?.label || selectedModel}
              />
            )}
            <div className={cn(
              "px-3 py-2 rounded-2xl text-sm leading-relaxed group/msg relative",
              msg.role === 'user' 
                ? "bg-accent text-white rounded-tr-none shadow-sm shadow-accent/10" 
                : "bg-secondary text-text-main border border-border-main rounded-tl-none shadow-sm shadow-black/5"
            )}>
              {msg.image && (
                <div className="mb-3 rounded-lg overflow-hidden border border-white/10">
                  <img src={msg.image} alt="User upload" className="max-w-full h-auto" referrerPolicy="no-referrer" />
                </div>
              )}
              {/* 用户消息编辑模式 */}
              {msg.role === 'user' && editingMessageIdx === i ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    autoFocus
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditResend(i, editInput); }
                      if (e.key === 'Escape') setEditingMessageIdx(null);
                    }}
                    className="w-full bg-primary/20 border border-white/20 rounded-lg px-3 py-2 text-sm outline-none resize-none min-h-[60px] text-white"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingMessageIdx(null)} className="px-3 py-1 text-xs text-white/40 hover:text-white rounded-lg">
                      取消
                    </button>
                    <button onClick={() => handleEditResend(i, editInput)} className="px-3 py-1 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600">
                      重新发送
                    </button>
                  </div>
                </div>
              ) : (
                <div className="markdown-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[[rehypeKatex, {
                      strict: false,
                      trust: true,
                      throwOnError: false,
                    }]]}
                  >
                    {msg.text || (isLoading && i === messages.length - 1 ? '' : '')}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-text-muted uppercase tracking-widest font-bold">
                {msg.role === 'user' ? '你' : '导师'}
              </span>
              {/* 复制按钮：所有有内容的消息都显示 */}
              {msg.text && !isLoading && (
                <button
                  onClick={() => handleCopy(msg.text, i)}
                  className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent transition-colors uppercase tracking-widest font-bold"
                  title="复制"
                >
                  {copiedIdx === i ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                  {copiedIdx === i ? '已复制' : '复制'}
                </button>
              )}
              {/* 用户消息编辑按钮 */}
              {msg.role === 'user' && !isLoading && editingMessageIdx !== i && (
                <button
                  onClick={() => { setEditingMessageIdx(i); setEditInput(msg.text); }}
                  className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent transition-colors uppercase tracking-widest font-bold"
                  title="编辑并重发"
                >
                  <Edit3 size={12} /> 编辑
                </button>
              )}
              {/* 重新生成按钮：只在最后一条 AI 消息 + 非 loading 状态显示 */}
              {msg.role === 'model' && i === messages.length - 1 && !isLoading && msg.text && (
                <button
                  onClick={handleRegenerate}
                  className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent transition-colors uppercase tracking-widest font-bold"
                  title="重新生成"
                >
                  <RefreshCw size={12} /> 重新生成
                </button>
              )}
            </div>
          </motion.div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'model' && (
          <div className="flex items-center gap-2 text-text-muted text-xs font-medium animate-pulse">
            <BrainCircuit className="w-4 h-4" />
            {messages[messages.length - 1]?.thought ? '正在生成回复...' : '导师正在思考...'}
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
              className="bg-card border border-border-main rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-border-main flex justify-between items-center bg-sidebar">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/20 rounded-lg text-accent">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-text-main">文档解构选项</h3>
                    <p className="text-xs text-text-muted truncate max-w-[200px]">{selectedFile.name}</p>
                  </div>
                </div>
                <button onClick={() => { setSelectedFile(null); setShowPdfOptions(false); setPdfAnalysis(null); }} className="p-2 hover:bg-tertiary rounded-xl text-text-muted transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto bg-primary">
                {!pdfAnalysis ? (
                  <div className="grid grid-cols-1 gap-4">
                    <button
                      onClick={() => handleDeconstruct(1, 20)}
                      className="flex items-center justify-between p-4 bg-tertiary border border-border-main rounded-xl hover:bg-secondary transition-all group shadow-sm"
                    >
                      <div className="text-left">
                        <div className="font-bold text-text-main group-hover:text-accent transition-colors">快速解构</div>
                        <div className="text-xs text-text-muted opacity-60">分析文档前 20 页内容</div>
                      </div>
                      <ChevronRight size={18} className="text-text-muted opacity-40" />
                    </button>

                    <button
                      onClick={handleAnalyzeTOC}
                      disabled={isDeconstructing}
                      className="flex items-center justify-between p-4 bg-tertiary border border-border-main rounded-xl hover:bg-secondary transition-all group shadow-sm"
                    >
                      <div className="text-left">
                        <div className="font-bold text-text-main group-hover:text-accent transition-colors">
                          {isDeconstructing ? "正在解析目录..." : "分段解构 (推荐教材)"}
                        </div>
                        <div className="text-xs text-text-muted opacity-60">AI 自动识别目录，让你选择特定章节</div>
                      </div>
                      {isDeconstructing ? <Loader2 size={18} className="animate-spin text-accent" /> : <BookOpen size={18} className="text-text-muted opacity-40" />}
                    </button>

                    <div className="p-4 bg-tertiary border border-border-main rounded-xl shadow-sm">
                      <div className="font-bold text-text-main mb-3">自定义范围</div>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          value={customRange.start}
                          onChange={(e) => setCustomRange({ ...customRange, start: parseInt(e.target.value) })}
                          className="w-20 bg-primary border border-border-main rounded-lg px-3 py-1.5 text-sm text-text-main"
                          min={1}
                        />
                        <span className="text-text-muted font-medium">至</span>
                        <input
                          type="number"
                          value={customRange.end}
                          onChange={(e) => setCustomRange({ ...customRange, end: parseInt(e.target.value) })}
                          className="w-20 bg-primary border border-border-main rounded-lg px-3 py-1.5 text-sm text-text-main"
                          min={customRange.start}
                        />
                        <button
                          onClick={() => handleDeconstruct(customRange.start, customRange.end)}
                          className="flex-1 bg-accent text-white font-bold py-1.5 rounded-lg text-sm hover:bg-accent-hover transition-all shadow-sm"
                        >
                          开始解构
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-sm font-bold text-accent flex items-center gap-2">
                      <Sparkles size={14} /> AI 已识别以下章节：
                    </div>
                    {pdfAnalysis.chapters.map((chapter, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleDeconstruct(chapter.startPage, chapter.endPage)}
                        className="w-full text-left p-4 bg-tertiary border border-border-main rounded-xl hover:bg-secondary transition-all group shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="font-bold text-text-main group-hover:text-accent transition-colors">{chapter.title}</div>
                          <div className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full font-bold">
                            P{chapter.startPage} - P{chapter.endPage}
                          </div>
                        </div>
                        <div className="text-xs text-text-muted line-clamp-2 opacity-70">{chapter.summary}</div>
                      </button>
                    ))}
                    <button
                      onClick={() => setPdfAnalysis(null)}
                      className="w-full py-2 text-xs text-text-muted hover:text-text-main transition-colors font-medium"
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
    {/* Input Section */}
      <div className="px-3 py-2 bg-primary/80 backdrop-blur-md border-t border-border-main pb-6">
        <div className="max-w-5xl xl:max-w-6xl mx-auto flex flex-col gap-3">
          
          <AnimatePresence>
            {showUrlInput && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mb-2 flex gap-2 p-2 bg-secondary/50 rounded-xl border border-border-main"
              >
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="输入文章或网页 URL..."
                  className="flex-1 bg-transparent border-none px-2 py-1 text-sm text-text-main placeholder:text-text-muted focus:outline-none"
                />
                <button
                  onClick={handleUrlImport}
                  disabled={!urlInput.trim() || isDeconstructing}
                  className="px-3 py-1 bg-accent text-white rounded-lg text-xs font-bold hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {isDeconstructing ? '处理中...' : '开始解构'}
                </button>
                <button
                  onClick={() => setShowUrlInput(false)}
                  className="p-1 hover:bg-tertiary rounded-lg text-text-muted"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attachments Preview */}
          <div className="flex gap-4">
            {selectedImage && (
              <div className="relative inline-block">
                <img src={selectedImage} alt="Preview" className="w-20 h-20 object-cover rounded-xl border border-border-main shadow-md" />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {selectedFile && (
              <div className="relative flex items-center gap-3 p-3 bg-secondary/50 border border-border-main rounded-xl min-w-[200px]">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                  <FileText size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{selectedFile.name}</p>
                  <p className="text-[10px] text-text-muted uppercase">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleDeconstruct()}
                    className="p-1.5 hover:bg-accent/20 text-accent rounded-lg transition-all"
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

          {/* Persona Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none px-1">
            {allAvailablePersonas.map((p) => {
              const Icon = ({
                BrainCircuit, Sigma, Gavel, TrendingUp, Sparkles, ShieldAlert
              } as any)[p.icon] || MessageSquare;
              
              const isActive = selectedPersonaId === p.id;
              
              return (
                <button
                  key={p.id}
                  onClick={() => handlePersonaSwitch(p.id, p)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-xs font-bold whitespace-nowrap border shrink-0",
                    isActive 
                      ? "bg-accent text-white border-accent shadow-lg shadow-accent/20" 
                      : "bg-tertiary text-text-muted border-border-main hover:border-accent/50 hover:text-text-main"
                  )}
                >
                  <Icon size={14} className={cn(isActive ? "text-white" : "text-accent")} />
                  {p.name}
                </button>
              );
            })}
          </div>

          {/* Input Box */}
          <div className="relative group/input">
            <div className="absolute -inset-1 bg-gradient-to-r from-accent/20 to-purple-500/20 rounded-3xl blur opacity-0 group-focus-within/input:opacity-100 transition duration-500"></div>
            <div className="relative flex flex-col gap-2 p-2 bg-secondary border border-border-main rounded-2xl min-h-[48px] group-focus-within/input:border-accent/40 group-focus-within/input:ring-1 group-focus-within/input:ring-accent/40 transition-all duration-300">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={`以${currentPersona.name}的身份交流...`}
                className="w-full bg-transparent border-none p-2 text-sm text-text-main placeholder:text-text-muted focus:outline-none resize-none min-h-[40px]"
              />
              
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1">
                  <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                  <input type="file" ref={docInputRef} onChange={handleFileSelect} accept=".pdf,.txt,.md" className="hidden" />
                  
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-tertiary transition-all"
                    title="上传图片"
                  >
                    <ImageIcon size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-tertiary transition-all"
                    title="上传文档"
                  >
                    <FileUp size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                      showUrlInput ? "text-accent bg-accent/10" : "text-text-muted hover:text-text-main hover:bg-tertiary"
                    )}
                    title="从 URL 导入"
                  >
                    <LinkIcon size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {isLoading ? (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                      title="停止生成"
                    >
                      <Square size={14} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!input.trim() && !selectedImage}
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                        !input.trim() && !selectedImage
                          ? "text-text-muted opacity-30"
                          : "bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20"
                      )}
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-center mt-1 text-text-muted opacity-40 uppercase tracking-widest font-medium">
            Enter 发送 · Shift+Enter 换行
          </p>
        </div>
      </div>

      {/* 导入对话弹窗 */}
      <AnimatePresence>
        {showImportDialog && (
          <ImportDialog
            open={showImportDialog}
            onClose={() => setShowImportDialog(false)}
            existingSessions={chatSessions}
            userId={userId || chatSessions[0]?.userId || 'local'}
            onImportSessions={async (sessions) => {
              for (const session of sessions) {
                await onSaveSession(session);
              }
            }}
            onImportAndExtract={async (sessions) => {
              for (const session of sessions) {
                await onSaveSession(session);
                const history = session.messages.map(m => m.text);
                try {
                  const result = await processConversation(history);
                  await onProcess(result.note, result.flashcards);
                } catch (e) {
                  console.error(`[Import] 知识提炼失败 (${session.title}):`, e);
                }
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  </div>
  );
}
