import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, RotateCcw, Brain, ChevronRight, Trophy, Network } from 'lucide-react';
import { Flashcard, Note } from '../types';
import { cn } from '../lib/utils';
import { schedule, Rating, predictNextReview, getIntervalString } from '../services/maimemo';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import MiniGraph from './MiniGraph';

interface ReviewViewProps {
  key?: string;
  flashcards: Flashcard[];
  notes: Note[];
  onBackToDashboard?: () => void;
  onReview?: (card: Flashcard, rating: Rating) => void;
}

export default function ReviewView({ flashcards, notes, onBackToDashboard, onReview }: ReviewViewProps) {
  const dueCards = flashcards.filter(c => c.nextReview <= Date.now());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const currentCard = dueCards[currentIndex];

  const handleReview = (rating: Rating) => {
    if (!currentCard) return;

    const card = dueCards[currentIndex];
    if (!card) return;

    onReview?.(card, rating);

    if (currentIndex >= dueCards.length - 1) {
      setIsFinished(true);
    } else {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  };

  if (dueCards.length === 0 || isFinished || !currentCard) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-3xl bg-green-500/20 flex items-center justify-center mb-6"
        >
          <Trophy className="w-10 h-10 text-green-500" />
        </motion.div>
        <h2 className="text-3xl font-bold mb-2">今日复习已完成</h2>
        <p className="text-white/40 max-w-xs mx-auto">
          你今天成功抵御了遗忘熵。你的长期记忆正在得到强化。
        </p>
        <button 
          onClick={() => { 
            setIsFinished(false); 
            setCurrentIndex(0); 
            onBackToDashboard?.();
          }}
          className="mt-8 px-8 py-3 bg-secondary hover:bg-tertiary rounded-full font-bold text-sm transition-all text-text-main shadow-sm"
        >
          返回仪表盘
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full p-6">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-text-main">主动召回</h2>
          <p className="text-sm text-text-muted">今天需要强化 {dueCards.length} 个概念。</p>
        </div>
        <div className="px-3 py-1 rounded-full bg-secondary border border-border-main text-[10px] font-bold uppercase tracking-widest text-text-sub shadow-sm">
          {currentIndex + 1} / {dueCards.length}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center perspective-1000 relative p-4">
        {/* Immersive Background Graph */}
        <div className="absolute inset-0 flex items-center justify-center -z-10 pointer-events-none opacity-20 md:opacity-40">
          <MiniGraph notes={notes} flashcards={flashcards} activeNoteId={currentCard.noteId} />
        </div>

        <motion.div
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
          className="relative w-full max-w-md aspect-[3/4] md:aspect-[4/3] cursor-pointer preserve-3d"
          onClick={() => setIsFlipped(!isFlipped)}
        >
          {/* Front */}
          <div className="absolute inset-0 bg-card border border-border-main rounded-[24px] md:rounded-[32px] p-8 md:p-12 flex flex-col items-center justify-center text-center backface-hidden shadow-2xl">
            <div className="absolute top-6 left-6 md:top-8 md:left-8 text-[10px] uppercase tracking-[0.2em] font-black text-accent opacity-50">问题</div>
            <div className="text-xl md:text-2xl font-medium leading-relaxed text-text-main MarkdownCardWrapper">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, {
                macros: {
                  '\\xlongequal': '\\stackrel\\text{#1}\\Longequal\\!\\!\\!\\!\\!\\!=',
                  '\\Longequal': '\\Relbar',
                },
                strict: false,
                trust: true,
              }]]}>
                {currentCard.question}
              </ReactMarkdown>
            </div>
            <div className="absolute bottom-6 md:bottom-8 text-[10px] md:text-xs text-text-muted font-bold uppercase tracking-widest animate-pulse">点击显示答案</div>
          </div>

          {/* Back */}
          <div className="absolute inset-0 bg-card border border-accent/30 rounded-[24px] md:rounded-[32px] p-8 md:p-12 flex flex-col items-center justify-center text-center backface-hidden shadow-2xl [transform:rotateY(180deg)]">
            <div className="absolute top-6 left-6 md:top-8 md:left-8 text-[10px] uppercase tracking-[0.2em] font-black text-green-500/50">答案</div>
            <div className="text-lg md:text-xl text-text-sub leading-relaxed MarkdownCardWrapper">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, {
                macros: {
                  '\\xlongequal': '\\stackrel\\text{#1}\\Longequal\\!\\!\\!\\!\\!\\!=',
                  '\\Longequal': '\\Relbar',
                },
                strict: false,
                trust: true,
              }]]}>
                {currentCard.answer}
              </ReactMarkdown>
            </div>
          </div>
        </motion.div>

        <AnimatePresence>
          {isFlipped && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-8 md:mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 w-full max-w-md"
            >
              <RatingButton 
                label="重来" 
                color="bg-red-500" 
                onClick={() => handleReview(Rating.Again)} 
                nextReview={predictNextReview(currentCard, Rating.Again)}
              />
              <RatingButton 
                label="困难" 
                color="bg-orange-500" 
                onClick={() => handleReview(Rating.Hard)} 
                nextReview={predictNextReview(currentCard, Rating.Hard)}
              />
              <RatingButton 
                label="良好" 
                color="bg-blue-500" 
                onClick={() => handleReview(Rating.Good)} 
                nextReview={predictNextReview(currentCard, Rating.Good)}
              />
              <RatingButton 
                label="简单" 
                color="bg-green-500" 
                onClick={() => handleReview(Rating.Easy)} 
                nextReview={predictNextReview(currentCard, Rating.Easy)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function RatingButton({ label, color, onClick, nextReview }: { label: string; color: string; onClick: () => void; nextReview: number }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "flex flex-col items-center gap-2 p-4 rounded-2xl transition-all hover:scale-105 active:scale-95 bg-secondary hover:bg-tertiary border border-border-main shadow-sm",
      )}
    >
      <div className={cn("w-3 h-3 rounded-full", color)} />
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-main">{label}</span>
      <span className="text-[8px] text-text-muted font-medium">{getIntervalString(nextReview)}</span>
    </button>
  );
}
