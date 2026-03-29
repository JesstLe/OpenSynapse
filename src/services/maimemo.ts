import { Flashcard } from '../types';
import { generateUUID } from '../lib/utils';

/**
 * MaiMemo (墨墨背单词) Spaced Repetition Algorithm
 * 
 * Based on:
 * - "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling" (ACM KDD 2022)
 * - "Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory" (IEEE TKDE)
 * 
 * GitHub: https://github.com/maimemo/SSP-MMC
 * 
 * Core Concepts:
 * - Half-life (h): Time for retention probability to drop to 50%
 * - Difficulty (d): 1-18, represents card difficulty
 * - Retention probability: p = 2^(-interval / halflife)
 */

export enum Rating {
  Again = 1,  // 忘记/重来
  Hard = 2,   // 困难
  Good = 3,   // 良好
  Easy = 4,   // 简单
}

// Card state
export enum CardState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

// Algorithm constants from SSP-MMC paper
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 18;
const DEFAULT_DIFFICULTY = 5;

/**
 * Calculate initial half-life based on difficulty
 * Formula: h0 = -1 / log2(max(0.925 - 0.05 * d, 0.025))
 */
function calStartHalflife(difficulty: number): number {
  const p = Math.max(0.925 - 0.05 * difficulty, 0.025);
  return -1 / Math.log2(p);
}

/**
 * Calculate retention probability based on half-life and interval
 * Formula: p = 2^(-interval / halflife)
 */
function calRetentionProbability(halflife: number, interval: number): number {
  return Math.pow(2, -interval / halflife);
}

/**
 * Calculate new half-life after successful recall
 * Formula: h_new = h * (1 + exp(3.81) * d^(-0.534) * h^(-0.127) * (1-p)^0.97)
 */
function calNextRecallHalflife(h: number, p: number, d: number): number {
  const factor = 1 + Math.exp(3.81) * Math.pow(d, -0.534) * Math.pow(h, -0.127) * Math.pow(1 - p, 0.97);
  return h * factor;
}

/**
 * Calculate new half-life after forgetting
 * Formula: h_new = exp(-0.041) * d^(-0.041) * h^0.377 * (1-p)^(-0.227)
 */
function calNextForgetHalflife(h: number, p: number, d: number): number {
  return Math.exp(-0.041) * Math.pow(d, -0.041) * Math.pow(h, 0.377) * Math.pow(1 - p, -0.227);
}

/**
 * Convert rating to difficulty adjustment
 * - Again: increase difficulty
 * - Hard: slight increase
 * - Good: maintain
 * - Easy: decrease difficulty
 */
function adjustDifficulty(currentD: number, rating: Rating): number {
  let adjustment = 0;
  switch (rating) {
    case Rating.Again:
      adjustment = 2;
      break;
    case Rating.Hard:
      adjustment = 1;
      break;
    case Rating.Good:
      adjustment = 0;
      break;
    case Rating.Easy:
      adjustment = -1;
      break;
  }
  return Math.min(Math.max(currentD + adjustment, DIFFICULTY_MIN), DIFFICULTY_MAX);
}

/**
 * Schedule a flashcard based on user rating
 * This is the main scheduling function
 */
