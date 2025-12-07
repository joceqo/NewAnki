/**
 * FSRS Scheduler - Practical Examples
 *
 * Real-world usage examples integrating with the database layer
 */

import { CardRepository } from '../database/repositories/CardRepository';
import { ReviewRepository } from '../database/repositories/ReviewRepository';
import { ReviewGrade, ReviewStats } from '../models/ReviewRecord';
import {
  fromReviewRecord,
  FSRSScheduler,
  toReviewRecordInput
} from './schedule';

// ============================================================================
// EXAMPLE 1: Review a card
// ============================================================================

/**
 * Complete workflow for reviewing a single card
 */
export async function reviewCard(
  cardId: string,
  grade: ReviewGrade,
  reviewDurationMs?: number
): Promise<{
  success: boolean;
  nextReview: Date;
  intervalDays: number;
  message: string;
}> {
  const scheduler = new FSRSScheduler();
  const reviewTime = Date.now();

  try {
    // 1. Get existing review record
    let reviewRecord = await ReviewRepository.findByCardId(cardId);

    // 2. Create record if this is the first review
    if (!reviewRecord) {
      await ReviewRepository.create({
        card_id: cardId,
        grade,
        review_duration_ms: reviewDurationMs,
      });
      reviewRecord = await ReviewRepository.findByCardId(cardId);
    }

    if (!reviewRecord) {
      throw new Error('Failed to create review record');
    }

    // 3. Convert database record to scheduling state
    const currentState = fromReviewRecord(reviewRecord);

    // 4. Calculate next state based on user's grade
    const nextState = scheduler.scheduleNextReview(currentState, grade, reviewTime);

    // 5. Convert to database input format
    const dbInput = toReviewRecordInput(nextState, grade, reviewDurationMs);

    // 6. Save to database
    await ReviewRepository.updateAfterReview(cardId, dbInput);

    // 7. Return result
    return {
      success: true,
      nextReview: new Date(nextState.nextDueDate),
      intervalDays: nextState.intervalDays,
      message: `Next review in ${nextState.intervalDays.toFixed(1)} days`,
    };
  } catch (error) {
    console.error('Error reviewing card:', error);
    return {
      success: false,
      nextReview: new Date(),
      intervalDays: 0,
      message: 'Failed to review card',
    };
  }
}

// ============================================================================
// EXAMPLE 2: Get due cards for a deck
// ============================================================================

/**
 * Get all cards that are due for review in a deck
 */
export async function getDueCardsForDeck(deckId: string) {
  try {
    // Use repository method to get due cards
    const dueCards = await CardRepository.findDueCards(deckId);

    return {
      cards: dueCards,
      count: dueCards.length,
      message: `${dueCards.length} cards ready to review`,
    };
  } catch (error) {
    console.error('Error getting due cards:', error);
    return {
      cards: [],
      count: 0,
      message: 'Failed to get due cards',
    };
  }
}

// ============================================================================
// EXAMPLE 3: Preview review outcomes
// ============================================================================

/**
 * Show what will happen for each possible grade
 * Useful for showing users before they rate a card
 */
export async function getReviewPreview(cardId: string) {
  const scheduler = new FSRSScheduler();

  try {
    // Get current review state
    const reviewRecord = await ReviewRepository.findByCardId(cardId);

    if (!reviewRecord) {
      // New card - show initial preview
      const newState = scheduler.scheduleNewCard();
      const preview = scheduler.getSchedulingPreview(newState);

      return {
        isNewCard: true,
        preview: {
          again: formatPreviewResult(preview.again),
          hard: formatPreviewResult(preview.hard),
          good: formatPreviewResult(preview.good),
          easy: formatPreviewResult(preview.easy),
        },
      };
    }

    // Existing card - show actual preview
    const currentState = fromReviewRecord(reviewRecord);
    const preview = scheduler.getSchedulingPreview(currentState);

    return {
      isNewCard: false,
      currentInterval: reviewRecord.intervalDays,
      preview: {
        again: formatPreviewResult(preview.again),
        hard: formatPreviewResult(preview.hard),
        good: formatPreviewResult(preview.good),
        easy: formatPreviewResult(preview.easy),
      },
    };
  } catch (error) {
    console.error('Error getting preview:', error);
    throw error;
  }
}

function formatPreviewResult(state: any) {
  return {
    intervalDays: parseFloat(state.intervalDays.toFixed(1)),
    nextReview: new Date(state.nextDueDate),
    stability: parseFloat(state.stability.toFixed(2)),
    difficulty: parseFloat(state.difficulty.toFixed(2)),
  };
}

// ============================================================================
// EXAMPLE 4: Study session
// ============================================================================

/**
 * Get cards for a study session with a limit
 */
