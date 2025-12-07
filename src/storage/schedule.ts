/**
 * FSRS Scheduling Logic
 *
 * Implements spaced repetition scheduling using:
 * - FSRS (Free Spaced Repetition Scheduler) algorithm - primary scheduler
 * - SM-2 algorithm - fallback/comparison
 *
 * FSRS is 20-30% more efficient than SM-2, requiring fewer reviews
 * for the same retention rate.
 */

import { FSRS, Card as FSRSCard, Rating, State, RecordLog } from 'fsrs';
import { ReviewGrade, CardState } from '../models/ReviewRecord';
import type { UpdateReviewRecordInput } from '../models/ReviewRecord';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * FSRS scheduler configuration
 *
 * Default parameters optimized for 90% retention rate
 */
export interface FSRSConfig {
  /**
   * Requested retention rate (0-1)
   * Default: 0.9 (90% retention)
   * Higher values = more reviews, better retention
   */
  requestRetention?: number;

  /**
   * Maximum interval in days
   * Default: 36500 (100 years, effectively unlimited)
   */
  maximumInterval?: number;

  /**
   * Learning steps for new cards (in minutes)
   * Default: [1, 10] - review after 1 minute, then 10 minutes
   */
  learningSteps?: number[];

  /**
   * Relearning steps after failure (in minutes)
   * Default: [10] - review after 10 minutes
   */
  relearnSteps?: number[];

  /**
   * Initial ease factor for SM-2
   * Default: 2.5
   */
  initialEase?: number;

  /**
   * Enable or disable FSRS algorithm
   * Default: true
   * Set to false to use SM-2 only
   */
  enableFSRS?: boolean;
}

export const DEFAULT_CONFIG: Required<FSRSConfig> = {
  requestRetention: 0.9,
  maximumInterval: 36500, // 100 years
  learningSteps: [1, 10], // 1 min, 10 min
  relearnSteps: [10], // 10 min
  initialEase: 2.5,
  enableFSRS: true,
};

// ============================================================================
// TYPE CONVERSIONS
// ============================================================================

/**
 * Convert ReviewGrade (1-4) to FSRS Rating
 */
function reviewGradeToRating(grade: ReviewGrade): Rating {
  switch (grade) {
    case ReviewGrade.AGAIN:
      return Rating.Again; // 1
    case ReviewGrade.HARD:
      return Rating.Hard; // 2
    case ReviewGrade.GOOD:
      return Rating.Good; // 3
    case ReviewGrade.EASY:
      return Rating.Easy; // 4
    default:
      return Rating.Good;
  }
}

/**
 * Convert CardState to FSRS State
 */
function cardStateToFSRSState(state: CardState): State {
  switch (state) {
    case CardState.NEW:
      return State.New;
    case CardState.LEARNING:
      return State.Learning;
    case CardState.REVIEW:
      return State.Review;
    case CardState.RELEARNING:
      return State.Relearning;
    default:
      return State.New;
  }
}

/**
 * Convert FSRS State to CardState
 */
function fsrsStateToCardState(state: State): CardState {
  switch (state) {
    case State.New:
      return CardState.NEW;
    case State.Learning:
      return CardState.LEARNING;
    case State.Review:
      return CardState.REVIEW;
    case State.Relearning:
      return CardState.RELEARNING;
    default:
      return CardState.NEW;
  }
}

// ============================================================================
// FSRS CARD STATE
// ============================================================================

/**
 * Internal state for FSRS scheduling
 * Mirrors the database ReviewRecord structure
 */
export interface SchedulingState {
  /**
   * Card state (NEW, LEARNING, REVIEW, RELEARNING)
   */
  state: CardState;

  /**
   * Interval in days until next review
   */
  intervalDays: number;

  /**
   * Stability parameter (higher = longer retention)
   */
  stability: number;

  /**
   * Difficulty parameter (0-10, higher = more difficult)
   */
  difficulty: number;

  /**
   * Estimated retrievability (0-1, probability of recall)
   */
  retrievability: number;

