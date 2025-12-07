/**
 * Drizzle ORM Database Connection
 * Uses @op-engineering/op-sqlite for React Native
 */

import { drizzle } from 'drizzle-orm/op-sqlite';
import { open } from '@op-engineering/op-sqlite';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

let connection: ReturnType<typeof open> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

/**
 * Initialize the database connection
 */
export function initDatabase() {
  if (db) {
    return db;
  }

  // Open SQLite connection
  connection = open({
    name: 'srs_flashcards.db',
    location: '..', // Default documents directory
  });

  // Enable foreign keys
  connection.execute('PRAGMA foreign_keys = ON;');

  // Create Drizzle instance
  db = drizzle(connection, { schema });

  console.log('Database initialized with Drizzle ORM');
  return db;
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Get the raw SQLite connection (for migrations, raw queries)
 */
export function getConnection(): ReturnType<typeof open> {
  if (!connection) {
    initDatabase();
  }
  return connection!;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (connection) {
    connection.close();
    connection = null;
    db = null;
    console.log('Database connection closed');
  }
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get current timestamp in milliseconds
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Execute raw SQL (for migrations, utilities)
 */
export function executeRaw(sql: string, params?: any[]): any {
  const conn = getConnection();
  return conn.execute(sql, params);
}

/**
 * Check if database is empty (no decks)
 */
export async function isDatabaseEmpty(): Promise<boolean> {
  const db = getDatabase();
  const result = await db
    .select()
    .from(schema.deck)
    .where(eq(schema.deck.isDeleted, false));

  return result.length === 0;
}

/**
 * Reset database (for testing - deletes all data)
 */
export async function resetDatabase(): Promise<void> {
  const conn = getConnection();

  const tables = ['review_record', 'card', 'deck', 'media'];
  for (const table of tables) {
    conn.execute(`DELETE FROM ${table}`);
  }

  console.log('Database reset complete');
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const db = getDatabase();

  const decks = await db
    .select()
    .from(schema.deck)
    .where(eq(schema.deck.isDeleted, false));

  const cards = await db
    .select()
    .from(schema.card)
    .where(eq(schema.card.isDeleted, false));

  const reviews = await db
    .select()
    .from(schema.reviewRecord)
    .where(eq(schema.reviewRecord.isDeleted, false));

  const mediaItems = await db
    .select()
    .from(schema.media)
    .where(eq(schema.media.isDeleted, false));

  return {
    decks: decks.length,
    cards: cards.length,
    reviews: reviews.length,
    media: mediaItems.length,
  };
}

// Export schema for use in repositories
export { schema };
