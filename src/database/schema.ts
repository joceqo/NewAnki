/**
 * Drizzle ORM Schema Definitions
 * CRDT-compatible schema with UUID primary keys and soft deletes
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import type { CardType, MediaType } from '../models';

// ============================================================================
// DECK TABLE
// ============================================================================

export const deck = sqliteTable(
  'deck',
  {
    id: text('id').primaryKey().notNull(), // UUID v4
    title: text('title').notNull(),
    description: text('description'),
    createdAt: integer('created_at').notNull(), // Unix timestamp (ms)
    modifiedAt: integer('modified_at').notNull(), // Unix timestamp (ms)
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    modifiedAtIdx: index('idx_deck_modified_at').on(table.modifiedAt),
    isDeletedIdx: index('idx_deck_is_deleted').on(table.isDeleted),
    isPublicIdx: index('idx_deck_is_public').on(table.isPublic),
  })
);

export const deckRelations = relations(deck, ({ many }) => ({
  cards: many(card),
}));

// ============================================================================
// CARD TABLE
// ============================================================================

export const card = sqliteTable(
  'card',
  {
    id: text('id').primaryKey().notNull(), // UUID v4
    deckId: text('deck_id')
      .notNull()
      .references(() => deck.id, { onDelete: 'cascade' }),
    type: text('type').$type<CardType>().notNull(),
    content: text('content', { mode: 'json' }).notNull(), // CardContent (varies by type)
    metadata: text('metadata', { mode: 'json' }).notNull().default({}),
    createdAt: integer('created_at').notNull(), // Unix timestamp (ms)
    modifiedAt: integer('modified_at').notNull(), // Unix timestamp (ms)
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    deckIdIdx: index('idx_card_deck_id').on(table.deckId),
    typeIdx: index('idx_card_type').on(table.type),
    modifiedAtIdx: index('idx_card_modified_at').on(table.modifiedAt),
    isDeletedIdx: index('idx_card_is_deleted').on(table.isDeleted),
    deckActiveIdx: index('idx_card_deck_active').on(table.deckId, table.isDeleted),
  })
);

export const cardRelations = relations(card, ({ one }) => ({
  deck: one(deck, {
    fields: [card.deckId],
    references: [deck.id],
  }),
  reviewRecord: one(reviewRecord, {
    fields: [card.id],
    references: [reviewRecord.cardId],
  }),
}));

// ============================================================================
// REVIEW_RECORD TABLE
// ============================================================================

export const reviewRecord = sqliteTable(
  'review_record',
  {
    id: text('id').primaryKey().notNull(), // UUID v4
    cardId: text('card_id')
      .notNull()
      .unique()
      .references(() => card.id, { onDelete: 'cascade' }),

    // FSRS scheduling parameters
    intervalDays: real('interval_days').notNull().default(0),
    nextDueDate: integer('next_due_date').notNull(), // Unix timestamp (ms)
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(5), // 0-10 scale
    retrievabilityEstimate: real('retrievability_estimate').notNull().default(0), // 0-1

    // SM-2 compatibility
    easeFactor: real('ease_factor').notNull().default(2.5),

    // Review history (JSON array)
    history: text('history', { mode: 'json' }).$type<any[]>().notNull().default([]),

    // Tracking metadata
    totalReviews: integer('total_reviews').notNull().default(0),
    lapseCount: integer('lapse_count').notNull().default(0),
    lastReviewAt: integer('last_review_at'), // Unix timestamp (ms), nullable
    createdAt: integer('created_at').notNull(), // Unix timestamp (ms)
    modifiedAt: integer('modified_at').notNull(), // Unix timestamp (ms)
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    cardIdIdx: index('idx_review_card_id').on(table.cardId),
    nextDueIdx: index('idx_review_next_due').on(table.nextDueDate),
    modifiedAtIdx: index('idx_review_modified_at').on(table.modifiedAt),
    lastReviewIdx: index('idx_review_last_review').on(table.lastReviewAt),
  })
);

export const reviewRecordRelations = relations(reviewRecord, ({ one }) => ({
  card: one(card, {
    fields: [reviewRecord.cardId],
    references: [card.id],
  }),
}));

// ============================================================================
// MEDIA TABLE
// ============================================================================

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey().notNull(), // UUID v4
    type: text('type').$type<MediaType>().notNull(),
    filePath: text('file_path').notNull(),
    altText: text('alt_text'),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    checksum: text('checksum').notNull(), // SHA-256 for deduplication
    createdAt: integer('created_at').notNull(), // Unix timestamp (ms)
    modifiedAt: integer('modified_at').notNull(), // Unix timestamp (ms)
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    checksumIdx: index('idx_media_checksum').on(table.checksum),
    typeIdx: index('idx_media_type').on(table.type),
    modifiedAtIdx: index('idx_media_modified_at').on(table.modifiedAt),
    isDeletedIdx: index('idx_media_is_deleted').on(table.isDeleted),
  })
);

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Deck = typeof deck.$inferSelect;
export type NewDeck = typeof deck.$inferInsert;

export type Card = typeof card.$inferSelect;
export type NewCard = typeof card.$inferInsert;

export type ReviewRecord = typeof reviewRecord.$inferSelect;
export type NewReviewRecord = typeof reviewRecord.$inferInsert;

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
