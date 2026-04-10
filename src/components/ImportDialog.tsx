/**
 * 对话导入弹窗组件
 * 支持三种输入方式：拖拽/选择文件、粘贴内容、（预留 URL）
 * 提供解析预览、去重警告、双模式导入（仅导入 / 导入并提炼）
 */

import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Upload,
  ClipboardPaste,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  MessageSquare,
  FileJson,
  FileCode,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ChatSession } from '../types';
import {
  toSessions,
  checkDuplicate,
  parseCustomFormat,
  CustomFormatConfig,
} from '../services/importParsers';
import {
  parseImportUniversal,
} from '../services/universalImportParser';
import type { ParseResult, ParsedConversation } from '../services/importParsers';

interface AIService {
  generate(prompt: string, options?: { model?: string }): Promise<string>;
}

// ─── 类型 ───

type ImportTab = 'file' | 'paste' | 'custom';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  existingSessions: ChatSession[];
  userId: string;
  /** 仅导入为 ChatSession */
  onImportSessions: (sessions: ChatSession[]) => Promise<void>;
  /** 导入并触发知识提炼 */
  onImportAndExtract: (sessions: ChatSession[]) => Promise<void>;
}

// ─── 解析预览状态 ───

interface PreviewState {
  result: ParseResult;
  sessions: ChatSession[];
  duplicates: { session: ChatSession; existing: ChatSession }[];
}

// ─── AI 服务（用于智能解析）───

