/**
 * Deck Repository - Drizzle ORM
 */

import { eq, and, like, desc, sql } from 'drizzle-orm';
import { getDatabase, generateUUID, getCurrentTimestamp } from '../db-drizzle';
import { deck, card, reviewRecord } from '../schema';
import type { CreateDeckInput, UpdateDeckInput } from '../../models/Deck';

export class DeckRepository {
  /**
   * Create a new deck
   */
  static async create(input: CreateDeckInput) {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    const newDeck = {
      id: generateUUID(),
      title: input.title,
      description: input.description ?? null,
      createdAt: now,
      modifiedAt: now,
      tags: input.tags ?? [],
      isPublic: input.is_public ?? false,
      isDeleted: false,
    };

    await db.insert(deck).values(newDeck);
    return newDeck;
  }

  /**
   * Find deck by ID
   */
  static async findById(id: string) {
    const db = getDatabase();

    const result = await db
      .select()
      .from(deck)
      .where(and(eq(deck.id, id), eq(deck.isDeleted, false)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find all active decks
   */
  static async findAll() {
    const db = getDatabase();

    return await db
      .select()
      .from(deck)
      .where(eq(deck.isDeleted, false))
      .orderBy(desc(deck.modifiedAt));
  }

  /**
   * Find all decks with card counts
   */
  static async findAllWithStats() {
    const db = getDatabase();

    return await db
      .select({
        id: deck.id,
        title: deck.title,
        description: deck.description,
        createdAt: deck.createdAt,
        modifiedAt: deck.modifiedAt,
        tags: deck.tags,
        isPublic: deck.isPublic,
        isDeleted: deck.isDeleted,
        cardCount: sql<number>`count(distinct ${card.id})`.as('card_count'),
        dueCount: sql<number>`count(distinct case when ${reviewRecord.nextDueDate} <= ${Date.now()} then ${card.id} end)`.as('due_count'),
      })
      .from(deck)
      .leftJoin(card, and(eq(card.deckId, deck.id), eq(card.isDeleted, false)))
      .leftJoin(
        reviewRecord,
        and(eq(reviewRecord.cardId, card.id), eq(reviewRecord.isDeleted, false))
      )
      .where(eq(deck.isDeleted, false))
      .groupBy(deck.id)
      .orderBy(desc(deck.modifiedAt));
  }

  /**
   * Update deck
   */
  static async update(id: string, input: UpdateDeckInput) {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    const updates: any = { modifiedAt: now };

    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.tags !== undefined) updates.tags = input.tags;
    if (input.is_public !== undefined) updates.isPublic = input.is_public;

    await db.update(deck).set(updates).where(eq(deck.id, id));

    return this.findById(id);
  }

  /**
   * Soft delete deck
   */
  static async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    await db
      .update(deck)
      .set({ isDeleted: true, modifiedAt: now })
      .where(eq(deck.id, id));

    // Verify deletion by checking if record exists
    const deleted = await this.findById(id);
    return deleted === null;
  }

  /**
   * Search decks by title or tags
   */
  static async search(searchTerm: string) {
    const db = getDatabase();

    return await db
      .select()
      .from(deck)
      .where(
        and(
          eq(deck.isDeleted, false),
          sql`(${deck.title} LIKE ${'%' + searchTerm + '%'} OR ${deck.tags} LIKE ${'%' + searchTerm + '%'})`
        )
      )
      .orderBy(desc(deck.modifiedAt));
  }

  /**
   * Find decks by tag
   */
  static async findByTag(tag: string) {
    const db = getDatabase();

    return await db
      .select()
      .from(deck)
      .where(
        and(
          eq(deck.isDeleted, false),
          like(deck.tags, `%"${tag}"%`)
        )
      )
      .orderBy(desc(deck.modifiedAt));
  }
}
