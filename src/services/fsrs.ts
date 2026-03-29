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

  // 计算复习间隔（天数）
  // 对于新卡片，使用更合理的初始间隔
  // Again: 10分钟后复习, Hard: 1天后, Good: 3天后, Easy: 7天后
  let intervalDays: number;
  if (card.state === 0) {
    // 新卡片的初始间隔（更符合实际学习场景）
    const initialIntervals = {
      [Rating.Again]: 0.01,  // 10分钟（约0.01天）
      [Rating.Hard]: 1,      // 1天
      [Rating.Good]: 3,      // 3天
      [Rating.Easy]: 7,      // 7天
    };
    intervalDays = initialIntervals[rating];
  } else {
    // 已学习过的卡片，基于稳定性计算
    // 90%保留率对应的间隔 ≈ stability
    intervalDays = rating === Rating.Easy ? s * 1.3 : s;
    // 确保最小间隔为1天（Again除外）
    if (rating !== Rating.Again) {
      intervalDays = Math.max(1, intervalDays);
    }
  }

  newCard.nextReview = now + intervalDays * 24 * 60 * 60 * 1000;

  return newCard;
}

export function predictNextReview(card: Flashcard, rating: Rating): number {
  const newCard = schedule(card, rating);
  return newCard.nextReview;
}

export function getIntervalString(nextReview: number): string {
  const diff = nextReview - Date.now();
  const minutes = Math.round(diff / (1000 * 60));
  const hours = Math.round(diff / (1000 * 60 * 60));
  const days = Math.round(diff / (1000 * 60 * 60 * 24));

  if (minutes <= 0) return "立即";
  if (minutes < 60) return `${minutes}分钟后`;
  if (hours < 24) return `${hours}小时后`;
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
