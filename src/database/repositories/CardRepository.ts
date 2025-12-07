/**
 * Card Repository - Drizzle ORM
 */

import { eq, and, desc, asc, sql, isNull, or } from 'drizzle-orm';
import { getDatabase, generateUUID, getCurrentTimestamp } from '../db-drizzle';
import { card, reviewRecord } from '../schema';
import type { CreateCardInput, UpdateCardInput } from '../../models/Card';

export class CardRepository {
  /**
   * Create a new card
   */
  static async create(input: CreateCardInput) {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    const newCard = {
      id: generateUUID(),
      deckId: input.deck_id,
      type: input.type,
      content: input.content,
      metadata: input.metadata ?? {},
      createdAt: now,
      modifiedAt: now,
      isDeleted: false,
    };

    await db.insert(card).values(newCard);
    return newCard;
  }

  /**
   * Find card by ID
   */
  static async findById(id: string) {
    const db = getDatabase();

    const result = await db
      .select()
      .from(card)
      .where(and(eq(card.id, id), eq(card.isDeleted, false)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find all cards in a deck
   */
  static async findByDeckId(deckId: string) {
    const db = getDatabase();

    return await db
      .select()
      .from(card)
      .where(and(eq(card.deckId, deckId), eq(card.isDeleted, false)))
      .orderBy(desc(card.createdAt));
  }

  /**
   * Find cards with review information
   */
  static async findByDeckIdWithReviews(deckId: string) {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    return await db
      .select({
        id: card.id,
        deckId: card.deckId,
        type: card.type,
        content: card.content,
        metadata: card.metadata,
        createdAt: card.createdAt,
        modifiedAt: card.modifiedAt,
        isDeleted: card.isDeleted,
        nextDueDate: reviewRecord.nextDueDate,
        intervalDays: reviewRecord.intervalDays,
        totalReviews: reviewRecord.totalReviews,
        lastReviewAt: reviewRecord.lastReviewAt,
        isDue: sql<boolean>`CASE
          WHEN ${reviewRecord.nextDueDate} IS NULL THEN 1
          WHEN ${reviewRecord.nextDueDate} <= ${now} THEN 1
          ELSE 0
        END`.as('is_due'),
      })
      .from(card)
      .leftJoin(
        reviewRecord,
        and(eq(reviewRecord.cardId, card.id), eq(reviewRecord.isDeleted, false))
      )
      .where(and(eq(card.deckId, deckId), eq(card.isDeleted, false)))
      .orderBy(
        sql`CASE WHEN is_due = 1 THEN 0 ELSE 1 END`,
        asc(reviewRecord.nextDueDate)
      );
  }

  /**
   * Find due cards for review
   */
  static async findDueCards(deckId?: string) {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    const conditions = [eq(card.isDeleted, false)];

    if (deckId) {
      conditions.push(eq(card.deckId, deckId));
    }

    return await db
      .select({
        id: card.id,
        deckId: card.deckId,
        type: card.type,
        content: card.content,
        metadata: card.metadata,
        createdAt: card.createdAt,
        modifiedAt: card.modifiedAt,
        isDeleted: card.isDeleted,
        nextDueDate: reviewRecord.nextDueDate,
        intervalDays: reviewRecord.intervalDays,
        isDue: sql<boolean>`1`.as('is_due'),
      })
      .from(card)
      .leftJoin(
        reviewRecord,
        and(eq(reviewRecord.cardId, card.id), eq(reviewRecord.isDeleted, false))
      )
      .where(
        and(
          ...conditions,
          or(
            isNull(reviewRecord.nextDueDate),
            sql`${reviewRecord.nextDueDate} <= ${now}`
          )
        )
      )
      .orderBy(asc(reviewRecord.nextDueDate));
  }

  /**
   * Find new cards (never reviewed)
   */
  static async findNewCards(deckId?: string) {
    const db = getDatabase();

    const conditions = [eq(card.isDeleted, false), isNull(reviewRecord.id)];

    if (deckId) {
      conditions.push(eq(card.deckId, deckId));
    }

    return await db
      .select({
        id: card.id,
        deckId: card.deckId,
        type: card.type,
        content: card.content,
        metadata: card.metadata,
        createdAt: card.createdAt,
        modifiedAt: card.modifiedAt,
        isDeleted: card.isDeleted,
        nextDueDate: sql<number | null>`NULL`.as('next_due_date'),
        intervalDays: sql<number | null>`NULL`.as('interval_days'),
        isDue: sql<boolean>`1`.as('is_due'),
      })
      .from(card)
      .leftJoin(
        reviewRecord,
        and(eq(reviewRecord.cardId, card.id), eq(reviewRecord.isDeleted, false))
      )
      .where(and(...conditions))
      .orderBy(asc(card.createdAt));
  }

  /**
   * Update card
   */
  static async update(id: string, input: UpdateCardInput) {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: any = { modifiedAt: now };

    if (input.type !== undefined) updates.type = input.type;
    if (input.content !== undefined) updates.content = input.content;
    if (input.metadata !== undefined) {
      // Merge metadata objects
      const existingMetadata = existing.metadata || {};
      const newMetadata = input.metadata || {};
      updates.metadata = { ...existingMetadata, ...newMetadata };
    }

    await db.update(card).set(updates).where(eq(card.id, id));

    return this.findById(id);
  }

  /**
   * Soft delete card
   */
  static async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    await db
      .update(card)
      .set({ isDeleted: true, modifiedAt: now })
      .where(eq(card.id, id));

    // Verify deletion by checking if record exists
    const deleted = await this.findById(id);
    return deleted === null;
  }

  /**
   * Count cards in a deck
   */
  static async countByDeckId(deckId: string): Promise<number> {
    const db = getDatabase();

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(card)
      .where(and(eq(card.deckId, deckId), eq(card.isDeleted, false)));

    return result[0]?.count || 0;
  }

  /**
   * Count due cards in a deck
   */
  static async countDueByDeckId(deckId: string): Promise<number> {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(card)
      .leftJoin(
        reviewRecord,
        and(eq(reviewRecord.cardId, card.id), eq(reviewRecord.isDeleted, false))
      )
      .where(
        and(
          eq(card.deckId, deckId),
          eq(card.isDeleted, false),
          or(
            isNull(reviewRecord.nextDueDate),
            sql`${reviewRecord.nextDueDate} <= ${now}`
          )
        )
      );

    return result[0]?.count || 0;
  }

  /**
   * Search cards by content
   */
  static async search(searchTerm: string, deckId?: string) {
    const db = getDatabase();

    const conditions = [
      eq(card.isDeleted, false),
      sql`${card.content} LIKE ${'%' + searchTerm + '%'}`,
    ];

    if (deckId) {
      conditions.push(eq(card.deckId, deckId));
    }

    return await db
      .select()
      .from(card)
      .where(and(...conditions))
      .orderBy(desc(card.createdAt));
  }
}
