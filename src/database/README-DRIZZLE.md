# Drizzle ORM Database Layer

Complete type-safe database implementation using Drizzle ORM for React Native.

## Why Drizzle ORM?

✅ **Type Safety** - Full TypeScript inference, catch errors at compile time
✅ **Zero Runtime Overhead** - Just SQL generation, no ORM bloat
✅ **React Native Support** - Works perfectly with `@op-engineering/op-sqlite`
✅ **Migrations** - Automatic migration generation with `drizzle-kit`
✅ **Better DX** - Intuitive API, excellent autocomplete
✅ **CRDT Compatible** - Works with SQLiteCloud sync

## Installation

```bash
# Core dependencies
npm install drizzle-orm @op-engineering/op-sqlite

# Development (for migrations)
npm install -D drizzle-kit

# Optional: Cloud sync
npm install @sqlitecloud/react-native
```

## Project Structure

```
src/database/
├── schema.ts              # Drizzle schema definitions
├── db-drizzle.ts          # Database connection & utilities
├── sync-drizzle.ts        # SQLiteCloud CRDT sync
├── repositories/          # Type-safe CRUD operations
│   ├── DeckRepository.ts
│   ├── CardRepository.ts
│   ├── ReviewRepository.ts
│   ├── MediaRepository.ts
│   └── index.ts
└── README-DRIZZLE.md      # This file
```

## Quick Start

### 1. Initialize Database

```typescript
import { initDatabase } from '@/database/db-drizzle';

// Initialize on app start
const db = initDatabase();
```

### 2. Basic CRUD Operations

```typescript
import {
  DeckRepository,
  CardRepository,
  ReviewRepository,
} from '@/database/repositories';
import { CardType } from '@/models';

// Create a deck
const deck = await DeckRepository.create({
  title: 'Japanese Vocabulary',
  description: 'JLPT N5 words',
  tags: ['japanese', 'n5'],
});

// Create a flashcard
const card = await CardRepository.create({
  deck_id: deck.id,
  type: CardType.FLASHCARD,
  content: {
    front: 'こんにちは',
    back: 'Hello',
  },
  metadata: {
    tags: ['greetings'],
  },
});

// Find due cards
const dueCards = await CardRepository.findDueCards(deck.id);

// Update after review
await ReviewRepository.updateAfterReview(card.id, {
  grade: ReviewGrade.GOOD,
  next_due_date: Date.now() + 86400000,
  interval_days: 1,
  stability: 2.5,
  difficulty: 5.2,
  retrievability_estimate: 0.9,
});
```

## Schema

### Type Inference

Drizzle automatically infers types from schema:

```typescript
import type { Deck, Card, NewDeck, NewCard } from '@/database/schema';

// Select types (what you get from queries)
const deck: Deck = await DeckRepository.findById('...');

// Insert types (what you pass to create)
const newDeck: NewDeck = {
  id: generateUUID(),
  title: 'My Deck',
  createdAt: Date.now(),
  // ... TypeScript will ensure all required fields are present
};
```

### Field Mapping

Drizzle uses camelCase (database uses snake_case internally):

```typescript
// Database: created_at, modified_at, is_deleted
// Drizzle:   createdAt,  modifiedAt,  isDeleted
```

### JSON Fields

```typescript
// Tags stored as JSON
tags: text('tags', { mode: 'json' }).$type<string[]>()

// Usage
const deck = await DeckRepository.create({
  tags: ['javascript', 'react'], // Automatically stringified
});
```

## Repository API

### DeckRepository

```typescript
// Create
const deck = await DeckRepository.create({
  title: 'My Deck',
  description: 'Optional description',
  tags: ['tag1', 'tag2'],
  is_public: false,
});

// Find
const deck = await DeckRepository.findById(id);
const all = await DeckRepository.findAll();
const withStats = await DeckRepository.findAllWithStats();
// Returns: { ...deck, cardCount: 10, dueCount: 5 }

// Update
await DeckRepository.update(id, {
  title: 'Updated Title',
  tags: ['new', 'tags'],
});

// Delete (soft delete)
await DeckRepository.delete(id);

// Search
const results = await DeckRepository.search('javascript');
const byTag = await DeckRepository.findByTag('programming');
```

### CardRepository

```typescript
// Create
const card = await CardRepository.create({
  deck_id: deckId,
  type: CardType.FLASHCARD,
  content: { front: 'Q', back: 'A' },
  metadata: { tags: ['important'] },
});

// Find
const card = await CardRepository.findById(id);
const cards = await CardRepository.findByDeckId(deckId);
const withReviews = await CardRepository.findByDeckIdWithReviews(deckId);

// Due/New cards
const due = await CardRepository.findDueCards(deckId);
const newCards = await CardRepository.findNewCards(deckId);

// Update
await CardRepository.update(id, {
  content: { front: 'Updated Q', back: 'Updated A' },
});

// Count
const total = await CardRepository.countByDeckId(deckId);
const dueCount = await CardRepository.countDueByDeckId(deckId);

// Search
const results = await CardRepository.search('keyword', deckId);
```

