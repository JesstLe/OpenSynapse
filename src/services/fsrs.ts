import { Flashcard } from '../types';

// FSRS v4.5 parameters (default)
const w = [
  0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34,
  1.26, 0.29, 2.61,
];

export enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export function schedule(card: Flashcard, rating: Rating): Flashcard {
  const newCard = { ...card };
  const now = Date.now();
  const elapsedDays = card.lastReview === 0 ? 0 : (now - card.lastReview) / (1000 * 60 * 60 * 24);

  let s = card.stability;
  let d = card.difficulty;
  let r = 0;

  if (card.state === 0) { // New
    s = initStability(rating);
    d = initDifficulty(rating);
    newCard.state = rating === Rating.Easy ? 2 : 1;
  } else {
    r = Math.pow(0.9, elapsedDays / s);
    s = nextStability(s, d, r, rating, card.state);
    d = nextDifficulty(d, rating);
    
    if (rating === Rating.Again) {
      newCard.state = 3;
    } else if (newCard.state === 1 || newCard.state === 3) {
      newCard.state = 2;
    }
  }

  newCard.stability = s;
  newCard.difficulty = d;
  newCard.lastReview = now;
  newCard.repetitions += 1;
  
  const interval = Math.max(1, Math.round(s * Math.log(0.9) / Math.log(0.9))); // Simplified interval
  // Actually interval = s * (1/0.9 - 1) * 9 is a common approximation for 90% retention
  const actualInterval = rating === Rating.Easy ? s * 1.3 : s;
  
  newCard.nextReview = now + Math.max(1, Math.round(actualInterval)) * 24 * 60 * 60 * 1000;

  return newCard;
}

export function predictNextReview(card: Flashcard, rating: Rating): number {
  const newCard = schedule(card, rating);
  return newCard.nextReview;
}

export function getIntervalString(nextReview: number): string {
  const diff = nextReview - Date.now();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "1天内";
  if (days < 30) return `${days}天后`;
  if (days < 365) return `${Math.round(days / 30)}个月后`;
  return `${Math.round(days / 365)}年后`;
}

function initStability(rating: Rating): number {
  return Math.max(0.1, w[rating - 1]);
}

function initDifficulty(rating: Rating): number {
  return Math.min(Math.max(w[4] - w[5] * (rating - 3), 1), 10);
}

function nextDifficulty(d: number, rating: Rating): number {
  const nextD = d - w[6] * (rating - 3);
  return Math.min(Math.max(meanReversion(w[4], nextD), 1), 10);
}

function meanReversion(init: number, current: number): number {
  return 0.05 * init + 0.95 * current;
}

function nextStability(s: number, d: number, r: number, rating: Rating, state: number): number {
  if (rating === Rating.Again) {
    return Math.min(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)), s);
  }
  
  const hardPenalty = rating === Rating.Hard ? w[15] : 1;
  const easyBonus = rating === Rating.Easy ? w[16] : 1;
  
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hardPenalty * easyBonus);
}