  /**
   * Number of reviews completed
   */
  totalReviews: number;

  /**
   * Number of times card was forgotten (grade = AGAIN)
   */
  lapseCount: number;

  /**
   * Ease factor (for SM-2 compatibility)
   */
  easeFactor: number;

  /**
   * Last review timestamp (ms)
   */
  lastReviewAt: number | null;

  /**
   * Next due date timestamp (ms)
   */
  nextDueDate: number;
}

/**
 * Result of scheduling calculation
 * Contains all possible outcomes based on user rating
 */
export interface SchedulingResult {
  /**
   * Result if user rates AGAIN (failed)
   */
  again: SchedulingState;

  /**
   * Result if user rates HARD
   */
  hard: SchedulingState;

  /**
   * Result if user rates GOOD
   */
  good: SchedulingState;

  /**
   * Result if user rates EASY
   */
  easy: SchedulingState;
}

// ============================================================================
// FSRS SCHEDULER (PRIMARY)
// ============================================================================

export class FSRSScheduler {
  private fsrs: FSRS;
  private config: Required<FSRSConfig>;

  constructor(config: FSRSConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fsrs = new FSRS({
      request_retention: this.config.requestRetention,
      maximum_interval: this.config.maximumInterval,
      enable_fuzz: true, // Add randomness to prevent review clustering
    });
  }

  /**
   * Initialize a new card (first time)
   * Returns initial state with S=0, D=5, R=0
   */
  scheduleNewCard(now: number = Date.now()): SchedulingState {
    return {
      state: CardState.NEW,
      intervalDays: 0,
      stability: 0,
      difficulty: 5, // Default difficulty (0-10 scale)
      retrievability: 0,
      totalReviews: 0,
      lapseCount: 0,
      easeFactor: this.config.initialEase,
      lastReviewAt: null,
      nextDueDate: now, // Due immediately
    };
  }

  /**
   * Calculate next review state after user grades the card
   *
   * @param currentState Current scheduling state
   * @param grade User rating (1-4)
   * @param reviewedAt Timestamp when review occurred (ms)
   * @returns New scheduling state with updated parameters
   */
  scheduleNextReview(
    currentState: SchedulingState,
    grade: ReviewGrade,
    reviewedAt: number = Date.now()
  ): SchedulingState {
    if (!this.config.enableFSRS) {
      return this.scheduleWithSM2(currentState, grade, reviewedAt);
    }

    // Convert to FSRS card format
    const fsrsCard: FSRSCard = {
      due: new Date(currentState.nextDueDate),
      stability: currentState.stability,
      difficulty: currentState.difficulty,
      elapsed_days: this.calculateElapsedDays(currentState, reviewedAt),
      scheduled_days: currentState.intervalDays,
      reps: currentState.totalReviews,
      lapses: currentState.lapseCount,
      state: cardStateToFSRSState(currentState.state),
      last_review: currentState.lastReviewAt ? new Date(currentState.lastReviewAt) : undefined,
    };

    // Calculate next state with FSRS
    const rating = reviewGradeToRating(grade);
    const schedulingCards = this.fsrs.repeat(fsrsCard, reviewedAt);
    const nextCard = schedulingCards[rating].card;
    const recordLog = schedulingCards[rating].log;

    // Handle learning steps for new/learning cards
    const nextState = this.applyLearningSteps(
      nextCard,
      recordLog,
      grade,
      currentState,
      reviewedAt
    );

    return nextState;
  }

  /**
   * Get all possible scheduling outcomes (for preview)
   * Shows what will happen for each possible grade
   */
  getSchedulingPreview(
    currentState: SchedulingState,
    reviewedAt: number = Date.now()
  ): SchedulingResult {
    return {
      again: this.scheduleNextReview(currentState, ReviewGrade.AGAIN, reviewedAt),
      hard: this.scheduleNextReview(currentState, ReviewGrade.HARD, reviewedAt),
      good: this.scheduleNextReview(currentState, ReviewGrade.GOOD, reviewedAt),
      easy: this.scheduleNextReview(currentState, ReviewGrade.EASY, reviewedAt),
    };
  }