### ReviewRepository

```typescript
// Create initial review
const review = await ReviewRepository.create({
  card_id: cardId,
  grade: ReviewGrade.GOOD,
  review_duration_ms: 3500,
});

// Update after review (with FSRS parameters)
await ReviewRepository.updateAfterReview(cardId, {
  grade: ReviewGrade.GOOD,
  next_due_date: Date.now() + 86400000,
  interval_days: 1,
  stability: 2.5,
  difficulty: 5.2,
  retrievability_estimate: 0.9,
  review_duration_ms: 2800,
});

// Find
const review = await ReviewRepository.findByCardId(cardId);

// Get statistics
const stats = await ReviewRepository.getStats(deckId);
// Returns: {
//   total_cards: 150,
//   due_today: 24,
//   reviewed_today: 18,
//   success_rate: 85.3,
//   average_interval: 12.5,
//   longest_streak: 45,
//   current_streak: 7,
// }
```

### MediaRepository

```typescript
// Create (with automatic deduplication)
const media = await MediaRepository.create({
  type: MediaType.IMAGE,
  file_path: '/path/to/image.png',
  alt_text: 'Description',
  mime_type: 'image/png',
  file_size_bytes: 125000,
  width: 1920,
  height: 1080,
  checksum: 'sha256-hash',
});

// Find
const media = await MediaRepository.findById(id);
const byChecksum = await MediaRepository.findByChecksum(hash);
const images = await MediaRepository.findByType(MediaType.IMAGE);

// Unused media
const unused = await MediaRepository.findUnused();

// With usage count
const withUsage = await MediaRepository.findWithUsage();
// Returns: { ...media, usageCount: 5 }

// Storage stats
const total = await MediaRepository.getTotalStorageUsage();
const byType = await MediaRepository.getStorageUsageByType();
// Returns: { image: 1250000, audio: 500000, video: 3000000 }
```

## Migrations

### Generate Migration

```bash
# After changing schema.ts
npx drizzle-kit generate
```

### Apply Migration

Migrations are applied automatically on app start via `initDatabase()`.

For manual migration:

```typescript
import { migrate } from 'drizzle-orm/op-sqlite/migrator';
import { getDatabase } from '@/database/db-drizzle';

const db = getDatabase();
await migrate(db, { migrationsFolder: './drizzle' });
```

### Migration Example

```typescript
// After adding a new field to schema.ts
export const card = sqliteTable('card', {
  // ... existing fields
  priority: integer('priority').default(0), // New field
});

// Run: npx drizzle-kit generate
// Migration file automatically created in ./drizzle/
```

## Cloud Sync

### Initialize Sync

```typescript
import { initCloudSync } from '@/database/sync-drizzle';

await initCloudSync({
  connectionString: 'sqlitecloud://user:pass@host:8860/db',
  databaseName: 'srs_flashcards',
  enableAutoSync: true,
  syncIntervalMs: 60000, // 1 minute
});
```

### Manual Sync

```typescript
import { syncNow } from '@/database/sync-drizzle';

await syncNow();
```

### Offline Support

```typescript
import {
  handleOfflineMode,
  handleOnlineMode,
  isCloudConnected,
} from '@/database/sync-drizzle';

// Listen for network changes
import NetInfo from '@react-native-community/netinfo';

NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    handleOnlineMode(syncConfig);
  } else {
    handleOfflineMode();
  }
});
```

## Advanced Queries

### Using Drizzle Directly

```typescript
import { getDatabase } from '@/database/db-drizzle';
import { deck, card } from '@/database/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

const db = getDatabase();

// Custom query with joins
const decksWithCards = await db
  .select({
    deckId: deck.id,
    deckTitle: deck.title,
    cardCount: sql<number>`count(${card.id})`,
  })
  .from(deck)
  .leftJoin(card, eq(card.deckId, deck.id))
  .where(eq(deck.isDeleted, false))
  .groupBy(deck.id)
  .orderBy(desc(deck.modifiedAt));

// Subquery
const decksWithDueCards = await db
  .select()
  .from(deck)
  .where(
    sql`EXISTS (
      SELECT 1 FROM ${card}
      WHERE ${card.deckId} = ${deck.id}
      AND ${card.isDeleted} = 0
    )`
  );

// Raw SQL (escape hatch)
import { getConnection } from '@/database/db-drizzle';

const conn = getConnection();
const result = conn.execute('SELECT * FROM deck WHERE id = ?', [deckId]);
```

