/**
 * ReviewRecord model - tracks FSRS scheduling state and review history
 * Compatible with FSRS algorithm (ts-fsrs package)
 */

export enum ReviewGrade {
  AGAIN = 1, // Failed, needs immediate review
  HARD = 2, // Difficult, shorter interval
  GOOD = 3, // Correct, normal interval
  EASY = 4, // Too easy, longer interval
}

export interface ReviewRecord {
  id: string; // UUID v4
  card_id: string; // Foreign key to Card

  // FSRS scheduling parameters
  interval_days: number; // Days until next review
  next_due_date: number; // Unix timestamp (ms) when card is due
  stability: number; // FSRS stability parameter
  difficulty: number; // FSRS difficulty parameter (0-10)
  retrievability_estimate: number; // Estimated probability of recall (0-1)

  // SM-2 compatibility (legacy, optional)
  ease_factor: number; // Ease factor for SM-2 algorithm

  // Review history
  history: ReviewHistory[]; // JSON array of past reviews

  // Tracking
  total_reviews: number; // Count of all reviews
  lapse_count: number; // Number of times card was forgotten
  last_review_at: number | null; // Unix timestamp of last review
  created_at: number; // Unix timestamp when card first reviewed
  modified_at: number; // Unix timestamp of last update
  is_deleted: boolean; // Soft delete flag
}

export interface ReviewHistory {
  timestamp: number; // Unix timestamp (ms)
  grade: ReviewGrade; // User rating
  interval_days: number; // Interval at time of review
  elapsed_days: number; // Actual days since last review
  stability: number; // FSRS stability after review
  difficulty: number; // FSRS difficulty after review
  review_duration_ms?: number; // Time taken to review (optional)
}

// Input for creating new review record (first review of card)
export interface CreateReviewRecordInput {
  card_id: string;
  grade: ReviewGrade;
  review_duration_ms?: number;
}

// Input for updating review record after review
export interface UpdateReviewRecordInput {
  grade: ReviewGrade;
  review_duration_ms?: number;
  next_due_date: number;
  interval_days: number;
  stability: number;
  difficulty: number;
  retrievability_estimate: number;
}

// FSRS state for calculating next review
export interface FSRSState {
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number; // Number of reviews
  lapses: number; // Number of lapses
  state: CardState; // Learning state
  last_review?: number; // Unix timestamp
}

export enum CardState {
  NEW = 0, // Never reviewed
  LEARNING = 1, // In learning phase
  REVIEW = 2, // In review phase
  RELEARNING = 3, // Relearning after lapse
}

// Statistics aggregated from review records
export interface ReviewStats {
  total_cards: number;
  due_today: number;
  reviewed_today: number;
  success_rate: number; // Percentage of Good/Easy reviews
  average_interval: number;
  longest_streak: number;
  current_streak: number;
}
