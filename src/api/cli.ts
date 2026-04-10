import { Router } from 'express';
import { flashcardRepo } from '../repositories/flashcard.repo';
import { requireAuth } from '../api/auth-middleware';

const router = Router();

/**
 * GET /api/cli/reviews/due
 * 
 * Returns flashcards due for review today.
 * Used by OpenClaw and other CLI tools for polling.
 * 
 * Headers:
 *   X-API-Key: <api_key>
 * 
 * Response:
 *   {
 *     "count": 5,
 *     "cards": [
 *       {
 *         "id": "card_xxx",
 *         "question": "...",
 *         "answer": "...",
 *         "difficulty": "medium",
 *         "next_review": "2026-03-31T09:00:00Z"
 *       }
 *     ],
 *     "next_check": "2026-03-31T09:00:00Z"
 *   }
 */
router.get('/reviews/due', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const cards = await flashcardRepo.findDueForReview(userId, new Date());

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    res.json({
      count: cards.length,
      cards: cards.map(card => ({
        id: card.id,
        question: card.question,
        answer: card.answer,
        difficulty: getDifficultyLabel(card.difficulty),
        next_review: new Date(card.due).toISOString(),
      })),
      next_check: tomorrow.toISOString(),
    });
  } catch (error) {
    console.error('Error fetching due reviews:', error);
    res.status(500).json({ 
      error: 'Failed to fetch reviews',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

function getDifficultyLabel(difficulty: number): string {
  if (difficulty <= 3) return 'easy';
  if (difficulty <= 7) return 'medium';
  return 'hard';
}

export default router;