  /**
   * Apply learning steps for NEW and LEARNING cards
   * Uses configured learning/relearning intervals
   */
  private applyLearningSteps(
    fsrsCard: FSRSCard,
    recordLog: RecordLog,
    grade: ReviewGrade,
    currentState: SchedulingState,
    reviewedAt: number
  ): SchedulingState {
    const newState = fsrsStateToCardState(fsrsCard.state);
    const isNewCard = currentState.state === CardState.NEW;
    const isLearning = newState === CardState.LEARNING;
    const isRelearning = newState === CardState.RELEARNING;

    // Determine which learning steps to use
    const steps = isRelearning ? this.config.relearnSteps : this.config.learningSteps;

    let intervalDays = fsrsCard.scheduled_days;
    let nextDueDate = fsrsCard.due.getTime();

    // Apply learning steps for new/learning/relearning cards
    if ((isNewCard || isLearning || isRelearning) && steps.length > 0) {
      if (grade === ReviewGrade.AGAIN) {
        // Reset to first learning step
        const intervalMinutes = steps[0];
        intervalDays = intervalMinutes / (24 * 60);
        nextDueDate = reviewedAt + intervalMinutes * 60 * 1000;
      } else if (grade === ReviewGrade.GOOD && isLearning) {
        // Progress through learning steps
        const currentStepIndex = this.getCurrentStepIndex(currentState, steps);
        const nextStepIndex = Math.min(currentStepIndex + 1, steps.length - 1);

        if (nextStepIndex < steps.length) {
          const intervalMinutes = steps[nextStepIndex];
          intervalDays = intervalMinutes / (24 * 60);
          nextDueDate = reviewedAt + intervalMinutes * 60 * 1000;
        }
        // If finished learning steps, use FSRS calculated interval
      }
    }

    return {
      state: newState,
      intervalDays,
      stability: fsrsCard.stability,
      difficulty: fsrsCard.difficulty,
      retrievability: recordLog.review || 0,
      totalReviews: fsrsCard.reps,
      lapseCount: fsrsCard.lapses,
      easeFactor: currentState.easeFactor, // Preserve for SM-2 compatibility
      lastReviewAt: reviewedAt,
      nextDueDate,
    };
  }

  /**
   * Determine current learning step index
   */
  private getCurrentStepIndex(state: SchedulingState, steps: number[]): number {
    const intervalMinutes = state.intervalDays * 24 * 60;
    const index = steps.findIndex(step => Math.abs(step - intervalMinutes) < 0.1);
    return index >= 0 ? index : 0;
  }

  /**
   * Calculate elapsed days since last review
   */
  private calculateElapsedDays(state: SchedulingState, now: number): number {
    if (!state.lastReviewAt) return 0;
    return (now - state.lastReviewAt) / (1000 * 60 * 60 * 24);
  }

  /**
   * SM-2 fallback implementation (when enableFSRS = false)
   */
  private scheduleWithSM2(
    currentState: SchedulingState,
    grade: ReviewGrade,
    reviewedAt: number
  ): SchedulingState {
    const sm2Result = SM2Scheduler.scheduleNextReview(currentState, grade, reviewedAt);
    return sm2Result;
  }
}

// ============================================================================
// SM-2 SCHEDULER (FALLBACK)
// ============================================================================

/**
 * SM-2 (SuperMemo 2) Algorithm
 *
 * Classic spaced repetition algorithm from 1987
 * Used as fallback and for comparison with FSRS
 *
 * Algorithm:
 * - Grade 1 (Again): Reset to 1 day, reduce ease
 * - Grade 2 (Hard): Multiply interval by 1.2, reduce ease
 * - Grade 3 (Good): Multiply interval by ease factor
 * - Grade 4 (Easy): Multiply interval by ease factor * 1.3, increase ease
 */
