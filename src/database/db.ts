/**
 * Database initialization and basic CRUD operations
 * Uses @op-engineering/op-sqlite for React Native
 */

import { open, type DB } from '@op-engineering/op-sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

let db: DB | null = null;

/**
 * Initialize the local SQLite database
 * Creates tables if they don't exist
 */
export function initDatabase(): DB {
  if (db) {
    return db;
  }

  // Open database (creates if doesn't exist)
  db = open({
    name: 'srs_flashcards.db',
    location: '..', // Default location in app's documents directory
  });

  // Enable foreign keys
  db.execute('PRAGMA foreign_keys = ON;');

  // Create tables from schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');

  // Split schema by semicolons and execute each statement
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      db.execute(statement);
    } catch (error) {
      console.error('Schema execution error:', error);
      console.error('Statement:', statement);
    }
  }

  console.log('Database initialized successfully');
  return db;
}

/**
 * Get the database instance
 */
export function getDatabase(): DB {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID() if available, falls back to manual implementation
 */
export function generateUUID(): string {
  // React Native might not have crypto.randomUUID, so we implement it
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
 * Execute a raw SQL query
 */
export function executeRaw(sql: string, params: any[] = []): any {
  const database = getDatabase();
  return database.execute(sql, params);
}

/**
 * Execute a query and return results
 */
export function query<T = any>(sql: string, params: any[] = []): T[] {
  const database = getDatabase();
  const result = database.execute(sql, params);
  return (result.rows?._array || []) as T[];
}

/**
 * Execute a query and return the first result
 */
export function queryFirst<T = any>(sql: string, params: any[] = []): T | null {
  const results = query<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Begin a transaction
 */
export function beginTransaction(): void {
  executeRaw('BEGIN TRANSACTION');
}

/**
 * Commit a transaction
 */
export function commitTransaction(): void {
  executeRaw('COMMIT');
}

/**
 * Rollback a transaction
 */
export function rollbackTransaction(): void {
  executeRaw('ROLLBACK');
}

/**
 * Execute a function within a transaction
 * Automatically commits on success, rolls back on error
 */
export async function withTransaction<T>(
  fn: () => Promise<T> | T
): Promise<T> {
  beginTransaction();
  try {
    const result = await fn();
    commitTransaction();
    return result;
  } catch (error) {
    rollbackTransaction();
    throw error;
  }
}

/**
 * Soft delete a record by setting is_deleted = 1
 */
export function softDelete(table: string, id: string): void {
  const timestamp = getCurrentTimestamp();
  executeRaw(
    `UPDATE ${table} SET is_deleted = 1, modified_at = ? WHERE id = ?`,
    [timestamp, id]
  );
}

/**
 * Hard delete a record (use with caution - breaks CRDT sync)
 */
export function hardDelete(table: string, id: string): void {
  executeRaw(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

/**
 * Check if database is empty (no decks)
 */
export function isDatabaseEmpty(): boolean {
  const result = queryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM deck WHERE is_deleted = 0'
  );
  return result ? result.count === 0 : true;
}

/**
 * Reset database (for testing/debugging)
 * WARNING: Deletes all data
 */
export function resetDatabase(): void {
  const database = getDatabase();
  const tables = ['review_record', 'card', 'deck', 'media'];

  for (const table of tables) {
    database.execute(`DELETE FROM ${table}`);
  }

  console.log('Database reset complete');
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): {
  decks: number;
  cards: number;
  reviews: number;
  media: number;
} {
  const decks = queryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM deck WHERE is_deleted = 0'
  );
  const cards = queryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM card WHERE is_deleted = 0'
  );
  const reviews = queryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM review_record WHERE is_deleted = 0'
  );
  const media = queryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM media WHERE is_deleted = 0'
  );

  return {
    decks: decks?.count || 0,
    cards: cards?.count || 0,
    reviews: reviews?.count || 0,
    media: media?.count || 0,
  };
}