function createSimpleAIService(): AIService {
  return {
    async generate(prompt: string): Promise<string> {
      // 调用默认模型进行解析
      // 这里使用 fetch 直接调用 API
      const response = await fetch('/api/ai/parse-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      
      if (!response.ok) {
        throw new Error('AI 解析请求失败');
      }
      
      const data = await response.json();
      return data.result;
    },
  };
}

// ─── 格式图标 ───

function FormatIcon({ format }: { format: string }) {
  switch (format) {
    case 'json': return <FileJson size={16} className="text-yellow-500" />;
    case 'markdown': return <FileCode size={16} className="text-blue-500" />;
    default: return <FileText size={16} className="text-text-muted" />;
  }
}

// ─── 主组件 ───

export default function ImportDialog({
  open,
  onClose,
  existingSessions,
  userId,
  onImportSessions,
  onImportAndExtract,
}: ImportDialogProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>('file');
  const [pasteContent, setPasteContent] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const [customContent, setCustomContent] = useState('');
  const [userMarker, setUserMarker] = useState('用户：');
  const [assistantMarker, setAssistantMarker] = useState('助手：');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── 重置状态 ───

  const resetState = useCallback(() => {
    setPreview(null);
    setError(null);
    setPasteContent('');
    setCustomContent('');
    setUserMarker('用户：');
    setAssistantMarker('助手：');
    setIsImporting(false);
    setIsProcessing(false);
    setImportSuccess(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  // ─── 解析输入 ───

  const processContent = useCallback(async (content: string, filename?: string) => {
    setError(null);
    setPreview(null);
    setIsProcessing(true);
    setImportSuccess(null);

    try {
      const result = await parseImportUniversal(content, {
        filename,
        useAI: true,
        aiService: createSimpleAIService(),
      });
      const sessions = await toSessions(result, userId);

      // 去重检查
      const duplicates: PreviewState['duplicates'] = [];
      for (const session of sessions) {
        if (session.fingerprint) {
          const existing = checkDuplicate(session.fingerprint, existingSessions);
          if (existing) {
            duplicates.push({ session, existing });
          }
        }
      }

      setPreview({ result, sessions, duplicates });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsProcessing(false);
    }
  }, [userId, existingSessions]);

  // ─── 文件处理 ───

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // 限制文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
      setError('文件大小超过 10MB 限制。');
      return;
    }

    const content = await file.text();
    await processContent(content, file.name);
  }, [processContent]);

  // ─── 拖拽处理 ───

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    await handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  // ─── 粘贴处理 ───

  const handlePasteSubmit = useCallback(async () => {
    if (!pasteContent.trim()) return;
    await processContent(pasteContent.trim());
  }, [pasteContent, processContent]);

  const handleCustomFormatSubmit = useCallback(async () => {
    if (!customContent.trim() || !userMarker.trim() || !assistantMarker.trim()) return;

    setError(null);
    setPreview(null);
    setIsProcessing(true);
    setImportSuccess(null);

    try {
      const config: CustomFormatConfig = {
        userMarker: userMarker.trim(),
        assistantMarker: assistantMarker.trim(),
      };

      const result = parseCustomFormat(customContent.trim(), config);
      const sessions = await toSessions(result, userId);

      const duplicates: PreviewState['duplicates'] = [];
      for (const session of sessions) {
        if (session.fingerprint) {
          const existing = checkDuplicate(session.fingerprint, existingSessions);
          if (existing) {
            duplicates.push({ session, existing });
          }
        }
      }

      setPreview({ result, sessions, duplicates });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsProcessing(false);
    }
  }, [customContent, userMarker, assistantMarker, userId, existingSessions]);

  // ─── 导入执行 ───

  const handleImport = useCallback(async (extract: boolean) => {
    if (!preview) return;
    setIsImporting(true);
    setError(null);

    try {
      // 过滤掉用户不想重复导入的对话（此处默认全部导入）
      const sessionsToImport = preview.sessions;

      if (extract) {
        await onImportAndExtract(sessionsToImport);
      } else {
        await onImportSessions(sessionsToImport);
      }

      const count = sessionsToImport.length;
      setImportSuccess(`成功导入 ${count} 个对话${extract ? '，知识提炼已开始' : ''}。`);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsImporting(false);
    }
  }, [preview, onImportSessions, onImportAndExtract]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-card border border-border-main rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl"
      >
        {/* 头部 */}
        <div className="p-6 border-b border-border-main bg-sidebar flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent/20 rounded-xl text-accent">
              <Upload size={20} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-text-main">导入对话</h3>
              <p className="text-xs text-text-muted">支持 JSON / Markdown / 纯文本格式</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-tertiary rounded-xl text-text-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto bg-primary">
          {/* 成功提示 */}
          {importSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400"
            >
              <CheckCircle2 size={20} />
              <div className="flex-1">
                <p className="text-sm font-bold">{importSuccess}</p>
              </div>
              <button
                onClick={handleClose}
                className="px-3 py-1 rounded-full bg-green-500/20 text-xs font-bold hover:bg-green-500/30 transition-colors"
              >
                完成
              </button>
            </motion.div>
          )}

          {/* Tab 切换 */}
          {!importSuccess && (
            <>
              <div className="flex items-center gap-2 p-1 rounded-2xl bg-tertiary border border-border-main">
                <button
                  onClick={() => { setActiveTab('file'); resetState(); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
                    activeTab === 'file'
                      ? "bg-card text-text-main shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  )}
                >
                  <Upload size={16} />
                  上传文件
                </button>
                <button
                  onClick={() => { setActiveTab('paste'); resetState(); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
                    activeTab === 'paste'
                      ? "bg-card text-text-main shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  )}
                >
                  <ClipboardPaste size={16} />
                  粘贴内容
                </button>
                <button
                  onClick={() => { setActiveTab('custom'); resetState(); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
                    activeTab === 'custom'
                      ? "bg-card text-text-main shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  )}
                >
                  <FileText size={16} />
                  自定义格式
                </button>
              </div>

              {/* 文件上传 Tab */}
              {activeTab === 'file' && !preview && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-4 p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
                    isDragOver
                      ? "border-accent bg-accent/5 scale-[1.01]"
                      : "border-border-main hover:border-accent/40 hover:bg-tertiary"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.md,.txt,.markdown"
                    onChange={(e) => handleFiles(e.target.files)}
                    className="hidden"
                  />
                  {isProcessing ? (
                    <Loader2 size={32} className="animate-spin text-accent" />
                  ) : (
                    <>
                      <div className="p-4 rounded-2xl bg-tertiary">
                        <Upload size={28} className="text-text-muted" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-text-main">拖拽文件到这里，或点击选择</p>
                        <p className="text-xs text-text-muted mt-1">支持 .json / .md / .txt 格式（最大 10MB）</p>
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-[10px] font-bold">SaveChat</span>
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold">AI Chat Exporter</span>
                        <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-bold">ChatGPT Export</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 粘贴 Tab */}
              {activeTab === 'paste' && !preview && (
                <div className="space-y-4">
                  <textarea
                    value={pasteContent}
                    onChange={(e) => setPasteContent(e.target.value)}
                    placeholder={"粘贴对话内容...\n\n支持的格式：\n## User\n你好\n\n## Gemini\n你好！有什么可以帮你的？"}
                    className="w-full h-48 bg-secondary border border-border-main rounded-2xl px-4 py-3 text-sm text-text-main placeholder:text-text-muted/40 outline-none focus:border-accent/40 resize-none font-mono"
                  />
                  <button
                    onClick={handlePasteSubmit}
                    disabled={!pasteContent.trim() || isProcessing}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-accent text-white font-bold hover:bg-accent-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isProcessing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    {isProcessing ? '解析中...' : '解析内容'}
                  </button>
                </div>
              )}

              {/* 错误提示 */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400"
                >
                  <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold">解析失败</p>
                    <p className="text-xs mt-1 opacity-80">{error}</p>
                  </div>
                </motion.div>
              )}

              {/* 解析预览 */}
              {preview && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* 概览 */}
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-tertiary border border-border-main">
                    <CheckCircle2 size={20} className="text-green-500" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-text-main">
                        检测到 {preview.sessions.length} 个对话
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <FormatIcon format={preview.result.format} />
                        <span className="text-xs text-text-muted">
                          格式：{preview.result.format.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={resetState}
                      className="px-3 py-1 rounded-full bg-secondary text-xs font-bold text-text-muted hover:text-text-main transition-colors"
                    >
                      重新选择
                    </button>
                  </div>

                  {/* 警告 */}
                  {preview.result.warnings.length > 0 && (
                    <div className="p-3 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
                      {preview.result.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
                          <AlertTriangle size={12} /> {w}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* 去重提示 */}
                  {preview.duplicates.length > 0 && (
                    <div className="p-3 rounded-2xl bg-orange-500/10 border border-orange-500/20">
                      <p className="text-xs font-bold text-orange-600 dark:text-orange-400 flex items-center gap-2 mb-1">
                        <AlertTriangle size={12} />
                        发现 {preview.duplicates.length} 个可能已导入的对话
                      </p>
                      <p className="text-xs text-orange-600/70 dark:text-orange-400/70">
                        这些对话的内容指纹与已有对话匹配。你仍然可以导入，不会覆盖已有对话。
                      </p>
                    </div>
                  )}

                  {/* 对话列表预览 */}
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {preview.sessions.map((session, index) => {
                      const isDuplicate = preview.duplicates.some(d => d.session === session);
                      const firstMsg = session.messages[0];
                      return (
                        <div
                          key={index}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-xl border transition-colors",
                            isDuplicate
                              ? "border-orange-500/20 bg-orange-500/5"
                              : "border-border-main bg-secondary"
                          )}
                        >
                          <MessageSquare size={16} className="text-text-muted mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-text-main truncate">
                              {session.title}
                              {isDuplicate && (
                                <span className="ml-2 text-[10px] text-orange-500 font-bold">可能重复</span>
                              )}
                            </p>
                            <p className="text-xs text-text-muted truncate mt-0.5">
                              {session.messages.length} 轮对话
                              {firstMsg && ` · "${firstMsg.text.slice(0, 60)}${firstMsg.text.length > 60 ? '...' : ''}"`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 导入按钮 */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => handleImport(false)}
                      disabled={isImporting}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary border border-border-main font-bold text-sm text-text-main hover:bg-tertiary transition-all disabled:opacity-50 shadow-sm"
                    >
                      {isImporting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <MessageSquare size={16} />
                      )}
                      仅导入为对话
                    </button>
                    <button
                      onClick={() => handleImport(true)}
                      disabled={isImporting}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-all disabled:opacity-50 shadow-lg shadow-accent/20"
                    >
                      {isImporting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      导入并提炼知识
                    </button>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
