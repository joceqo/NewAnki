/**
 * CRUD operations for Deck model
 */

import {
  query,
  queryFirst,
  executeRaw,
  generateUUID,
  getCurrentTimestamp,
  softDelete,
  withTransaction,
} from './db';
import type {
  Deck,
  CreateDeckInput,
  UpdateDeckInput,
  DeckWithCardCount,
} from '../models/Deck';

export class DeckRepository {
  /**
   * Create a new deck
   */
  static async create(input: CreateDeckInput): Promise<Deck> {
    const now = getCurrentTimestamp();
    const deck: Deck = {
      id: generateUUID(),
      title: input.title,
      description: input.description ?? null,
      created_at: now,
      modified_at: now,
      tags: input.tags ?? [],
      is_public: input.is_public ?? false,
      is_deleted: false,
    };

    executeRaw(
      `INSERT INTO deck (id, title, description, created_at, modified_at, tags, is_public, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deck.id,
        deck.title,
        deck.description,
        deck.created_at,
        deck.modified_at,
        JSON.stringify(deck.tags),
        deck.is_public ? 1 : 0,
        deck.is_deleted ? 1 : 0,
      ]
    );

    return deck;
  }

  /**
   * Find deck by ID
   */
  static async findById(id: string): Promise<Deck | null> {
    const row = queryFirst<any>(
      'SELECT * FROM deck WHERE id = ? AND is_deleted = 0',
      [id]
    );

    return row ? this.mapRowToDeck(row) : null;
  }

  /**
   * Find all active decks
   */
  static async findAll(): Promise<Deck[]> {
    const rows = query<any>(
      'SELECT * FROM deck WHERE is_deleted = 0 ORDER BY modified_at DESC'
    );

    return rows.map(this.mapRowToDeck);
  }

  /**
   * Find all decks with card counts
   */
  static async findAllWithStats(): Promise<DeckWithCardCount[]> {
    const rows = query<any>(`
      SELECT * FROM v_deck_stats
      ORDER BY modified_at DESC
    `);

    return rows.map((row) => ({
      ...this.mapRowToDeck(row),
      card_count: row.total_cards || 0,
      due_count: row.due_count || 0,
    }));
  }

  /**
   * Update deck
   */
  static async update(id: string, input: UpdateDeckInput): Promise<Deck | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const now = getCurrentTimestamp();
    const updates: string[] = [];
    const params: any[] = [];

    if (input.title !== undefined) {
      updates.push('title = ?');
      params.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      params.push(input.description);
    }
    if (input.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(input.tags));
    }
    if (input.is_public !== undefined) {
      updates.push('is_public = ?');
      params.push(input.is_public ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('modified_at = ?');
    params.push(now);
    params.push(id);

    executeRaw(
      `UPDATE deck SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  /**
   * Soft delete deck
   */
  static async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    softDelete('deck', id);
    return true;
  }

  /**
   * Search decks by title or tags
   */
  static async search(searchTerm: string): Promise<Deck[]> {
    const rows = query<any>(
      `SELECT * FROM deck
       WHERE is_deleted = 0
       AND (title LIKE ? OR tags LIKE ?)
       ORDER BY modified_at DESC`,
      [`%${searchTerm}%`, `%${searchTerm}%`]
    );

    return rows.map(this.mapRowToDeck);
  }

  /**
   * Get decks by tag
   */
  static async findByTag(tag: string): Promise<Deck[]> {
    const rows = query<any>(
      `SELECT * FROM deck
       WHERE is_deleted = 0
       AND tags LIKE ?
       ORDER BY modified_at DESC`,
      [`%"${tag}"%`]
    );

    return rows.map(this.mapRowToDeck);
  }

  /**
   * Map database row to Deck model
   */
  private static mapRowToDeck(row: any): Deck {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      created_at: row.created_at,
      modified_at: row.modified_at,
      tags: JSON.parse(row.tags || '[]'),
      is_public: Boolean(row.is_public),
      is_deleted: Boolean(row.is_deleted),
    };
  }
}
