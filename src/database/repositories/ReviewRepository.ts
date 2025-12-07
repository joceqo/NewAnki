/**
 * Review Repository - Drizzle ORM
 */

import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { getDatabase, generateUUID, getCurrentTimestamp } from '../db-drizzle';
import { reviewRecord, card } from '../schema';
import type {
  CreateReviewRecordInput,
  UpdateReviewRecordInput,
  ReviewHistory,
  ReviewStats,
} from '../../models/ReviewRecord';

export class ReviewRepository {
  /**
   * Create a new review record (first review of a card)
   */
  static async create(input: CreateReviewRecordInput) {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    const newRecord = {
      id: generateUUID(),
      cardId: input.card_id,
      intervalDays: 0,
      nextDueDate: now,
      stability: 0,
      difficulty: 5,
      retrievabilityEstimate: 0,
      easeFactor: 2.5,
      history: [],
      totalReviews: 0,
      lapseCount: 0,
      lastReviewAt: null,
      createdAt: now,
      modifiedAt: now,
      isDeleted: false,
    };

    await db.insert(reviewRecord).values(newRecord);
    return newRecord;
  }

  /**
   * Find review record by card ID
   */
  static async findByCardId(cardId: string) {
    const db = getDatabase();

    const result = await db
      .select()
      .from(reviewRecord)
      .where(and(eq(reviewRecord.cardId, cardId), eq(reviewRecord.isDeleted, false)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find review record by ID
   */
  static async findById(id: string) {
    const db = getDatabase();

    const result = await db
      .select()
      .from(reviewRecord)
      .where(and(eq(reviewRecord.id, id), eq(reviewRecord.isDeleted, false)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Update review record after a review
   */
  static async updateAfterReview(cardId: string, input: UpdateReviewRecordInput) {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    const existing = await this.findByCardId(cardId);
    if (!existing) {
      return null;
    }

    // Calculate elapsed days
    const elapsedDays = existing.lastReviewAt
      ? (now - existing.lastReviewAt) / (1000 * 60 * 60 * 24)
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

    const newHistory = [...(existing.history || []), historyEntry];
    const newLapseCount = input.grade === 1 ? existing.lapseCount + 1 : existing.lapseCount;

    await db
      .update(reviewRecord)
      .set({
        intervalDays: input.interval_days,
        nextDueDate: input.next_due_date,
        stability: input.stability,
        difficulty: input.difficulty,
        retrievabilityEstimate: input.retrievability_estimate,
        history: newHistory,
        totalReviews: existing.totalReviews + 1,
        lapseCount: newLapseCount,
        lastReviewAt: now,
        modifiedAt: now,
      })
      .where(eq(reviewRecord.cardId, cardId));

    return this.findByCardId(cardId);
  }

  /**
   * Get review statistics
   */
  static async getStats(deckId?: string): Promise<ReviewStats> {
    const db = getDatabase();
    const now = getCurrentTimestamp();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    // Total cards
    const totalCardConditions = deckId
      ? and(eq(card.isDeleted, false), eq(card.deckId, deckId))
      : eq(card.isDeleted, false);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(card)
      .where(totalCardConditions);

    const totalCards = totalResult?.count || 0;

    // Due today
    const dueConditions = deckId
      ? and(
          eq(card.isDeleted, false),
          eq(card.deckId, deckId),
          sql`(${reviewRecord.nextDueDate} IS NULL OR ${reviewRecord.nextDueDate} <= ${now})`
        )
      : and(
          eq(card.isDeleted, false),
          sql`(${reviewRecord.nextDueDate} IS NULL OR ${reviewRecord.nextDueDate} <= ${now})`
        );

    const [dueResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(card)
      .leftJoin(
        reviewRecord,
        and(eq(reviewRecord.cardId, card.id), eq(reviewRecord.isDeleted, false))
      )
      .where(dueConditions);

    const dueToday = dueResult?.count || 0;

    // Reviewed today
    if (deckId) {
      const [reviewedResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(reviewRecord)
        .innerJoin(card, eq(card.id, reviewRecord.cardId))
        .where(
          and(
            eq(reviewRecord.isDeleted, false),
            sql`${reviewRecord.lastReviewAt} >= ${todayStartMs}`,
            eq(card.deckId, deckId)
          )
        );

      var reviewedToday = reviewedResult?.count || 0;
    } else {
      const [reviewedResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(reviewRecord)
        .where(
          and(
            eq(reviewRecord.isDeleted, false),
            sql`${reviewRecord.lastReviewAt} >= ${todayStartMs}`
          )
        );

      var reviewedToday = reviewedResult?.count || 0;
    }

    // Success rate (percentage of Good/Easy reviews)
    const [successResult] = await db
      .select({
        rate: sql<number>`AVG(CASE WHEN json_extract(${reviewRecord.history}, '$[#-1].grade') >= 3 THEN 1.0 ELSE 0.0 END)`,
      })
      .from(reviewRecord)
      .where(
        and(
          eq(reviewRecord.isDeleted, false),
          sql`${reviewRecord.totalReviews} > 0`
        )
      );

    const successRate = (successResult?.rate || 0) * 100;

    // Average interval
    const [avgResult] = await db
      .select({
        avg: sql<number>`AVG(${reviewRecord.intervalDays})`,
      })
      .from(reviewRecord)
      .where(
        and(
          eq(reviewRecord.isDeleted, false),
          sql`${reviewRecord.totalReviews} > 0`
        )
      );

    const averageInterval = avgResult?.avg || 0;

    // Streaks (simplified calculation)
    const currentStreak = await this.calculateCurrentStreak();
    const longestStreak = await this.calculateLongestStreak();

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
  private static async calculateCurrentStreak(): Promise<number> {
    const db = getDatabase();

    const dates = await db
      .selectDistinct({
        reviewDate: sql<string>`date(${reviewRecord.lastReviewAt} / 1000, 'unixepoch')`,
      })
      .from(reviewRecord)
      .where(
        and(
          sql`${reviewRecord.lastReviewAt} IS NOT NULL`,
          eq(reviewRecord.isDeleted, false)
        )
      )
      .orderBy(desc(sql`date(${reviewRecord.lastReviewAt} / 1000, 'unixepoch')`))
      .limit(365);

    if (dates.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < dates.length; i++) {
      const reviewDate = new Date(dates[i].reviewDate);
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
  private static async calculateLongestStreak(): Promise<number> {
    const db = getDatabase();

    const dates = await db
      .selectDistinct({
        reviewDate: sql<string>`date(${reviewRecord.lastReviewAt} / 1000, 'unixepoch')`,
      })
      .from(reviewRecord)
      .where(
        and(
          sql`${reviewRecord.lastReviewAt} IS NOT NULL`,
          eq(reviewRecord.isDeleted, false)
        )
      )
      .orderBy(sql`date(${reviewRecord.lastReviewAt} / 1000, 'unixepoch')`);

    if (dates.length === 0) return 0;

    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < dates.length; i++) {
      const prevDate = new Date(dates[i - 1].reviewDate);
      const currDate = new Date(dates[i].reviewDate);
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
    const db = getDatabase();
    const now = getCurrentTimestamp();

    await db
      .update(reviewRecord)
      .set({ isDeleted: true, modifiedAt: now })
      .where(eq(reviewRecord.id, id));

    // Verify deletion by checking if record exists
    const deleted = await this.findById(id);
    return deleted === null;
  }
}
