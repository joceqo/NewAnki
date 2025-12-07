# FSRS Scheduler Documentation

This module implements spaced repetition scheduling using the **FSRS (Free Spaced Repetition Scheduler)** algorithm, with an SM-2 fallback for comparison and testing.

## Overview

The FSRS algorithm is a modern spaced repetition scheduler that is **20-30% more efficient** than the classic SM-2 algorithm, requiring fewer reviews for the same retention rate.

### Key Features

- ✅ FSRS algorithm implementation (default)
- ✅ SM-2 algorithm fallback
- ✅ Configurable retention rate (default 90%)
- ✅ Learning steps for new cards
- ✅ Relearning steps for failed cards
- ✅ TypeScript type safety
- ✅ Comprehensive test coverage

## Quick Start

```typescript
import { FSRSScheduler, ReviewGrade, toReviewRecordInput } from './storage/schedule';
import { ReviewRepository } from './database/repositories/ReviewRepository';

// Create scheduler with default config (90% retention)
const scheduler = new FSRSScheduler();

// 1. Schedule a new card
const initialState = scheduler.scheduleNewCard();
console.log('Card is due:', initialState.nextDueDate);

// 2. User reviews card and rates it GOOD
const nextState = scheduler.scheduleNextReview(initialState, ReviewGrade.GOOD);
console.log('Next review in', nextState.intervalDays, 'days');

// 3. Save to database
const dbInput = toReviewRecordInput(nextState, ReviewGrade.GOOD, 3500);
await ReviewRepository.updateAfterReview(cardId, dbInput);
```

## Core Concepts

### Scheduling State

Each card has a scheduling state that tracks:

```typescript
interface SchedulingState {
  state: CardState; // NEW, LEARNING, REVIEW, RELEARNING
  intervalDays: number; // Days until next review
  stability: number; // Memory stability (higher = longer retention)
  difficulty: number; // Card difficulty (0-10)
  retrievability: number; // Estimated recall probability (0-1)
  totalReviews: number; // Review count
  lapseCount: number; // Failure count
  easeFactor: number; // SM-2 compatibility
  lastReviewAt: number | null; // Last review timestamp
  nextDueDate: number; // When card is due (Unix ms)
}
```

### Review Grades

Users rate cards on a 1-4 scale:

```typescript
enum ReviewGrade {
  AGAIN = 1, // Failed - need to review again soon
  HARD = 2, // Difficult - shorter interval
  GOOD = 3, // Correct - normal interval
  EASY = 4, // Too easy - longer interval
}
```

### Card States

Cards progress through different states:

```typescript
enum CardState {
  NEW = 0, // Never reviewed
  LEARNING = 1, // In learning phase (short intervals)
  REVIEW = 2, // In review phase (normal intervals)
  RELEARNING = 3, // Relearning after failure
}
```

## API Reference

### FSRSScheduler

Main scheduler class implementing the FSRS algorithm.

#### Constructor

```typescript
new FSRSScheduler(config?: FSRSConfig);
```

**Configuration Options:**

```typescript
interface FSRSConfig {
  requestRetention?: number; // Target retention (0-1), default 0.9
  maximumInterval?: number; // Max days between reviews, default 36500
  learningSteps?: number[]; // Learning intervals (min), default [1, 10]
  relearnSteps?: number[]; // Relearning intervals (min), default [10]
  initialEase?: number; // Starting ease factor, default 2.5
  enableFSRS?: boolean; // Use FSRS (true) or SM-2 (false), default true
}
```

**Examples:**

```typescript
// Default config (90% retention)
const scheduler = new FSRSScheduler();

// High retention (more reviews)
const strictScheduler = new FSRSScheduler({
  requestRetention: 0.95,
});

// Low retention (fewer reviews)
const relaxedScheduler = new FSRSScheduler({
  requestRetention: 0.85,
});

// Custom learning steps
const customScheduler = new FSRSScheduler({
  learningSteps: [1, 5, 10, 30], // 1m, 5m, 10m, 30m
  relearnSteps: [5, 10], // 5m, 10m
});

// Use SM-2 instead of FSRS
const sm2Scheduler = new FSRSScheduler({
  enableFSRS: false,
});
```

#### Methods

##### `scheduleNewCard(now?: number): SchedulingState`

Initialize a new card with default state.

```typescript
const now = Date.now();
const state = scheduler.scheduleNewCard(now);

// Returns:
// {
//   state: CardState.NEW,
//   intervalDays: 0,
//   stability: 0,
//   difficulty: 5,
//   retrievability: 0,
//   totalReviews: 0,
//   lapseCount: 0,
//   easeFactor: 2.5,
//   lastReviewAt: null,
//   nextDueDate: now
// }
```

##### `scheduleNextReview(state: SchedulingState, grade: ReviewGrade, reviewedAt?: number): SchedulingState`

Calculate next review state after user grades the card.

```typescript
const currentState = {
  /* ... */
};
const grade = ReviewGrade.GOOD;
const nextState = scheduler.scheduleNextReview(currentState, grade);

console.log(`Next review in ${nextState.intervalDays} days`);
console.log(`Retrievability: ${(nextState.retrievability * 100).toFixed(1)}%`);
```