export function schedule(card: Flashcard, rating: Rating): Flashcard {
  const newCard = { ...card };
  const now = Date.now();
  
  // Calculate elapsed days since last review
  const elapsedDays = card.lastReview === 0 
    ? 0 
    : (now - card.lastReview) / (1000 * 60 * 60 * 24);
  
  // Initialize difficulty if new card
  let difficulty = card.difficulty || DEFAULT_DIFFICULTY;
  
  let halflife = card.halflife && card.halflife > 0
    ? card.halflife
    : (card.stability > 0 ? card.stability : calStartHalflife(difficulty));
  
  // Calculate current retention probability
  const pRecall = calRetentionProbability(halflife, elapsedDays);
  
  // Update state and halflife based on rating
  if (card.state === CardState.New) {
    // New card: initialize based on first rating
    if (rating === Rating.Easy) {
      newCard.state = CardState.Review;
      halflife = calStartHalflife(difficulty) * 1.5;
    } else {
      newCard.state = CardState.Learning;
      halflife = calStartHalflife(difficulty);
    }
  } else {
    // Existing card
    switch (rating) {
      case Rating.Again:
        // Forgotten - enter relearning state
        newCard.state = CardState.Relearning;
        halflife = calNextForgetHalflife(halflife, pRecall, difficulty);
        difficulty = adjustDifficulty(difficulty, rating);
        break;
        
      case Rating.Hard:
      case Rating.Good:
      case Rating.Easy:
        // Remembered - update halflife and possibly graduate
        halflife = calNextRecallHalflife(halflife, pRecall, difficulty);
        difficulty = adjustDifficulty(difficulty, rating);
        
        if (newCard.state === CardState.Learning || newCard.state === CardState.Relearning) {
          // Graduate from learning/relearning to review
          if (rating === Rating.Good || rating === Rating.Easy) {
            newCard.state = CardState.Review;
          }
        }
        break;
    }
  }
  
  // Calculate next review interval based on halflife
  // Use a fraction of halflife to ensure high retention rate (default 90%)
  const targetRetention = 0.9;
  const intervalDays = Math.max(1, Math.round(halflife * Math.log(targetRetention) / Math.log(0.5)));
  
  // Apply rating-based interval modifiers
  let finalInterval = intervalDays;
  switch (rating) {
    case Rating.Again:
      finalInterval = 1; // Review again tomorrow
      break;
    case Rating.Hard:
      finalInterval = Math.max(1, Math.round(intervalDays * 0.8));
      break;
    case Rating.Good:
      finalInterval = intervalDays;
      break;
    case Rating.Easy:
      finalInterval = Math.round(intervalDays * 1.3);
      break;
  }
  
  // Update card properties
  newCard.difficulty = difficulty;
  newCard.halflife = halflife;
  newCard.stability = halflife; // Maintain compatibility
  newCard.lastReview = now;
  newCard.repetitions += 1;
  newCard.nextReview = now + finalInterval * 24 * 60 * 60 * 1000;
  
  return newCard;
}

/**
 * Predict next review time for display purposes
 */
export function predictNextReview(card: Flashcard, rating: Rating): number {
  const scheduledCard = schedule(card, rating);
  return scheduledCard.nextReview;
}

/**
 * Convert interval to human-readable string
 */
export function getIntervalString(nextReview: number): string {
  const diff = nextReview - Date.now();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  
  if (days <= 0) return "< 1天";
  if (days === 1) return "1天后";
  if (days < 30) return `${days}天后`;
  if (days < 365) return `${Math.round(days / 30)}个月后`;
  return `${Math.round(days / 365)}年后`;
}

/**
 * Get retention probability for a card at current time
 */
export function getCurrentRetention(card: Flashcard): number {
  if (!card.halflife || card.halflife <= 0) {
    return 1.0; // New card
  }
  
  const elapsedDays = card.lastReview === 0 
    ? 0 
    : (Date.now() - card.lastReview) / (1000 * 60 * 60 * 24);
  
  return calRetentionProbability(card.halflife, elapsedDays);
}

/**
 * Initialize a new flashcard with MaiMemo algorithm
 */
export function initializeCard(card: Partial<Flashcard>): Flashcard {
  const difficulty = card.difficulty || DEFAULT_DIFFICULTY;
  const halflife = calStartHalflife(difficulty);
  
  return {
    id: card.id || generateUUID(),
    noteId: card.noteId || '',
    question: card.question || '',
    answer: card.answer || '',
    difficulty,
    stability: halflife,
    halflife,
    state: CardState.New,
    lastReview: 0,
    nextReview: Date.now(),
    repetitions: 0,
    userId: card.userId || '',
  };
}