## Type Safety Examples

### Compile-Time Safety

```typescript
// ✅ Type-safe
const card = await CardRepository.create({
  deck_id: 'uuid',
  type: CardType.FLASHCARD,
  content: { front: 'Q', back: 'A' },
});

// ❌ TypeScript error: missing required fields
const card = await CardRepository.create({
  deck_id: 'uuid',
  // Error: Property 'type' is missing
});

// ❌ TypeScript error: wrong type
const card = await CardRepository.create({
  deck_id: 'uuid',
  type: 'invalid', // Error: Type '"invalid"' is not assignable to CardType
  content: { front: 'Q', back: 'A' },
});
```

### Autocomplete

Your IDE will provide full autocomplete for:
- Schema fields
- Query methods
- Filter conditions
- Return types

## Performance

### Indexes

All tables have indexes on:
- Primary keys (id)
- Foreign keys (deck_id, card_id)
- Timestamps (created_at, modified_at)
- Soft delete flag (is_deleted)

### Query Optimization

```typescript
// Use select() to fetch only needed fields
const ids = await db
  .select({ id: deck.id, title: deck.title })
  .from(deck);

// Use limit() for pagination
const page = await db.select().from(deck).limit(20).offset(0);

// Filter soft deletes early
const active = await db.select().from(deck).where(eq(deck.isDeleted, false));
```

## Testing

```typescript
import {
  initDatabase,
  resetDatabase,
  getDatabaseStats,
} from '@/database/db-drizzle';
import { DeckRepository } from '@/database/repositories';

describe('DeckRepository', () => {
  beforeEach(() => {
    initDatabase();
    resetDatabase();
  });

  it('creates a deck', async () => {
    const deck = await DeckRepository.create({
      title: 'Test Deck',
    });

    expect(deck.id).toBeDefined();
    expect(deck.title).toBe('Test Deck');
  });

  it('finds deck by id', async () => {
    const created = await DeckRepository.create({ title: 'Test' });
    const found = await DeckRepository.findById(created.id);

    expect(found).toEqual(created);
  });
});
```

## Environment Setup

Create `.env`:

```env
SQLITECLOUD_CONNECTION_STRING=sqlitecloud://user:pass@host:8860/db
SQLITECLOUD_DATABASE_NAME=srs_flashcards
SQLITECLOUD_AUTO_SYNC=true
SQLITECLOUD_SYNC_INTERVAL_MS=60000
```

## Debugging

### Enable Drizzle Logging

```typescript
import { drizzle } from 'drizzle-orm/op-sqlite';

const db = drizzle(connection, {
  schema,
  logger: true, // Log all SQL queries
});
```

### Inspect Generated SQL

```typescript
import { sql } from 'drizzle-orm';

const query = db.select().from(deck).where(eq(deck.isDeleted, false));

// Get SQL string
console.log(query.toSQL());
// Output: { sql: 'SELECT * FROM deck WHERE is_deleted = ?', params: [0] }
```

## Migration from Raw SQL

If migrating from the old raw SQL implementation:

1. **Schema**: Already defined in `schema.ts`
2. **Repositories**: Rewritten with Drizzle queries
3. **Sync**: Updated to work with Drizzle types
4. **Data**: No migration needed - same SQLite file format

Old code:
```typescript
executeRaw('SELECT * FROM deck WHERE id = ?', [id]);
```

New code:
```typescript
await db.select().from(deck).where(eq(deck.id, id));
```

## Benefits Over Raw SQL

| Feature | Raw SQL | Drizzle ORM |
|---------|---------|-------------|
| Type Safety | ❌ None | ✅ Full |
| Autocomplete | ❌ No | ✅ Yes |
| Refactoring | ❌ Manual | ✅ Automatic |
| SQL Injection | ⚠️ Manual escaping | ✅ Built-in |
| Migrations | ❌ Manual | ✅ Automatic |
| Query Builder | ❌ String concat | ✅ Composable |
| Relations | ❌ Manual joins | ✅ Type-safe |

## Resources

- [Drizzle ORM Docs](https://orm.drizzle.team/docs/overview)
- [SQLite Core](https://orm.drizzle.team/docs/get-started-sqlite)
- [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview)
- [op-sqlite](https://github.com/OP-Engineering/op-sqlite)

## Next Steps

1. ✅ Schema defined
2. ✅ Repositories implemented
3. ✅ Sync layer updated
4. 🔲 Install dependencies (`npm install drizzle-orm drizzle-kit`)
5. 🔲 Generate initial migration (`npx drizzle-kit generate`)
6. 🔲 Test CRUD operations
7. 🔲 Integrate FSRS scheduling
8. 🔲 Add cloud sync configuration