##### `getSchedulingPreview(state: SchedulingState, reviewedAt?: number): SchedulingResult`

Preview all possible outcomes before user grades the card.

```typescript
const preview = scheduler.getSchedulingPreview(currentState);

console.log('If you rate AGAIN:', preview.again.intervalDays, 'days');
console.log('If you rate HARD:', preview.hard.intervalDays, 'days');
console.log('If you rate GOOD:', preview.good.intervalDays, 'days');
console.log('If you rate EASY:', preview.easy.intervalDays, 'days');

// Use this to show users the consequences of their rating
```

### SM2Scheduler

Classic SuperMemo-2 algorithm (1987).

```typescript
// Static methods
const state = SM2Scheduler.scheduleNewCard(now, initialEase);
const nextState = SM2Scheduler.scheduleNextReview(state, grade, reviewedAt);
```

**SM-2 Intervals:**

- First review: 1 day
- Second review: 6 days
- Subsequent: interval × ease factor
- Ease adjustments based on grade

### Helper Functions

#### `calculateNextDueDate(intervalDays: number, fromDate?: number): number`

Calculate due date from interval.

```typescript
const dueDate = calculateNextDueDate(7); // 7 days from now
const customDate = calculateNextDueDate(7, Date.now()); // 7 days from specific time
```

#### `isCardDue(nextDueDate: number, now?: number): boolean`

Check if card is due for review.

```typescript
if (isCardDue(card.nextDueDate)) {
  console.log('Time to review!');
}
```

#### `filterDueCards<T>(cards: T[], now?: number): T[]`

Filter array to only due cards.

```typescript
const allCards = await CardRepository.findByDeckId(deckId);
const dueCards = filterDueCards(allCards);
console.log(`${dueCards.length} cards ready to review`);
```

#### `toReviewRecordInput(state: SchedulingState, grade: ReviewGrade, reviewDurationMs?: number)`

Convert scheduling state to database input.

```typescript
const dbInput = toReviewRecordInput(nextState, ReviewGrade.GOOD, 3500);
await ReviewRepository.updateAfterReview(cardId, dbInput);
```

#### `fromReviewRecord(record: DatabaseRecord): SchedulingState`

Convert database record to scheduling state.

```typescript
const dbRecord = await ReviewRepository.findByCardId(cardId);
const state = fromReviewRecord(dbRecord);
const nextState = scheduler.scheduleNextReview(state, ReviewGrade.GOOD);
```

## Complete Usage Example

### Create and Review a Card

```typescript
import {
  FSRSScheduler,
  ReviewGrade,
  toReviewRecordInput,
  fromReviewRecord,
} from './storage/schedule';
import { CardRepository } from './database/repositories/CardRepository';
import { ReviewRepository } from './database/repositories/ReviewRepository';

async function reviewCardFlow(cardId: string, userGrade: ReviewGrade) {
  const scheduler = new FSRSScheduler();

  // 1. Get card and review record from database
  const card = await CardRepository.findById(cardId);
  const reviewRecord = await ReviewRepository.findByCardId(cardId);

  // 2. Convert to scheduling state
  let state;
  if (!reviewRecord) {
    // New card - create initial state
    state = scheduler.scheduleNewCard();
    await ReviewRepository.create({ card_id: cardId });
  } else {
    // Existing card - load from database
    state = fromReviewRecord(reviewRecord);
  }

  // 3. Calculate next state based on user's rating
  const reviewTime = Date.now();
  const nextState = scheduler.scheduleNextReview(state, userGrade, reviewTime);

  // 4. Save to database
  const dbInput = toReviewRecordInput(nextState, userGrade, reviewTime - startTime);
  await ReviewRepository.updateAfterReview(cardId, dbInput);

  // 5. Return result
  return {
    nextReview: new Date(nextState.nextDueDate),
    intervalDays: nextState.intervalDays,
    stability: nextState.stability,
    difficulty: nextState.difficulty,
  };
}

// Example usage
const result = await reviewCardFlow('card-123', ReviewGrade.GOOD);
console.log(`Next review: ${result.nextReview.toLocaleDateString()}`);
console.log(`Interval: ${result.intervalDays.toFixed(1)} days`);
```

### Get Due Cards for Review

```typescript
import { CardRepository } from './database/repositories/CardRepository';
import { filterDueCards } from './storage/schedule';

async function getDueCards(deckId: string) {
  // Option 1: Use repository method (recommended)
  const dueCards = await CardRepository.findDueCards(deckId);

  // Option 2: Use helper function
  const allCards = await CardRepository.findByDeckIdWithReviews(deckId);
  const dueCardsFiltered = filterDueCards(allCards);

  return dueCards;
}

const cards = await getDueCards('deck-123');
console.log(`${cards.length} cards ready to review`);
```

### Preview Review Outcomes

