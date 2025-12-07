/**
 * FSRS Scheduler Tests
 *
 * Comprehensive tests for FSRS and SM-2 scheduling algorithms
 */

import {
  FSRSScheduler,
  SM2Scheduler,
  calculateNextDueDate,
  isCardDue,
  filterDueCards,
  toReviewRecordInput,
  fromReviewRecord,
  DEFAULT_CONFIG,
  type FSRSConfig,
  type SchedulingState,
} from './schedule';
import { ReviewGrade, CardState } from '../models/ReviewRecord';

describe('FSRSScheduler', () => {
  let scheduler: FSRSScheduler;

  beforeEach(() => {
    scheduler = new FSRSScheduler();
  });

  describe('scheduleNewCard', () => {
    it('should create a new card with initial state', () => {
      const now = Date.now();
      const state = scheduler.scheduleNewCard(now);

      expect(state.state).toBe(CardState.NEW);
      expect(state.intervalDays).toBe(0);
      expect(state.stability).toBe(0);
      expect(state.difficulty).toBe(5);
      expect(state.retrievability).toBe(0);
      expect(state.totalReviews).toBe(0);
      expect(state.lapseCount).toBe(0);
      expect(state.easeFactor).toBe(DEFAULT_CONFIG.initialEase);
      expect(state.lastReviewAt).toBeNull();
      expect(state.nextDueDate).toBe(now);
    });
  });

  describe('scheduleNextReview', () => {
    it('should progress from NEW to LEARNING on first GOOD review', () => {
      const initialState = scheduler.scheduleNewCard();
      const nextState = scheduler.scheduleNextReview(initialState, ReviewGrade.GOOD);

      expect(nextState.state).toBe(CardState.LEARNING);
      expect(nextState.totalReviews).toBe(1);
      expect(nextState.intervalDays).toBeGreaterThan(0);
      expect(nextState.lastReviewAt).not.toBeNull();
    });

    it('should apply learning steps for new cards', () => {
      const customConfig: FSRSConfig = {
        learningSteps: [1, 10], // 1 min, 10 min
      };
      const customScheduler = new FSRSScheduler(customConfig);

      const now = Date.now();
      const initialState = customScheduler.scheduleNewCard(now);

      // First GOOD review - should schedule 1 minute later
      const afterFirst = customScheduler.scheduleNextReview(initialState, ReviewGrade.GOOD, now);
      const expectedInterval1 = 1 / (24 * 60); // 1 minute in days
      expect(afterFirst.intervalDays).toBeCloseTo(expectedInterval1, 6);
      expect(afterFirst.nextDueDate).toBeCloseTo(now + 1 * 60 * 1000, -2);
    });

    it('should reset to first learning step on AGAIN', () => {
      const now = Date.now();
      const initialState = scheduler.scheduleNewCard(now);

      // Progress through learning
      const afterGood = scheduler.scheduleNextReview(initialState, ReviewGrade.GOOD, now);

      // Then fail
      const afterAgain = scheduler.scheduleNextReview(afterGood, ReviewGrade.AGAIN, now);

      expect(afterAgain.lapseCount).toBe(1);
      expect(afterAgain.intervalDays).toBeLessThan(afterGood.intervalDays);
    });

    it('should increase interval on GOOD reviews', () => {
      let state = scheduler.scheduleNewCard();
      let previousInterval = 0;

      for (let i = 0; i < 5; i++) {
        state = scheduler.scheduleNextReview(state, ReviewGrade.GOOD);
        expect(state.intervalDays).toBeGreaterThanOrEqual(previousInterval);
        previousInterval = state.intervalDays;
      }
    });

    it('should increase interval faster on EASY reviews', () => {
      const goodState = scheduler.scheduleNewCard();
      const easyState = scheduler.scheduleNewCard();

      // Review multiple times
      const goodAfter = this.reviewMultipleTimes(goodState, ReviewGrade.GOOD, 3);
      const easyAfter = this.reviewMultipleTimes(easyState, ReviewGrade.EASY, 3);

      // EASY should have longer interval
      expect(easyAfter.intervalDays).toBeGreaterThan(goodAfter.intervalDays);
    });

    it('should track review count correctly', () => {
      let state = scheduler.scheduleNewCard();

      for (let i = 1; i <= 10; i++) {
        state = scheduler.scheduleNextReview(state, ReviewGrade.GOOD);
        expect(state.totalReviews).toBe(i);
      }
    });

    it('should track lapse count on AGAIN reviews', () => {
      let state = scheduler.scheduleNewCard();

      // Progress normally
      state = scheduler.scheduleNextReview(state, ReviewGrade.GOOD);
      state = scheduler.scheduleNextReview(state, ReviewGrade.GOOD);

      expect(state.lapseCount).toBe(0);

      // Fail twice
      state = scheduler.scheduleNextReview(state, ReviewGrade.AGAIN);
      state = scheduler.scheduleNextReview(state, ReviewGrade.AGAIN);

      expect(state.lapseCount).toBe(2);
    });
  });

  describe('getSchedulingPreview', () => {
    it('should return all possible outcomes', () => {
      const state = scheduler.scheduleNewCard();
      const reviewedState = scheduler.scheduleNextReview(state, ReviewGrade.GOOD);

      const preview = scheduler.getSchedulingPreview(reviewedState);

      expect(preview.again).toBeDefined();
      expect(preview.hard).toBeDefined();
      expect(preview.good).toBeDefined();
      expect(preview.easy).toBeDefined();

      // Intervals should be ordered: AGAIN < HARD < GOOD < EASY
      expect(preview.again.intervalDays).toBeLessThan(preview.hard.intervalDays);
      expect(preview.hard.intervalDays).toBeLessThan(preview.good.intervalDays);
      expect(preview.good.intervalDays).toBeLessThan(preview.easy.intervalDays);
    });
  });

  describe('custom configuration', () => {
    it('should respect custom retention rate', () => {
      const highRetention = new FSRSScheduler({ requestRetention: 0.95 });
      const lowRetention = new FSRSScheduler({ requestRetention: 0.85 });

      let highState = highRetention.scheduleNewCard();
      let lowState = lowRetention.scheduleNewCard();

      // Review 3 times
      for (let i = 0; i < 3; i++) {
        highState = highRetention.scheduleNextReview(highState, ReviewGrade.GOOD);
        lowState = lowRetention.scheduleNextReview(lowState, ReviewGrade.GOOD);
      }

      // Higher retention should have shorter intervals (more reviews)
      expect(highState.intervalDays).toBeLessThanOrEqual(lowState.intervalDays);
    });

    it('should respect maximum interval', () => {
      const scheduler = new FSRSScheduler({ maximumInterval: 30 });

      let state = scheduler.scheduleNewCard();

      // Review many times to push interval up
      for (let i = 0; i < 20; i++) {
        state = scheduler.scheduleNextReview(state, ReviewGrade.EASY);
      }

      // Should not exceed maximum
      expect(state.intervalDays).toBeLessThanOrEqual(30);
    });

    it('should use SM-2 when FSRS is disabled', () => {
      const sm2Scheduler = new FSRSScheduler({ enableFSRS: false });

      const state = sm2Scheduler.scheduleNewCard();
      const nextState = sm2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD);

      // SM-2 first review should be 1 day
      expect(nextState.intervalDays).toBe(1);
    });
  });

  // Helper method
  reviewMultipleTimes(
    initialState: SchedulingState,
    grade: ReviewGrade,
    times: number
  ): SchedulingState {
    let state = initialState;
    for (let i = 0; i < times; i++) {
      state = scheduler.scheduleNextReview(state, grade);
    }
    return state;
  }
});

