/**
 * Deck model - represents a collection of flashcards
 * CRDT-compatible with UUID primary keys and timestamp tracking
 */

export interface Deck {
  id: string; // UUID v4
  title: string;
  description: string | null;
  created_at: number; // Unix timestamp (ms)
  modified_at: number; // Unix timestamp (ms)
  tags: string[]; // Stored as JSON array
  is_public: boolean;
  is_deleted: boolean; // Soft delete flag for CRDT sync
}

export interface CreateDeckInput {
  title: string;
  description?: string | null;
  tags?: string[];
  is_public?: boolean;
}

export interface UpdateDeckInput {
  title?: string;
  description?: string | null;
  tags?: string[];
  is_public?: boolean;
}

export type DeckWithCardCount = Deck & {
  card_count: number;
  due_count: number;
};