export async function startStudySession(deckId: string, limit: number = 20) {
  try {
    // Get due cards
    const dueCards = await CardRepository.findDueCards(deckId);

    // Get new cards
    const newCards = await CardRepository.findNewCards(deckId);

    // Mix: prioritize due cards, then add new cards
    const sessionCards = [...dueCards.slice(0, limit)];

    if (sessionCards.length < limit) {
      const remaining = limit - sessionCards.length;
      sessionCards.push(...newCards.slice(0, remaining));
    }

    return {
      cards: sessionCards,
      totalDue: dueCards.length,
      totalNew: newCards.length,
      sessionSize: sessionCards.length,
      message: `${sessionCards.length} cards ready (${dueCards.length} due, ${newCards.length} new)`,
    };
  } catch (error) {
    console.error('Error starting study session:', error);
    return {
      cards: [],
      totalDue: 0,
      totalNew: 0,
      sessionSize: 0,
      message: 'Failed to start study session',
    };
  }
}

// ============================================================================
// EXAMPLE 5: Statistics and insights
// ============================================================================

/**
 * Get scheduling statistics for a deck
 */
export async function getDeckStatistics(deckId: string) {
  try {
    const stats = await ReviewRepository.getStats(deckId);

    return {
      ...stats,
      insights: generateInsights(stats),
    };
  } catch (error) {
    console.error('Error getting statistics:', error);
    throw error;
  }
}

function generateInsights(stats: ReviewStats) {
  const insights = [];

  if (stats.success_rate < 70) {
    insights.push({
      type: 'warning',
      message: 'Low success rate. Consider reviewing more frequently.',
    });
  }

  if (stats.success_rate > 95) {
    insights.push({
      type: 'success',
      message: 'High success rate! You can reduce review frequency.',
    });
  }

  if (stats.due_today > 50) {
    insights.push({
      type: 'info',
      message: 'Many cards due today. Consider breaking into multiple sessions.',
    });
  }

  if (stats.current_streak >= 7) {
    insights.push({
      type: 'achievement',
      message: `${stats.current_streak} day streak! Keep it up!`,
    });
  }

  return insights;
}

// ============================================================================
// EXAMPLE 6: Bulk operations
// ============================================================================

/**
 * Review multiple cards at once (batch operation)
 */
