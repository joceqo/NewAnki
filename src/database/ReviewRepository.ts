/**
 * CRUD operations for ReviewRecord model
 */

import {
  query,
  queryFirst,
  executeRaw,
  generateUUID,
  getCurrentTimestamp,
  softDelete,
} from './db';
import type {
  ReviewRecord,
  ReviewGrade,
  ReviewHistory,
  CreateReviewRecordInput,
  UpdateReviewRecordInput,
  ReviewStats,
} from '../models/ReviewRecord';

export class ReviewRepository {
  /**
   * Create a new review record (first review of a card)
   */
  static async create(input: CreateReviewRecordInput): Promise<ReviewRecord> {
    const now = getCurrentTimestamp();

    // Initial FSRS parameters for new cards
    const record: ReviewRecord = {
      id: generateUUID(),
      card_id: input.card_id,
      interval_days: 0,
      next_due_date: now, // Due immediately
      stability: 0,
      difficulty: 5, // Default FSRS difficulty
      retrievability_estimate: 0,
      ease_factor: 2.5, // Default SM-2 ease
      history: [],
      total_reviews: 0,
      lapse_count: 0,
      last_review_at: null,
      created_at: now,
      modified_at: now,
      is_deleted: false,
    };

    executeRaw(
      `INSERT INTO review_record (
        id, card_id, interval_days, next_due_date, stability, difficulty,
        retrievability_estimate, ease_factor, history, total_reviews,
        lapse_count, last_review_at, created_at, modified_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.card_id,
        record.interval_days,
        record.next_due_date,
        record.stability,
        record.difficulty,
        record.retrievability_estimate,
        record.ease_factor,
        JSON.stringify(record.history),
        record.total_reviews,
        record.lapse_count,
        record.last_review_at,
        record.created_at,
        record.modified_at,
        record.is_deleted ? 1 : 0,
      ]
    );

    return record;
  }

  /**
   * Find review record by card ID
   */
  static async findByCardId(cardId: string): Promise<ReviewRecord | null> {
    const row = queryFirst<any>(
      'SELECT * FROM review_record WHERE card_id = ? AND is_deleted = 0',
      [cardId]
    );

    return row ? this.mapRowToReviewRecord(row) : null;
  }

  /**
   * Find review record by ID
   */
  static async findById(id: string): Promise<ReviewRecord | null> {
    const row = queryFirst<any>(
      'SELECT * FROM review_record WHERE id = ? AND is_deleted = 0',
      [id]
    );

    return row ? this.mapRowToReviewRecord(row) : null;
  }

  /**
   * Update review record after a review
   */
  static async updateAfterReview(
    cardId: string,
    input: UpdateReviewRecordInput
  ): Promise<ReviewRecord | null> {
    const existing = await this.findByCardId(cardId);
    if (!existing) {
      return null;
    }

    const now = getCurrentTimestamp();

    // Calculate elapsed days since last review
    const elapsedDays = existing.last_review_at
      ? (now - existing.last_review_at) / (1000 * 60 * 60 * 24)
      : 0;

    // Create new history entry
    const historyEntry: ReviewHistory = {
      timestamp: now,
      grade: input.grade,
      interval_days: input.interval_days,
      elapsed_days: elapsedDays,
      stability: input.stability,
      difficulty: input.difficulty,
      review_duration_ms: input.review_duration_ms,
    };

    const newHistory = [...existing.history, historyEntry];
    const newLapseCount =
      input.grade === 1 ? existing.lapse_count + 1 : existing.lapse_count;

    executeRaw(
      `UPDATE review_record SET
        interval_days = ?,
        next_due_date = ?,
        stability = ?,
        difficulty = ?,
        retrievability_estimate = ?,
        history = ?,
        total_reviews = total_reviews + 1,
        lapse_count = ?,
        last_review_at = ?,
        modified_at = ?
       WHERE card_id = ?`,
      [
        input.interval_days,
        input.next_due_date,
        input.stability,
        input.difficulty,
        input.retrievability_estimate,
        JSON.stringify(newHistory),
        newLapseCount,
        now,
        now,
        cardId,
      ]
    );

    return this.findByCardId(cardId);
  }

  /**
   * Get review statistics for a deck or all cards
   */
  static async getStats(deckId?: string): Promise<ReviewStats> {
    const now = getCurrentTimestamp();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    let totalCards = 0;
    let dueToday = 0;
    let reviewedToday = 0;

    if (deckId) {
      const totalResult = queryFirst<{ count: number }>(
        `SELECT COUNT(*) as count FROM card
         WHERE deck_id = ? AND is_deleted = 0`,
        [deckId]
      );
      totalCards = totalResult?.count || 0;

      const dueResult = queryFirst<{ count: number }>(
        `SELECT COUNT(*) as count FROM v_cards_with_reviews
         WHERE deck_id = ? AND is_due = 1`,
        [deckId]
      );
      dueToday = dueResult?.count || 0;

      const reviewedResult = queryFirst<{ count: number }>(
        `SELECT COUNT(*) as count FROM review_record r
         JOIN card c ON r.card_id = c.id
         WHERE c.deck_id = ? AND r.last_review_at >= ? AND r.is_deleted = 0`,
        [deckId, todayStartMs]
      );
      reviewedToday = reviewedResult?.count || 0;
    } else {
      const totalResult = queryFirst<{ count: number }>(
        'SELECT COUNT(*) as count FROM card WHERE is_deleted = 0'
      );
      totalCards = totalResult?.count || 0;

      const dueResult = queryFirst<{ count: number }>(
        'SELECT COUNT(*) as count FROM v_cards_with_reviews WHERE is_due = 1'
      );
      dueToday = dueResult?.count || 0;

      const reviewedResult = queryFirst<{ count: number }>(
        `SELECT COUNT(*) as count FROM review_record
         WHERE last_review_at >= ? AND is_deleted = 0`,
        [todayStartMs]
      );
      reviewedToday = reviewedResult?.count || 0;
    }

    // Calculate success rate
    const successResult = queryFirst<{ success_rate: number }>(
      `SELECT AVG(
         CASE WHEN json_extract(history, '$[#-1].grade') >= 3 THEN 1.0 ELSE 0.0 END
       ) as success_rate
       FROM review_record
       WHERE total_reviews > 0 AND is_deleted = 0`
    );
    const successRate = (successResult?.success_rate || 0) * 100;

    // Calculate average interval
    const avgResult = queryFirst<{ avg_interval: number }>(
      `SELECT AVG(interval_days) as avg_interval
       FROM review_record
       WHERE total_reviews > 0 AND is_deleted = 0`
    );
    const averageInterval = avgResult?.avg_interval || 0;

    // Calculate streaks (simplified - counts consecutive days with reviews)
    const currentStreak = this.calculateCurrentStreak();
    const longestStreak = this.calculateLongestStreak();

    return {
      total_cards: totalCards,
      due_today: dueToday,
      reviewed_today: reviewedToday,
      success_rate: successRate,
      average_interval: averageInterval,
      longest_streak: longestStreak,
      current_streak: currentStreak,
    };
  }

  /**
   * Calculate current streak of consecutive review days
   */
  private static calculateCurrentStreak(): number {
    const rows = query<{ review_date: string }>(
      `SELECT DISTINCT date(last_review_at / 1000, 'unixepoch') as review_date
       FROM review_record
       WHERE last_review_at IS NOT NULL AND is_deleted = 0
       ORDER BY review_date DESC
       LIMIT 365`
    );

    if (rows.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < rows.length; i++) {
      const reviewDate = new Date(rows[i].review_date);
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);
      expectedDate.setHours(0, 0, 0, 0);

      if (reviewDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Calculate longest streak of consecutive review days
   */
  private static calculateLongestStreak(): number {
    const rows = query<{ review_date: string }>(
      `SELECT DISTINCT date(last_review_at / 1000, 'unixepoch') as review_date
       FROM review_record
       WHERE last_review_at IS NOT NULL AND is_deleted = 0
       ORDER BY review_date ASC`
    );

    if (rows.length === 0) return 0;

    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < rows.length; i++) {
      const prevDate = new Date(rows[i - 1].review_date);
      const currDate = new Date(rows[i].review_date);
      const diffDays = Math.floor(
        (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    return maxStreak;
  }

  /**
   * Soft delete review record
   */
  static async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    softDelete('review_record', id);
    return true;
  }

  /**
   * Map database row to ReviewRecord model
   */
  private static mapRowToReviewRecord(row: any): ReviewRecord {
    return {
      id: row.id,
      card_id: row.card_id,
      interval_days: row.interval_days,
      next_due_date: row.next_due_date,
      stability: row.stability,
      difficulty: row.difficulty,
      retrievability_estimate: row.retrievability_estimate,
      ease_factor: row.ease_factor,
      history: JSON.parse(row.history || '[]') as ReviewHistory[],
      total_reviews: row.total_reviews,
      lapse_count: row.lapse_count,
      last_review_at: row.last_review_at,
      created_at: row.created_at,
      modified_at: row.modified_at,
      is_deleted: Boolean(row.is_deleted),
    };
  }
}
