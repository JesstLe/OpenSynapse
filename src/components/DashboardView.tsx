import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeKnowledgeGaps } from '../services/gemini';
import { Brain, Zap, TrendingUp, CheckCircle2, AlertCircle, Calendar, Download, Loader2, BrainCircuit } from 'lucide-react';
import { Note, Flashcard, ChatSession } from '../types';
import { cn } from '../lib/utils';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface DashboardViewProps {
  notes: Note[];
  flashcards: Flashcard[];
  chatSessions: ChatSession[];
  onStartBreakthrough: (tag: string, weakPoints: string[]) => void;
}

export default function DashboardView({ notes, flashcards, chatSessions, onStartBreakthrough }: DashboardViewProps) {
  const [isExporting, setIsExporting] = React.useState(false);
  const [analyzingTag, setAnalyzingTag] = React.useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = React.useState<{ date: Date, count: number, dateStr: string, x: number, y: number } | null>(null);
  const activityCardRef = React.useRef<HTMLDivElement | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("synapse-export");
      
      notes.forEach(note => {
        const relatedTitles = note.relatedIds
          .map(id => notes.find(n => n.id === id)?.title)
          .filter(Boolean);

        const markdown = `---
title: ${note.title}
created: ${new Date(note.createdAt).toISOString()}
tags: ${note.tags.join(', ')}
---

# ${note.title}

> ${note.summary}

## 深度解析
${note.content}

${note.codeSnippet ? `## 核心实现\n\`\`\`cpp\n${note.codeSnippet}\n\`\`\`` : ''}

## 语义连接
${relatedTitles.map(t => `- [[${t}]]`).join('\n')}

## 关联闪卡
${flashcards
  .filter(f => f.noteId === note.id)
  .map(f => `### Q: ${f.question}\nA: ${f.answer}\n(Difficulty: ${f.difficulty.toFixed(2)})`)
  .join('\n\n')}
`;
        folder?.file(`${note.title.replace(/[/\\?%*:|"<>]/g, '-')}.md`, markdown);
      });

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `synapse-backup-${new Date().toISOString().split('T')[0]}.zip`);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  // 1. Knowledge Growth Data
  const growthData = React.useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    return last7Days.map(date => ({
      date: date.slice(5),
      count: notes.filter(n => {
        const noteDate = new Date(n.createdAt).toISOString().split('T')[0];
        return noteDate <= date;
      }).length
    }));
  }, [notes]);

  // 2. Review Performance
  const reviewStats = React.useMemo(() => {
    const total = flashcards.length;
    const due = flashcards.filter(c => c.nextReview <= Date.now()).length;
    const learned = flashcards.filter(c => c.state > 0).length;
    
    const avgDifficulty = flashcards.length > 0 
      ? flashcards.reduce((acc, c) => acc + c.difficulty, 0) / flashcards.length 
      : 0;
    const load = Math.min(100, Math.round((due * (avgDifficulty || 5)) / 2));

    return { total, due, learned, load, avgDifficulty };
  }, [flashcards]);

  // 3. Difficulty Distribution
  const difficultyData = React.useMemo(() => {
    const dist = [0, 0, 0, 0, 0];
    flashcards.forEach(c => {
      const idx = Math.min(4, Math.floor((c.difficulty - 1) / 2));
      if (idx >= 0) dist[idx]++;
    });
    return [
      { name: '极易', value: dist[0], color: '#22c55e' },
      { name: '容易', value: dist[1], color: '#84cc16' },
      { name: '适中', value: dist[2], color: '#eab308' },
      { name: '困难', value: dist[3], color: '#f97316' },
      { name: '极难', value: dist[4], color: '#ef4444' },
    ];
  }, [flashcards]);

  // 4. Knowledge Gap Analysis
  const knowledgeGaps = React.useMemo(() => {
    const tagStats: Record<string, { count: number; totalDifficulty: number; dueCount: number; failedCards: Flashcard[] }> = {};
    
    flashcards.forEach(c => {
      const note = notes.find(n => n.id === c.noteId);
      if (note) {
        note.tags.forEach(tag => {
          if (!tagStats[tag]) tagStats[tag] = { count: 0, totalDifficulty: 0, dueCount: 0, failedCards: [] };
          tagStats[tag].count++;
          tagStats[tag].totalDifficulty += c.difficulty;
          if (c.nextReview <= Date.now()) tagStats[tag].dueCount++;
          if (c.difficulty > 7 || c.state === 3) {
            tagStats[tag].failedCards.push(c);
          }
        });
      }
    });

    return Object.entries(tagStats)
      .map(([tag, stats]) => ({
        tag,
        avgDifficulty: stats.totalDifficulty / stats.count,
        dueCount: stats.dueCount,
        score: (stats.totalDifficulty / stats.count) * (stats.dueCount + 1),
        failedCards: stats.failedCards.slice(0, 5)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [flashcards, notes]);

  // 5. Activity Calendar Logic (Last 12 weeks)
  const activityData = React.useMemo(() => {
    const data: Record<string, number> = {};
    const processDate = (ts: number | string | undefined) => {
      if (!ts) return;
      const d = new Date(ts).toISOString().split('T')[0];
      data[d] = (data[d] || 0) + 1;
    };
    
    notes.forEach(n => processDate(n.createdAt));
    chatSessions.forEach(s => processDate(s.updatedAt));
    flashcards.filter(f => f.lastReview > 0).forEach(f => processDate(f.lastReview));
    
    return data;
  }, [notes, flashcards, chatSessions]);

  const activityCalendar = React.useMemo(() => {
    const weeks: { date: Date; count: number; dateStr: string }[][] = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 11 * 7); // Show 12 weeks including current
    startDate.setDate(startDate.getDate() - startDate.getDay());

    for (let w = 0; w < 12; w++) {
      const week: { date: Date; count: number; dateStr: string }[] = [];
      for (let d = 0; d < 7; d++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + w * 7 + d);
        const dateStr = currentDate.toISOString().split('T')[0];
        week.push({
          date: currentDate,
          count: activityData[dateStr] || 0,
          dateStr,
        });
      }
      weeks.push(week);
    }
    return weeks;
  }, [activityData]);

  const handleStartBreakthroughWithAnalysis = async (tag: string, cards: Flashcard[]) => {
    setAnalyzingTag(tag);
    try {
      let weakPoints = ["概念理解", "底层原理"];
      if (cards.length > 0) {
        weakPoints = await analyzeKnowledgeGaps(tag, cards);
      }
      onStartBreakthrough(tag, weakPoints);
    } catch (error) {
      console.error("Gap analysis failed:", error);
      onStartBreakthrough(tag, ["概念理解", "底层原理"]);
    } finally {
      setAnalyzingTag(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 max-w-6xl mx-auto w-full space-y-6 scrollbar-hide">
      <header className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-text-main">Synapse 突触</h2>
          <p className="text-xs md:text-sm text-text-muted">实时监控你的知识网络与大脑负荷。</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || notes.length === 0}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-secondary border border-border-main rounded-2xl text-sm font-bold hover:bg-tertiary transition-all disabled:opacity-50 disabled:cursor-not-allowed text-text-main shadow-sm"
        >
          {isExporting ? (
            <Loader2 size={18} className="animate-spin text-accent" />
          ) : (
            <Download size={18} className="text-accent" />
          )}
          导出全部资产
        </button>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={<TrendingUp className="text-blue-500" />} 
          label="知识资产" 
          value={notes.length} 
          subLabel="总笔记数" 
        />
        <StatCard 
          icon={<Brain className="text-purple-500" />} 
          label="记忆颗粒" 
          value={flashcards.length} 
          subLabel="总闪卡数" 
        />
        <StatCard 
          icon={<Zap className="text-yellow-500" />} 
          label="平均难度" 
          value={reviewStats.avgDifficulty.toFixed(1)} 
          subLabel="全库认知负荷" 
        />
        <StatCard 
          icon={<AlertCircle className="text-orange-500" />} 
          label="待处理" 
          value={reviewStats.due} 
          subLabel="今日到期复习" 
        />
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Knowledge Growth Chart */}
        <div className="lg:col-span-2 bg-card border border-border-main rounded-[24px] md:rounded-[32px] p-4 md:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-base md:text-lg flex items-center gap-2 text-text-main">
              <TrendingUp size={18} className="text-blue-500" />
              知识增长曲线
            </h3>
            <span className="text-[8px] md:text-[10px] uppercase tracking-widest text-text-muted font-black">近 7 日累计</span>
          </div>
          <div className="h-[200px] md:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-[0.05]" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'currentColor', fontSize: 10, opacity: 0.4 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'currentColor', fontSize: 10, opacity: 0.4 }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-primary)' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cognitive Load Indicator */}
        <div className="bg-card border border-border-main rounded-[24px] md:rounded-[32px] p-6 md:p-8 flex flex-col items-center justify-start text-center shadow-sm gap-6">
          <div className="w-full">
            <h3 className="font-bold text-base md:text-lg mb-1 text-text-main">认知负荷</h3>
            <p className="text-[10px] md:text-xs text-text-muted font-medium">当前大脑处理压力</p>
          </div>
          
          <div className="relative w-32 h-32 md:w-48 md:h-48 flex items-center justify-center shrink-0">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx={window.innerWidth < 768 ? "64" : "96"}
                cy={window.innerWidth < 768 ? "64" : "96"}
                r={window.innerWidth < 768 ? "54" : "80"}
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                className="opacity-5"
              />
              <circle
                cx={window.innerWidth < 768 ? "64" : "96"}
                cy={window.innerWidth < 768 ? "64" : "96"}
                r={window.innerWidth < 768 ? "54" : "80"}
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={window.innerWidth < 768 ? 339.12 : 502.4}
                strokeDashoffset={(window.innerWidth < 768 ? 339.12 : 502.4) - ((window.innerWidth < 768 ? 339.12 : 502.4) * reviewStats.load) / 100}
                className={cn(
                  "transition-all duration-1000 ease-out",
                  reviewStats.load > 80 ? "text-red-500" : reviewStats.load > 50 ? "text-orange-500" : "text-green-500"
                )}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl md:text-4xl font-black text-text-main">{reviewStats.load}%</span>
              <span className="text-[8px] md:text-[10px] uppercase tracking-widest font-bold text-text-muted mt-1">
                {reviewStats.load > 80 ? '极高负荷' : reviewStats.load > 50 ? '中等负荷' : '低负荷'}
              </span>
            </div>
          </div>

          <div className="w-full space-y-4">
            <div className="text-left">
              <div className="text-[10px] text-text-muted uppercase font-black mb-3 tracking-widest opacity-60">知识薄弱点 (Gap)</div>
              <div className="space-y-2">
                {knowledgeGaps.length === 0 ? (
                  <div className="text-xs text-text-muted italic opacity-50 text-center py-4">暂无明显薄弱环节</div>
                ) : (
                  knowledgeGaps.map(gap => (
                    <div key={gap.tag} className="group/gap flex flex-col p-3 rounded-2xl bg-secondary border border-border-main hocus:border-accent/30 transition-all shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-accent/80">#{gap.tag}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted opacity-60 font-bold uppercase tracking-wider">难度 {gap.avgDifficulty.toFixed(1)}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleStartBreakthroughWithAnalysis(gap.tag, gap.failedCards)}
                        disabled={analyzingTag !== null}
                        className="w-full py-2 rounded-xl bg-accent/10 text-accent text-[10px] font-bold uppercase tracking-widest hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {analyzingTag === gap.tag ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <BrainCircuit size={12} />
                        )}
                        {analyzingTag === gap.tag ? '正在诊断认知断层...' : '专项攻坚'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Difficulty Distribution Chart */}
        <div className="bg-card border border-border-main rounded-[24px] md:rounded-[32px] p-6 md:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-base md:text-lg flex items-center gap-2">
              <Zap size={18} className="text-yellow-500" />
              知识难度分布
            </h3>
          </div>
          <div className="h-[200px] md:h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={difficultyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-[0.05]" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'currentColor', fontSize: 10, opacity: 0.4 }} 
                />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: 'currentColor', opacity: 0.05 }}
                  contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-primary)' }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {difficultyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.6} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Learning Activity (GitHub Style) */}
        <div ref={activityCardRef} className="bg-card border border-border-main rounded-[24px] md:rounded-[32px] p-6 md:p-8 shadow-sm relative activity-chart-container">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-base md:text-lg flex items-center gap-2 text-text-main">
              <Calendar size={18} className="text-green-500" />
              学习活跃度
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-text-muted font-bold uppercase tracking-widest opacity-60">
              <span>较少</span>
              <div className="flex gap-1">
                <div className="w-2.5 h-2.5 rounded-[2px] bg-secondary" />
                <div className="w-2.5 h-2.5 rounded-[2px] bg-green-500/20" />
                <div className="w-2.5 h-2.5 rounded-[2px] bg-green-500/40" />
                <div className="w-2.5 h-2.5 rounded-[2px] bg-green-500/60" />
                <div className="w-2.5 h-2.5 rounded-[2px] bg-green-500/80" />
              </div>
              <span>较多</span>
            </div>
          </div>
          
          <div className="flex gap-3">
            {/* Day Labels */}
            <div className="grid grid-rows-7 gap-1 md:gap-2 text-[8px] font-black text-text-muted uppercase pt-5">
              <div className="h-2.5 md:h-3"></div>
              <div className="h-2.5 md:h-3">周一</div>
              <div className="h-2.5 md:h-3"></div>
              <div className="h-2.5 md:h-3">周三</div>
              <div className="h-2.5 md:h-3"></div>
              <div className="h-2.5 md:h-3">周五</div>
              <div className="h-2.5 md:h-3"></div>
            </div>
            
            <div className="flex-1 overflow-x-auto scrollbar-hide" onMouseLeave={() => setHoveredDay(null)}>
              {/* Month Labels */}
              <div className="flex mb-2 text-[8px] font-black text-text-muted uppercase">
                {activityCalendar.map((week, i) => {
                  const firstDay = week[0].date;
                  const prevWeekMonth = i > 0 ? activityCalendar[i-1][0].date.getMonth() : -1;
                  const showMonth = i === 0 || firstDay.getMonth() !== prevWeekMonth;
                  return (
                    <div key={i} className="flex-1 min-w-[14px]">
                      {showMonth ? firstDay.toLocaleString('zh-CN', { month: 'short' }) : ''}
                    </div>
                  );
                })}
              </div>
              
              <div className="grid grid-flow-col grid-rows-7 gap-1 md:gap-2">
                {activityCalendar.map((week) => 
                  week.map((day) => {
                    const isToday = day.dateStr === new Date().toISOString().split('T')[0];
                    return (
                      <div 
                        key={day.dateStr} 
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const containerRect = activityCardRef.current?.getBoundingClientRect();
                          if (containerRect) {
                            const rawX = rect.left - containerRect.left + rect.width / 2;
                            const tooltipHalfWidth = window.innerWidth < 768 ? 76 : 120;
                            const clampedX = Math.min(
                              Math.max(rawX, tooltipHalfWidth),
                              containerRect.width - tooltipHalfWidth
                            );
                            setHoveredDay({
                              ...day,
                              x: clampedX,
                              y: rect.top - containerRect.top
                            });
                          }
                        }}
                        className={cn(
                          "aspect-square w-2.5 h-2.5 md:w-3 md:h-3 rounded-[2px] md:rounded-[3px] border border-border-main transition-all duration-300 hover:scale-125 hover:z-20 cursor-crosshair",
                          day.count === 0 ? "bg-secondary" :
                          day.count <= 2 ? "bg-green-500/20" :
                          day.count <= 5 ? "bg-green-500/40" :
                          day.count <= 10 ? "bg-green-500/60" : "bg-green-500/80",
                          isToday ? "border-accent ring-1 ring-accent/30 shadow-[0_0_8px_rgba(59,130,246,0.3)]" : "border-border-main"
                        )}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <AnimatePresence>
            {hoveredDay && (
              <motion.div
                initial={{ opacity: 0, y: 5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.95 }}
                className="absolute z-50 max-w-[152px] md:max-w-[240px] px-3 py-2 bg-text-main text-bg-card text-[10px] rounded-lg shadow-xl pointer-events-none text-center"
                style={{ 
                  left: hoveredDay.x, 
                  top: Math.max(12, hoveredDay.y - 12 - (window.innerWidth < 768 ? 40 : 50)),
                  transform: 'translateX(-50%)' 
                }}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-bold opacity-70">
                    {hoveredDay.date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
                  </span>
                  <span className="text-sm font-black italic">{hoveredDay.count} 次活跃轨迹</span>
                </div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-text-main rotate-45" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subLabel }: { icon: React.ReactNode; label: string; value: number | string; subLabel: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-card border border-border-main rounded-[24px] p-6 transition-all shadow-sm hover:border-accent/20"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-tertiary flex items-center justify-center">
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-widest font-black text-text-muted opacity-80">{label}</span>
      </div>
      <div className="text-3xl font-black mb-1 text-text-main">{value}</div>
      <div className="text-[10px] text-text-muted font-bold opacity-60">{subLabel}</div>
    </motion.div>
  );
}
