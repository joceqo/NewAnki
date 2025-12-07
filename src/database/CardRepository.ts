/**
 * CRUD operations for Card model
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
  Card,
  CardType,
  CardContent,
  CardMetadata,
  CreateCardInput,
  UpdateCardInput,
  CardWithReview,
} from '../models/Card';

export class CardRepository {
  /**
   * Create a new card
   */
  static async create(input: CreateCardInput): Promise<Card> {
    const now = getCurrentTimestamp();
    const card: Card = {
      id: generateUUID(),
      deck_id: input.deck_id,
      type: input.type,
      content: input.content,
      metadata: input.metadata ?? {},
      created_at: now,
      modified_at: now,
      is_deleted: false,
    };

    executeRaw(
      `INSERT INTO card (id, deck_id, type, content, metadata, created_at, modified_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.id,
        card.deck_id,
        card.type,
        JSON.stringify(card.content),
        JSON.stringify(card.metadata),
        card.created_at,
        card.modified_at,
        card.is_deleted ? 1 : 0,
      ]
    );

    return card;
  }

  /**
   * Find card by ID
   */
  static async findById(id: string): Promise<Card | null> {
    const row = queryFirst<any>(
      'SELECT * FROM card WHERE id = ? AND is_deleted = 0',
      [id]
    );

    return row ? this.mapRowToCard(row) : null;
  }

  /**
   * Find all cards in a deck
   */
  static async findByDeckId(deckId: string): Promise<Card[]> {
    const rows = query<any>(
      'SELECT * FROM card WHERE deck_id = ? AND is_deleted = 0 ORDER BY created_at DESC',
      [deckId]
    );

    return rows.map(this.mapRowToCard);
  }

  /**
   * Find cards with review information
   */
  static async findByDeckIdWithReviews(deckId: string): Promise<CardWithReview[]> {
    const rows = query<any>(
      `SELECT * FROM v_cards_with_reviews
       WHERE deck_id = ?
       ORDER BY
         CASE WHEN is_due = 1 THEN 0 ELSE 1 END,
         next_due_date ASC NULLS FIRST`,
      [deckId]
    );

    return rows.map(this.mapRowToCardWithReview);
  }

  /**
   * Find due cards for review
   */
  static async findDueCards(deckId?: string): Promise<CardWithReview[]> {
    const now = getCurrentTimestamp();

    if (deckId) {
      const rows = query<any>(
        `SELECT * FROM v_cards_with_reviews
         WHERE deck_id = ? AND is_due = 1
         ORDER BY next_due_date ASC NULLS FIRST`,
        [deckId]
      );
      return rows.map(this.mapRowToCardWithReview);
    } else {
      const rows = query<any>(
        `SELECT * FROM v_cards_with_reviews
         WHERE is_due = 1
         ORDER BY next_due_date ASC NULLS FIRST`
      );
      return rows.map(this.mapRowToCardWithReview);
    }
  }

  /**
   * Find new cards (never reviewed)
   */
  static async findNewCards(deckId?: string): Promise<CardWithReview[]> {
    if (deckId) {
      const rows = query<any>(
        `SELECT c.*, NULL as next_due_date, NULL as interval_days, NULL as total_reviews, NULL as last_review_at, 1 as is_due
         FROM card c
         LEFT JOIN review_record r ON c.id = r.card_id AND r.is_deleted = 0
         WHERE c.deck_id = ? AND c.is_deleted = 0 AND r.id IS NULL
         ORDER BY c.created_at ASC`,
        [deckId]
      );
      return rows.map(this.mapRowToCardWithReview);
    } else {
      const rows = query<any>(
        `SELECT c.*, NULL as next_due_date, NULL as interval_days, NULL as total_reviews, NULL as last_review_at, 1 as is_due
         FROM card c
         LEFT JOIN review_record r ON c.id = r.card_id AND r.is_deleted = 0
         WHERE c.is_deleted = 0 AND r.id IS NULL
         ORDER BY c.created_at ASC`
      );
      return rows.map(this.mapRowToCardWithReview);
    }
  }

  /**
   * Update card
   */
  static async update(id: string, input: UpdateCardInput): Promise<Card | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const now = getCurrentTimestamp();
    const updates: string[] = [];
    const params: any[] = [];

    if (input.type !== undefined) {
      updates.push('type = ?');
      params.push(input.type);
    }
    if (input.content !== undefined) {
      updates.push('content = ?');
      params.push(JSON.stringify(input.content));
    }
    if (input.metadata !== undefined) {
      const mergedMetadata = { ...existing.metadata, ...input.metadata };
      updates.push('metadata = ?');
      params.push(JSON.stringify(mergedMetadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('modified_at = ?');
    params.push(now);
    params.push(id);

    executeRaw(
      `UPDATE card SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  /**
   * Soft delete card
   */
  static async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    softDelete('card', id);
    return true;
  }

  /**
   * Count cards in a deck
   */
  static async countByDeckId(deckId: string): Promise<number> {
    const result = queryFirst<{ count: number }>(
      'SELECT COUNT(*) as count FROM card WHERE deck_id = ? AND is_deleted = 0',
      [deckId]
    );
    return result?.count || 0;
  }

  /**
   * Count due cards in a deck
   */
  static async countDueByDeckId(deckId: string): Promise<number> {
    const now = getCurrentTimestamp();
    const result = queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM v_cards_with_reviews
       WHERE deck_id = ? AND is_due = 1`,
      [deckId]
    );
    return result?.count || 0;
  }

  /**
   * Search cards by content
   */
  static async search(searchTerm: string, deckId?: string): Promise<Card[]> {
    if (deckId) {
      const rows = query<any>(
        `SELECT * FROM card
         WHERE deck_id = ? AND is_deleted = 0 AND content LIKE ?
         ORDER BY created_at DESC`,
        [deckId, `%${searchTerm}%`]
      );
      return rows.map(this.mapRowToCard);
    } else {
      const rows = query<any>(
        `SELECT * FROM card
         WHERE is_deleted = 0 AND content LIKE ?
         ORDER BY created_at DESC`,
        [`%${searchTerm}%`]
      );
      return rows.map(this.mapRowToCard);
    }
  }

  /**
   * Map database row to Card model
   */
  private static mapRowToCard(row: any): Card {
    return {
      id: row.id,
      deck_id: row.deck_id,
      type: row.type as CardType,
      content: JSON.parse(row.content) as CardContent,
      metadata: JSON.parse(row.metadata || '{}') as CardMetadata,
      created_at: row.created_at,
      modified_at: row.modified_at,
      is_deleted: Boolean(row.is_deleted),
    };
  }

  /**
   * Map database row to CardWithReview model
   */
  private static mapRowToCardWithReview(row: any): CardWithReview {
    return {
      ...this.mapRowToCard(row),
      next_due_date: row.next_due_date,
      interval_days: row.interval_days,
      is_due: Boolean(row.is_due),
    };
  }
}