```typescript
async function showReviewPreview(cardId: string) {
  const scheduler = new FSRSScheduler();
  const reviewRecord = await ReviewRepository.findByCardId(cardId);
  const state = fromReviewRecord(reviewRecord);

  const preview = scheduler.getSchedulingPreview(state);

  return {
    again: {
      interval: preview.again.intervalDays,
      due: new Date(preview.again.nextDueDate),
    },
    hard: {
      interval: preview.hard.intervalDays,
      due: new Date(preview.hard.nextDueDate),
    },
    good: {
      interval: preview.good.intervalDays,
      due: new Date(preview.good.nextDueDate),
    },
    easy: {
      interval: preview.easy.intervalDays,
      due: new Date(preview.easy.nextDueDate),
    },
  };
}

// Show user what will happen for each rating
const preview = await showReviewPreview('card-123');
console.log('Preview:');
console.log('AGAIN:', preview.again.interval.toFixed(1), 'days');
console.log('HARD:', preview.hard.interval.toFixed(1), 'days');
console.log('GOOD:', preview.good.interval.toFixed(1), 'days');
console.log('EASY:', preview.easy.interval.toFixed(1), 'days');
```

## Algorithm Comparison

### FSRS vs SM-2

| Feature | FSRS | SM-2 |
| ------- | ---- | ---- |
| **Efficiency** | 20-30% fewer reviews | Baseline |
| **Algorithm** | Advanced memory model | Simple exponential |
| **Parameters** | Stability, Difficulty, Retrievability | Ease Factor |
| **Adaptability** | Adjusts to individual patterns | Fixed formula |
| **Release** | 2022 | 1987 |
| **Recommended** | ✅ Yes | Legacy support |

**Example after 10 reviews:**

```typescript
const fsrsScheduler = new FSRSScheduler({ enableFSRS: true });
const sm2Scheduler = new FSRSScheduler({ enableFSRS: false });

let fsrsState = fsrsScheduler.scheduleNewCard();
let sm2State = sm2Scheduler.scheduleNewCard();

for (let i = 0; i < 10; i++) {
  fsrsState = fsrsScheduler.scheduleNextReview(fsrsState, ReviewGrade.GOOD);
  sm2State = sm2Scheduler.scheduleNextReview(sm2State, ReviewGrade.GOOD);
}

console.log('FSRS interval:', fsrsState.intervalDays, 'days');
console.log('SM-2 interval:', sm2State.intervalDays, 'days');
// FSRS typically has 20-30% longer intervals = fewer reviews needed
```

## Configuration Recommendations

### For Students (Exams)

High retention, shorter intervals:

```typescript
const studentScheduler = new FSRSScheduler({
  requestRetention: 0.95, // 95% retention
  learningSteps: [1, 5, 10], // Quick progression
});
```

### For Language Learning

Balanced retention:

```typescript
const languageScheduler = new FSRSScheduler({
  requestRetention: 0.90, // 90% retention (default)
  learningSteps: [1, 10, 30], // Gradual progression
  relearnSteps: [10, 30], // More relearning time
});
```

### For Long-term Knowledge

Lower retention, longer intervals:

```typescript
const longTermScheduler = new FSRSScheduler({
  requestRetention: 0.85, // 85% retention
  maximumInterval: 365 * 5, // 5 years max
});
```

## Testing

Run the comprehensive test suite:

```bash
npm test src/storage/schedule.test.ts
```

Tests cover:

- ✅ FSRS scheduling logic
- ✅ SM-2 algorithm
- ✅ Learning steps
- ✅ Review progression
- ✅ Edge cases
- ✅ Integration with database
- ✅ Helper functions

## Performance Notes

- **Memory**: Minimal overhead, state objects are ~200 bytes
- **CPU**: O(1) scheduling calculations
- **Database**: Single update per review
- **Offline**: Works completely offline

## References

- [FSRS Algorithm Paper](https://github.com/open-spaced-repetition/fsrs4anki/wiki)
- [FSRS npm Package](https://github.com/open-spaced-repetition/ts-fsrs)
- [SuperMemo SM-2 Algorithm](https://www.supermemo.com/en/archives1990-2015/english/ol/sm2)
- [Spaced Repetition Research](https://en.wikipedia.org/wiki/Spaced_repetition)

## Migration from SM-2

To compare FSRS vs SM-2 side-by-side:

```typescript
// Run both schedulers in parallel
const fsrs = new FSRSScheduler({ enableFSRS: true });
const sm2 = new FSRSScheduler({ enableFSRS: false });

// Compare results
const fsrsState = fsrs.scheduleNextReview(state, grade);
const sm2State = sm2.scheduleNextReview(state, grade);

console.log('FSRS:', fsrsState.intervalDays, 'days');
console.log('SM-2:', sm2State.intervalDays, 'days');
```

Once confident, switch to FSRS exclusively:

```typescript
// Production config
const scheduler = new FSRSScheduler(); // FSRS enabled by default
```

## Troubleshooting

### Cards have very short intervals

- Increase `requestRetention` (more reviews)
- Check if cards are being rated AGAIN frequently

### Cards have very long intervals

- Decrease `requestRetention` (fewer reviews)
- Check if cards are being rated EASY frequently

### Learning steps not working

- Verify `learningSteps` configuration
- Check card state is NEW or LEARNING
- Ensure grades are GOOD or AGAIN for progression

## License

MIT