export async function reviewMultipleCards(
  reviews: { cardId: string; grade: ReviewGrade; durationMs?: number }[]
) {
  const results = [];

  for (const review of reviews) {
    try {
      const result = await reviewCard(review.cardId, review.grade, review.durationMs);
      results.push({ cardId: review.cardId, ...result });
    } catch {
      results.push({
        cardId: review.cardId,
        success: false,
        message: 'Failed to review',
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return {
    results,
    summary: {
      total: reviews.length,
      successful: successCount,
      failed: reviews.length - successCount,
    },
  };
}

// ============================================================================
// EXAMPLE 7: Compare FSRS vs SM-2
// ============================================================================

/**
 * Compare FSRS and SM-2 algorithms for a card
 * Useful for testing and analysis
 */
export async function compareAlgorithms(cardId: string, grade: ReviewGrade) {
  const fsrsScheduler = new FSRSScheduler({ enableFSRS: true });
  const sm2Scheduler = new FSRSScheduler({ enableFSRS: false });

  try {
    const reviewRecord = await ReviewRepository.findByCardId(cardId);

    if (!reviewRecord) {
      // New card comparison
      const fsrsState = fsrsScheduler.scheduleNewCard();
      const sm2State = sm2Scheduler.scheduleNewCard();

      const fsrsNext = fsrsScheduler.scheduleNextReview(fsrsState, grade);
      const sm2Next = sm2Scheduler.scheduleNextReview(sm2State, grade);

      return {
        fsrs: {
          intervalDays: fsrsNext.intervalDays,
          stability: fsrsNext.stability,
        },
        sm2: {
          intervalDays: sm2Next.intervalDays,
          easeFactor: sm2Next.easeFactor,
        },
        efficiency: {
          difference: fsrsNext.intervalDays - sm2Next.intervalDays,
          percentageGain: ((fsrsNext.intervalDays / sm2Next.intervalDays - 1) * 100).toFixed(1),
        },
      };
    }

    // Existing card comparison
    const currentState = fromReviewRecord(reviewRecord);

    const fsrsNext = fsrsScheduler.scheduleNextReview(currentState, grade);
    const sm2Next = sm2Scheduler.scheduleNextReview(currentState, grade);

    return {
      fsrs: {
        intervalDays: fsrsNext.intervalDays,
        stability: fsrsNext.stability,
        difficulty: fsrsNext.difficulty,
      },
      sm2: {
        intervalDays: sm2Next.intervalDays,
        easeFactor: sm2Next.easeFactor,
      },
      efficiency: {
        difference: fsrsNext.intervalDays - sm2Next.intervalDays,
        percentageGain: ((fsrsNext.intervalDays / sm2Next.intervalDays - 1) * 100).toFixed(1),
      },
    };
  } catch (error) {
    console.error('Error comparing algorithms:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 8: Custom scheduler configurations
// ============================================================================

/**
 * Create specialized schedulers for different use cases
 */
export const schedulerPresets = {
  /**
   * High-stakes studying (exams, certifications)
   * - Higher retention rate (95%)
   * - Shorter learning steps
   */
  exam: new FSRSScheduler({
    requestRetention: 0.95,
    learningSteps: [1, 5, 10],
    relearnSteps: [5, 10],
  }),

  /**
   * Language learning
   * - Balanced retention (90%)
   * - Gradual learning progression
   */
  language: new FSRSScheduler({
    requestRetention: 0.90,
    learningSteps: [1, 10, 30],
    relearnSteps: [10, 30],
  }),

  /**
   * Long-term knowledge retention
   * - Lower retention (85%)
   * - Longer intervals acceptable
   */
  longTerm: new FSRSScheduler({
    requestRetention: 0.85,
    maximumInterval: 365 * 5, // 5 years
  }),

  /**
   * Quick review (flashcards for fun)
   * - Minimal learning steps
   * - Lower retention acceptable
   */
  casual: new FSRSScheduler({
    requestRetention: 0.80,
    learningSteps: [1],
    relearnSteps: [1],
  }),
};

/**
 * Use a preset scheduler
 */
export async function reviewWithPreset(
  cardId: string,
  grade: ReviewGrade,
  preset: 'exam' | 'language' | 'longTerm' | 'casual'
) {
  const scheduler = schedulerPresets[preset];
  const reviewTime = Date.now();

  const reviewRecord = await ReviewRepository.findByCardId(cardId);

  if (!reviewRecord) {
    const newState = scheduler.scheduleNewCard();
    const nextState = scheduler.scheduleNextReview(newState, grade, reviewTime);
    return nextState;
  }

  const currentState = fromReviewRecord(reviewRecord);
  const nextState = scheduler.scheduleNextReview(currentState, grade, reviewTime);

  const dbInput = toReviewRecordInput(nextState, grade);
  await ReviewRepository.updateAfterReview(cardId, dbInput);

  return nextState;
}

// ============================================================================
// EXAMPLE 9: Real-time progress tracking
// ============================================================================

/**
 * Track progress during a study session
 */
export class StudySessionTracker {
  private startTime: number;
  private cardsReviewed: number = 0;
  private grades: ReviewGrade[] = [];

  constructor() {
    this.startTime = Date.now();
  }

  recordReview(grade: ReviewGrade) {
    this.cardsReviewed++;
    this.grades.push(grade);
  }

  getProgress() {
    const duration = Date.now() - this.startTime;
    const durationMinutes = duration / (60 * 1000);
    const cardsPerMinute = this.cardsReviewed / durationMinutes || 0;

    const gradeDistribution = {
      again: this.grades.filter(g => g === ReviewGrade.AGAIN).length,
      hard: this.grades.filter(g => g === ReviewGrade.HARD).length,
      good: this.grades.filter(g => g === ReviewGrade.GOOD).length,
      easy: this.grades.filter(g => g === ReviewGrade.EASY).length,
    };

    const successRate =
      this.cardsReviewed > 0
        ? ((gradeDistribution.good + gradeDistribution.easy) / this.cardsReviewed) * 100
        : 0;

    return {
      cardsReviewed: this.cardsReviewed,
      durationMinutes: parseFloat(durationMinutes.toFixed(1)),
      cardsPerMinute: parseFloat(cardsPerMinute.toFixed(1)),
      gradeDistribution,
      successRate: parseFloat(successRate.toFixed(1)),
    };
  }
}

// ============================================================================
// Usage examples
// ============================================================================

// Uncomment to run examples:
// async function exampleUsageFlow() {
//   // Example 1: Review a single card
//   const result = await reviewCard('card-123', ReviewGrade.GOOD, 3500);
//   console.log('Review result:', result);
// 
//   // Example 2: Start a study session
//   const session = await startStudySession('deck-456', 20);
//   console.log('Study session:', session);
// 
//   // Example 3: Get preview before reviewing
//   const preview = await getReviewPreview('card-123');
//   console.log('Preview:', preview);
// 
//   // Example 4: Track session progress
//   const tracker = new StudySessionTracker();
//   tracker.recordReview(ReviewGrade.GOOD);
//   tracker.recordReview(ReviewGrade.EASY);
//   tracker.recordReview(ReviewGrade.AGAIN);
//   console.log('Session progress:', tracker.getProgress());
// 
//   // Example 5: Compare algorithms
//   const comparison = await compareAlgorithms('card-123', ReviewGrade.GOOD);
//   console.log('FSRS vs SM-2:', comparison);
// 
//   // Example 6: Get statistics
//   const stats = await getDeckStatistics('deck-456');
//   console.log('Deck statistics:', stats);
// }
// exampleUsageFlow();