export class SM2Scheduler {
  /**
   * Schedule a new card with SM-2
   */
  static scheduleNewCard(
    now: number = Date.now(),
    initialEase: number = DEFAULT_CONFIG.initialEase
  ): SchedulingState {
    return {
      state: CardState.NEW,
      intervalDays: 0,
      stability: 0,
      difficulty: 5,
      retrievability: 0,
      totalReviews: 0,
      lapseCount: 0,
      easeFactor: initialEase,
      lastReviewAt: null,
      nextDueDate: now,
    };
  }

  /**
   * Calculate next review using SM-2 algorithm
   */
  static scheduleNextReview(
    currentState: SchedulingState,
    grade: ReviewGrade,
    reviewedAt: number = Date.now()
  ): SchedulingState {
    let easeFactor = currentState.easeFactor;
    let intervalDays: number;
    let lapseCount = currentState.lapseCount;
    let state = currentState.state;

    // First review
    if (currentState.totalReviews === 0) {
      state = CardState.LEARNING;
      intervalDays = grade === ReviewGrade.AGAIN ? 0 : 1;

      if (grade === ReviewGrade.AGAIN) {
        lapseCount++;
      }
    }
    // Second review
    else if (currentState.totalReviews === 1) {
      if (grade === ReviewGrade.AGAIN) {
        intervalDays = 0;
        lapseCount++;
        state = CardState.RELEARNING;
      } else {
        intervalDays = 6;
        state = CardState.REVIEW;
      }
    }
    // Subsequent reviews
    else {
      switch (grade) {
        case ReviewGrade.AGAIN:
          // Reset and penalize
          intervalDays = 1;
          easeFactor = Math.max(1.3, easeFactor - 0.2);
          lapseCount++;
          state = CardState.RELEARNING;
          break;

        case ReviewGrade.HARD:
          // Shorter interval, slight penalty
          intervalDays = currentState.intervalDays * 1.2;
          easeFactor = Math.max(1.3, easeFactor - 0.15);
          state = CardState.REVIEW;
          break;

        case ReviewGrade.GOOD:
          // Normal progression
          intervalDays = currentState.intervalDays * easeFactor;
          state = CardState.REVIEW;
          break;

        case ReviewGrade.EASY:
          // Longer interval, bonus
          intervalDays = currentState.intervalDays * easeFactor * 1.3;
          easeFactor = Math.min(2.5, easeFactor + 0.15);
          state = CardState.REVIEW;
          break;

        default:
          intervalDays = currentState.intervalDays;
      }
    }

    // Cap maximum interval
    intervalDays = Math.min(intervalDays, DEFAULT_CONFIG.maximumInterval);

    // Calculate next due date
    const nextDueDate = reviewedAt + intervalDays * 24 * 60 * 60 * 1000;

    // Estimate retrievability (simple decay model)
    const retrievability = Math.exp(-intervalDays / 30); // Rough estimate

    return {
      state,
      intervalDays,
      stability: intervalDays, // Use interval as stability proxy
      difficulty: currentState.difficulty,
      retrievability,
      totalReviews: currentState.totalReviews + 1,
      lapseCount,
      easeFactor,
      lastReviewAt: reviewedAt,
      nextDueDate,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate next due date from interval
 */
export function calculateNextDueDate(intervalDays: number, fromDate: number = Date.now()): number {
  return fromDate + intervalDays * 24 * 60 * 60 * 1000;
}

/**
 * Check if a card is due for review
 */
export function isCardDue(nextDueDate: number, now: number = Date.now()): boolean {
  return nextDueDate <= now;
}

/**
 * Get cards that are due for review
 * This is a helper that works with database query results
 */
export function filterDueCards<T extends { nextDueDate: number | null }>(
  cards: T[],
  now: number = Date.now()
): T[] {
  return cards.filter(card => {
    // New cards (no review record) are always due
    if (card.nextDueDate === null) return true;
    // Otherwise check if due date has passed
    return card.nextDueDate <= now;
  });
}

/**
 * Convert SchedulingState to UpdateReviewRecordInput
 * Used when persisting scheduling results to database
 */
export function toReviewRecordInput(
  state: SchedulingState,
  grade: ReviewGrade,
  reviewDurationMs?: number
): UpdateReviewRecordInput {
  return {
    grade,
    next_due_date: state.nextDueDate,
    interval_days: state.intervalDays,
    stability: state.stability,
    difficulty: state.difficulty,
    retrievability_estimate: state.retrievability,
    review_duration_ms: reviewDurationMs,
  };
}

/**
 * Convert database ReviewRecord to SchedulingState
 */
export function fromReviewRecord(record: {
  intervalDays: number;
  nextDueDate: number;
  stability: number;
  difficulty: number;
  retrievabilityEstimate: number;
  easeFactor: number;
  totalReviews: number;
  lapseCount: number;
  lastReviewAt: number | null;
}): SchedulingState {
  // Infer state from review count
  let state: CardState;
  if (record.totalReviews === 0) {
    state = CardState.NEW;
  } else if (record.totalReviews === 1) {
    state = CardState.LEARNING;
  } else if (record.lapseCount > 0 && record.intervalDays < 7) {
    state = CardState.RELEARNING;
  } else {
    state = CardState.REVIEW;
  }

  return {
    state,
    intervalDays: record.intervalDays,
    stability: record.stability,
    difficulty: record.difficulty,
    retrievability: record.retrievabilityEstimate,
    totalReviews: record.totalReviews,
    lapseCount: record.lapseCount,
    easeFactor: record.easeFactor,
    lastReviewAt: record.lastReviewAt,
    nextDueDate: record.nextDueDate,
  };
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

/**
 * Example: Schedule a new card and simulate reviews
 */
export function exampleUsage() {
  // Create scheduler with default config (90% retention, FSRS enabled)
  const scheduler = new FSRSScheduler();

  // 1. Create a new card
  console.log('=== NEW CARD ===');
  let state = scheduler.scheduleNewCard();
  console.log('Initial state:', state);
  console.log('Due immediately:', isCardDue(state.nextDueDate));

  // 2. First review - user rates GOOD
  console.log('\n=== FIRST REVIEW (GOOD) ===');
  state = scheduler.scheduleNextReview(state, ReviewGrade.GOOD);
  console.log('After first review:', {
    intervalDays: state.intervalDays,
    nextDueDate: new Date(state.nextDueDate).toISOString(),
    stability: state.stability.toFixed(2),
    difficulty: state.difficulty.toFixed(2),
  });

  // 3. Simulate time passing (1 day)
  const oneDayLater = Date.now() + 24 * 60 * 60 * 1000;

  // 4. Second review - user rates GOOD
  console.log('\n=== SECOND REVIEW (GOOD) ===');
  state = scheduler.scheduleNextReview(state, ReviewGrade.GOOD, oneDayLater);
  console.log('After second review:', {
    intervalDays: state.intervalDays.toFixed(2),
    nextDueDate: new Date(state.nextDueDate).toISOString(),
    stability: state.stability.toFixed(2),
    difficulty: state.difficulty.toFixed(2),
  });

  // 5. Preview all possible outcomes
  console.log('\n=== SCHEDULING PREVIEW ===');
  const preview = scheduler.getSchedulingPreview(state);
  console.log('If rated AGAIN:', { intervalDays: preview.again.intervalDays.toFixed(2) });
  console.log('If rated HARD:', { intervalDays: preview.hard.intervalDays.toFixed(2) });
  console.log('If rated GOOD:', { intervalDays: preview.good.intervalDays.toFixed(2) });
  console.log('If rated EASY:', { intervalDays: preview.easy.intervalDays.toFixed(2) });

  // 6. Compare with SM-2
  console.log('\n=== SM-2 COMPARISON ===');
  const sm2State = SM2Scheduler.scheduleNewCard();
  const sm2AfterGood = SM2Scheduler.scheduleNextReview(sm2State, ReviewGrade.GOOD);
  console.log('SM-2 interval after first GOOD:', sm2AfterGood.intervalDays);
  console.log('FSRS is more efficient!');
}

// Uncomment to run example:
// exampleUsage();