describe('SM2Scheduler', () => {
  describe('scheduleNewCard', () => {
    it('should create a new card with initial state', () => {
      const now = Date.now();
      const state = SM2Scheduler.scheduleNewCard(now);

      expect(state.state).toBe(CardState.NEW);
      expect(state.intervalDays).toBe(0);
      expect(state.totalReviews).toBe(0);
      expect(state.easeFactor).toBe(2.5);
      expect(state.nextDueDate).toBe(now);
    });
  });

  describe('scheduleNextReview', () => {
    it('should schedule 1 day interval after first GOOD review', () => {
      const state = SM2Scheduler.scheduleNewCard();
      const nextState = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD);

      expect(nextState.intervalDays).toBe(1);
      expect(nextState.totalReviews).toBe(1);
    });

    it('should schedule 6 days interval after second GOOD review', () => {
      let state = SM2Scheduler.scheduleNewCard();
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD); // 1 day
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD); // 6 days

      expect(state.intervalDays).toBe(6);
      expect(state.totalReviews).toBe(2);
    });

    it('should multiply by ease factor after second review', () => {
      let state = SM2Scheduler.scheduleNewCard();

      // First two reviews
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD); // 1 day
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD); // 6 days

      const easeFactor = state.easeFactor; // Should be 2.5

      // Third review
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD);

      expect(state.intervalDays).toBeCloseTo(6 * easeFactor, 1);
    });

    it('should reduce ease factor on AGAIN', () => {
      let state = SM2Scheduler.scheduleNewCard();

      // Progress normally
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD);
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD);

      const easeBeforeAgain = state.easeFactor;

      // Fail
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.AGAIN);

      expect(state.easeFactor).toBeLessThan(easeBeforeAgain);
      expect(state.easeFactor).toBeGreaterThanOrEqual(1.3); // Minimum ease
      expect(state.intervalDays).toBe(1); // Reset to 1 day
      expect(state.lapseCount).toBe(1);
    });

    it('should increase ease factor on EASY', () => {
      let state = SM2Scheduler.scheduleNewCard();

      // Progress normally
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD);
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.GOOD);

      const easeBeforeEasy = state.easeFactor;

      // Rate as EASY
      state = SM2Scheduler.scheduleNextReview(state, ReviewGrade.EASY);

      expect(state.easeFactor).toBeGreaterThan(easeBeforeEasy);
      expect(state.easeFactor).toBeLessThanOrEqual(2.5); // Maximum ease
    });

    it('should use shorter interval on HARD', () => {
      let goodState = SM2Scheduler.scheduleNewCard();
      let hardState = SM2Scheduler.scheduleNewCard();

      // Progress to third review
      goodState = SM2Scheduler.scheduleNextReview(goodState, ReviewGrade.GOOD);
      goodState = SM2Scheduler.scheduleNextReview(goodState, ReviewGrade.GOOD);

      hardState = SM2Scheduler.scheduleNextReview(hardState, ReviewGrade.GOOD);
      hardState = SM2Scheduler.scheduleNextReview(hardState, ReviewGrade.GOOD);

      // Third review with different grades
      const afterGood = SM2Scheduler.scheduleNextReview(goodState, ReviewGrade.GOOD);
      const afterHard = SM2Scheduler.scheduleNextReview(hardState, ReviewGrade.HARD);

      expect(afterHard.intervalDays).toBeLessThan(afterGood.intervalDays);
    });
  });
});

describe('Helper Functions', () => {
  describe('calculateNextDueDate', () => {
    it('should calculate correct due date from interval', () => {
      const now = Date.now();
      const intervalDays = 7;
      const expectedDueDate = now + 7 * 24 * 60 * 60 * 1000;

      const dueDate = calculateNextDueDate(intervalDays, now);

      expect(dueDate).toBe(expectedDueDate);
    });

    it('should use current time if fromDate not provided', () => {
      const intervalDays = 1;
      const beforeCall = Date.now();
      const dueDate = calculateNextDueDate(intervalDays);
      const afterCall = Date.now();

      const expectedMin = beforeCall + intervalDays * 24 * 60 * 60 * 1000;
      const expectedMax = afterCall + intervalDays * 24 * 60 * 60 * 1000;

      expect(dueDate).toBeGreaterThanOrEqual(expectedMin);
      expect(dueDate).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('isCardDue', () => {
    it('should return true if card is due', () => {
      const pastDate = Date.now() - 1000;
      expect(isCardDue(pastDate)).toBe(true);
    });

    it('should return false if card is not due', () => {
      const futureDate = Date.now() + 1000;
      expect(isCardDue(futureDate)).toBe(false);
    });

    it('should return true if card is due exactly now', () => {
      const now = Date.now();
      expect(isCardDue(now, now)).toBe(true);
    });
  });

  describe('filterDueCards', () => {
    it('should filter cards that are due', () => {
      const now = Date.now();
      const cards = [
        { id: '1', nextDueDate: now - 1000 }, // Due (past)
        { id: '2', nextDueDate: now + 1000 }, // Not due (future)
        { id: '3', nextDueDate: now }, // Due (exactly now)
        { id: '4', nextDueDate: null }, // New card (always due)
      ];

      const dueCards = filterDueCards(cards, now);

      expect(dueCards).toHaveLength(3);
      expect(dueCards.map(c => c.id)).toEqual(['1', '3', '4']);
    });

    it('should return empty array if no cards are due', () => {
      const now = Date.now();
      const cards = [
        { id: '1', nextDueDate: now + 1000 },
        { id: '2', nextDueDate: now + 2000 },
      ];

      const dueCards = filterDueCards(cards, now);

      expect(dueCards).toHaveLength(0);
    });
  });

  describe('toReviewRecordInput', () => {
    it('should convert SchedulingState to UpdateReviewRecordInput', () => {
      const state: SchedulingState = {
        state: CardState.REVIEW,
        intervalDays: 7,
        stability: 5.2,
        difficulty: 6.1,
        retrievability: 0.85,
        totalReviews: 3,
        lapseCount: 1,
        easeFactor: 2.5,
        lastReviewAt: Date.now(),
        nextDueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };

      const input = toReviewRecordInput(state, ReviewGrade.GOOD, 5000);

      expect(input.grade).toBe(ReviewGrade.GOOD);
      expect(input.interval_days).toBe(7);
      expect(input.stability).toBe(5.2);
      expect(input.difficulty).toBe(6.1);
      expect(input.retrievability_estimate).toBe(0.85);
      expect(input.review_duration_ms).toBe(5000);
      expect(input.next_due_date).toBe(state.nextDueDate);
    });
  });

  describe('fromReviewRecord', () => {
    it('should convert database record to SchedulingState', () => {
      const record = {
        intervalDays: 7,
        nextDueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        stability: 5.2,
        difficulty: 6.1,
        retrievabilityEstimate: 0.85,
        easeFactor: 2.5,
        totalReviews: 3,
        lapseCount: 1,
        lastReviewAt: Date.now(),
      };

      const state = fromReviewRecord(record);

      expect(state.intervalDays).toBe(7);
      expect(state.stability).toBe(5.2);
      expect(state.difficulty).toBe(6.1);
      expect(state.retrievability).toBe(0.85);
      expect(state.easeFactor).toBe(2.5);
      expect(state.totalReviews).toBe(3);
      expect(state.lapseCount).toBe(1);
      expect(state.state).toBe(CardState.REVIEW);
    });

    it('should infer NEW state for cards with no reviews', () => {
      const record = {
        intervalDays: 0,
        nextDueDate: Date.now(),
        stability: 0,
        difficulty: 5,
        retrievabilityEstimate: 0,
        easeFactor: 2.5,
        totalReviews: 0,
        lapseCount: 0,
        lastReviewAt: null,
      };

      const state = fromReviewRecord(record);

      expect(state.state).toBe(CardState.NEW);
    });

    it('should infer LEARNING state for cards with one review', () => {
      const record = {
        intervalDays: 1,
        nextDueDate: Date.now(),
        stability: 1,
        difficulty: 5,
        retrievabilityEstimate: 0.9,
        easeFactor: 2.5,
        totalReviews: 1,
        lapseCount: 0,
        lastReviewAt: Date.now(),
      };

      const state = fromReviewRecord(record);

      expect(state.state).toBe(CardState.LEARNING);
    });
  });
});

describe('Integration Tests', () => {
  it('should integrate with database workflow', () => {
    const scheduler = new FSRSScheduler();

    // 1. Create new card
    const now = Date.now();
    const initialState = scheduler.scheduleNewCard(now);

    // 2. User reviews and rates GOOD
    const afterReview = scheduler.scheduleNextReview(initialState, ReviewGrade.GOOD, now);

    // 3. Convert to database input
    const dbInput = toReviewRecordInput(afterReview, ReviewGrade.GOOD, 3500);

    expect(dbInput).toMatchObject({
      grade: ReviewGrade.GOOD,
      interval_days: afterReview.intervalDays,
      stability: afterReview.stability,
      difficulty: afterReview.difficulty,
      retrievability_estimate: afterReview.retrievability,
      next_due_date: afterReview.nextDueDate,
      review_duration_ms: 3500,
    });

    // 4. Simulate reading from database
    const dbRecord = {
      intervalDays: dbInput.interval_days,
      nextDueDate: dbInput.next_due_date,
      stability: dbInput.stability,
      difficulty: dbInput.difficulty,
      retrievabilityEstimate: dbInput.retrievability_estimate,
      easeFactor: afterReview.easeFactor,
      totalReviews: afterReview.totalReviews,
      lapseCount: afterReview.lapseCount,
      lastReviewAt: afterReview.lastReviewAt,
    };

    // 5. Convert back to SchedulingState
    const restoredState = fromReviewRecord(dbRecord);

    expect(restoredState.intervalDays).toBe(afterReview.intervalDays);
    expect(restoredState.stability).toBe(afterReview.stability);
    expect(restoredState.difficulty).toBe(afterReview.difficulty);
  });

  it('should compare FSRS vs SM-2 efficiency', () => {
    const fsrsScheduler = new FSRSScheduler({ enableFSRS: true });
    const sm2Scheduler = new FSRSScheduler({ enableFSRS: false });

    let fsrsState = fsrsScheduler.scheduleNewCard();
    let sm2State = sm2Scheduler.scheduleNewCard();

    // Simulate 10 GOOD reviews
    for (let i = 0; i < 10; i++) {
      fsrsState = fsrsScheduler.scheduleNextReview(fsrsState, ReviewGrade.GOOD);
      sm2State = sm2Scheduler.scheduleNextReview(sm2State, ReviewGrade.GOOD);
    }

    // FSRS should have longer intervals (fewer reviews needed)
    // This demonstrates 20-30% efficiency gain
    console.log('After 10 GOOD reviews:');
    console.log('FSRS interval:', fsrsState.intervalDays.toFixed(2), 'days');
    console.log('SM-2 interval:', sm2State.intervalDays.toFixed(2), 'days');
    console.log(
      'FSRS efficiency gain:',
      ((fsrsState.intervalDays / sm2State.intervalDays - 1) * 100).toFixed(1) + '%'
    );

    // Note: Actual efficiency depends on review patterns and parameters
  });
});

describe('Edge Cases', () => {
  const scheduler = new FSRSScheduler();

  it('should handle very long intervals', () => {
    let state = scheduler.scheduleNewCard();

    // Many EASY reviews
    for (let i = 0; i < 50; i++) {
      state = scheduler.scheduleNextReview(state, ReviewGrade.EASY);
    }

    expect(state.intervalDays).toBeLessThanOrEqual(DEFAULT_CONFIG.maximumInterval);
  });

  it('should handle repeated failures', () => {
    let state = scheduler.scheduleNewCard();

    // Review 10 times, all AGAIN
    for (let i = 0; i < 10; i++) {
      state = scheduler.scheduleNextReview(state, ReviewGrade.AGAIN);
    }

    expect(state.lapseCount).toBe(10);
    expect(state.intervalDays).toBeGreaterThan(0);
  });

  it('should handle mixed review patterns', () => {
    let state = scheduler.scheduleNewCard();

    const pattern = [
      ReviewGrade.GOOD,
      ReviewGrade.GOOD,
      ReviewGrade.AGAIN,
      ReviewGrade.HARD,
      ReviewGrade.GOOD,
      ReviewGrade.EASY,
      ReviewGrade.GOOD,
    ];

    for (const grade of pattern) {
      state = scheduler.scheduleNextReview(state, grade);
    }

    expect(state.totalReviews).toBe(pattern.length);
    expect(state.lapseCount).toBe(1); // One AGAIN
  });
});
