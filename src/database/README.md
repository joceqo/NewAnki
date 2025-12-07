# Database Layer Documentation

Complete SQLite database implementation with CRDT sync for the SRS flashcard app.

## Architecture

### Tables
- **deck** - Collection of flashcards with tags and metadata
- **card** - Individual flashcards (flashcard, MCQ, cloze, image occlusion)
- **review_record** - FSRS scheduling state and review history
- **media** - Images, audio, video files with deduplication

### Features
- ✅ UUID primary keys for distributed sync
- ✅ Soft deletes (is_deleted flag) for CRDT compatibility
- ✅ Automatic timestamp tracking (created_at, modified_at)
- ✅ Foreign key constraints with cascade
- ✅ JSON fields for flexible content storage
- ✅ Views for common queries
- ✅ Triggers for automatic updates
- ✅ SQLiteCloud sync with Last-Write-Wins CRDT

## Installation

Required packages:
```bash
npm install @op-engineering/op-sqlite
npm install @sqlitecloud/react-native
```

## Basic Usage

### Initialize Database

```typescript
import { initDatabase, initCloudSync } from '@/database';

// Initialize local database
const db = initDatabase();

// Initialize cloud sync (optional)
await initCloudSync({
  connectionString: 'sqlitecloud://user:pass@host.sqlitecloud.io:8860/database',
  databaseName: 'srs_flashcards',
  enableAutoSync: true,
  syncIntervalMs: 60000, // Sync every minute
});
```

### Deck Operations

```typescript
import { DeckRepository } from '@/database';

// Create a deck
const deck = await DeckRepository.create({
  title: 'Japanese Vocabulary',
  description: 'JLPT N5 vocabulary',
  tags: ['japanese', 'vocabulary', 'n5'],
  is_public: false,
});

// Find all decks with stats
const decks = await DeckRepository.findAllWithStats();
// Returns: DeckWithCardCount[] with card_count and due_count

// Update deck
await DeckRepository.update(deck.id, {
  title: 'Japanese Vocabulary (Updated)',
  tags: ['japanese', 'vocabulary', 'n5', 'beginner'],
});

// Search decks
const results = await DeckRepository.search('japanese');

// Find by tag
const taggedDecks = await DeckRepository.findByTag('vocabulary');

// Delete deck (soft delete)
await DeckRepository.delete(deck.id);
```

### Card Operations

```typescript
import { CardRepository, CardType } from '@/database';

// Create a flashcard
const flashcard = await CardRepository.create({
  deck_id: deck.id,
  type: CardType.FLASHCARD,
  content: {
    front: 'こんにちは',
    back: 'Hello',
  },
  metadata: {
    tags: ['greetings'],
    source: 'Genki I',
  },
});

// Create an MCQ card
const mcq = await CardRepository.create({
  deck_id: deck.id,
  type: CardType.MCQ,
  content: {
    question: 'What is the capital of Japan?',
    options: ['Tokyo', 'Kyoto', 'Osaka', 'Nagoya'],
    correct_index: 0,
    explanation: 'Tokyo is the capital and largest city of Japan.',
  },
});

// Create a cloze card
const cloze = await CardRepository.create({
  deck_id: deck.id,
  type: CardType.CLOZE,
  content: {
    text: 'The capital of Japan is {{c1::Tokyo}}.',
    cloze_count: 1,
  },
});

// Create an image occlusion card
const imageOcclusion = await CardRepository.create({
  deck_id: deck.id,
  type: CardType.IMAGE_OCCLUSION,
  content: {
    image_media_id: mediaId,
    occlusions: [
      { id: 'occ1', x: 100, y: 50, width: 200, height: 100, label: 'Tokyo' },
    ],
  },
});

// Find due cards
const dueCards = await CardRepository.findDueCards(deck.id);

// Find new cards (never reviewed)
const newCards = await CardRepository.findNewCards(deck.id);

// Find cards with review info
const cardsWithReviews = await CardRepository.findByDeckIdWithReviews(deck.id);

// Search cards
const searchResults = await CardRepository.search('Tokyo');

// Update card
await CardRepository.update(flashcard.id, {
  content: {
    front: 'こんにちは (konnichiwa)',
    back: 'Hello (used during daytime)',
  },
});

// Delete card
await CardRepository.delete(flashcard.id);
```

### Review Operations

```typescript
import { ReviewRepository, ReviewGrade } from '@/database';

// Create initial review record (first review)
const reviewRecord = await ReviewRepository.create({
  card_id: card.id,
  grade: ReviewGrade.GOOD,
  review_duration_ms: 3500,
});

// Update after review (with FSRS scheduling)
await ReviewRepository.updateAfterReview(card.id, {
  grade: ReviewGrade.GOOD,
  next_due_date: Date.now() + 86400000, // 1 day from now
  interval_days: 1,
  stability: 2.5,
  difficulty: 5.2,
  retrievability_estimate: 0.9,
  review_duration_ms: 2800,
});

// Get review statistics
const stats = await ReviewRepository.getStats(deck.id);
// Returns: {
//   total_cards: 150,
//   due_today: 24,
//   reviewed_today: 18,
//   success_rate: 85.3,
//   average_interval: 12.5,
//   longest_streak: 45,
//   current_streak: 7,
// }

// Find review by card
const review = await ReviewRepository.findByCardId(card.id);
```

### Media Operations

```typescript
import { MediaRepository, MediaType } from '@/database';
import { createHash } from 'crypto';

// Calculate checksum for deduplication
const fileBuffer = await readFile(imagePath);
const checksum = createHash('sha256').update(fileBuffer).digest('hex');

// Create media (with automatic deduplication)
const media = await MediaRepository.create({
  type: MediaType.IMAGE,
  file_path: '/path/to/image.png',
  alt_text: 'Map of Japan highlighting Tokyo',
  mime_type: 'image/png',
  file_size_bytes: 125000,
  width: 1920,
  height: 1080,
  checksum: checksum,
});

// Find by checksum (deduplication check)
const existing = await MediaRepository.findByChecksum(checksum);

// Find unused media
const unused = await MediaRepository.findUnused();

// Get media with usage count
const mediaWithUsage = await MediaRepository.findWithUsage();

// Get storage statistics
const totalStorage = await MediaRepository.getTotalStorageUsage();
const byType = await MediaRepository.getStorageUsageByType();
// Returns: { image: 1250000, audio: 500000, video: 3000000 }

// Delete media
await MediaRepository.delete(media.id);
```

### Cloud Sync Operations

```typescript
import {
  initCloudSync,
  syncNow,
  stopAutoSync,
  disconnectCloud,
  isCloudConnected,
  handleOfflineMode,
  handleOnlineMode,
} from '@/database';

// Initialize sync
await initCloudSync({
  connectionString: process.env.SQLITECLOUD_CONNECTION_STRING!,
  databaseName: 'srs_flashcards',
  enableAutoSync: true,
  syncIntervalMs: 60000,
});

// Manual sync
await syncNow();

// Stop auto-sync
stopAutoSync();

// Check connection status
if (isCloudConnected()) {
  console.log('Cloud sync active');
}

// Handle network changes
import NetInfo from '@react-native-community/netinfo';

NetInfo.addEventListener(state => {
  if (state.isConnected) {
    handleOnlineMode(syncConfig);
  } else {
    handleOfflineMode();
  }
});

// Disconnect
await disconnectCloud();
```

### Transaction Support

```typescript
import { withTransaction } from '@/database';

// Execute multiple operations in a transaction
await withTransaction(async () => {
  const deck = await DeckRepository.create({
    title: 'New Deck',
  });

  const card = await CardRepository.create({
    deck_id: deck.id,
    type: CardType.FLASHCARD,
    content: { front: 'Front', back: 'Back' },
  });

  await ReviewRepository.create({
    card_id: card.id,
    grade: ReviewGrade.GOOD,
  });
});
```

### Utility Functions

```typescript
import {
  getDatabaseStats,
  isDatabaseEmpty,
  resetDatabase,
  generateUUID,
  getCurrentTimestamp,
} from '@/database';

// Get database statistics
const stats = getDatabaseStats();
// Returns: { decks: 5, cards: 150, reviews: 120, media: 45 }

// Check if database is empty
if (isDatabaseEmpty()) {
  // Show onboarding
}

// Generate UUID
const id = generateUUID();

// Get current timestamp
const now = getCurrentTimestamp();

// Reset database (testing only)
resetDatabase();
```

## CRDT Sync Details

### How It Works

1. **Last-Write-Wins (LWW)**: Conflicts resolved by `modified_at` timestamp
2. **Soft Deletes**: Records marked as deleted, never hard-deleted
3. **UUID Keys**: Enables distributed ID generation without conflicts
4. **Triggers**: Automatically update `modified_at` on changes

### Sync Process

1. **Pull Phase**: Fetch records from cloud with `modified_at > last_sync`
2. **Merge Phase**: Apply CRDT logic (LWW) to resolve conflicts
3. **Push Phase**: Upload local changes to cloud with UPSERT

### Offline-First

- All operations work offline
- Changes queued locally
- Automatic sync when connection restored
- No data loss during offline periods

## Schema Design

### UUID Format
All IDs follow UUID v4 format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`

### Timestamps
All timestamps stored as Unix milliseconds (ms) for precision.

### JSON Fields
- `deck.tags` - Array of strings: `["tag1", "tag2"]`
- `card.content` - Varies by card type (see models)
- `card.metadata` - Additional metadata
- `review_record.history` - Array of ReviewHistory objects

### Soft Deletes
Records marked with `is_deleted = 1` instead of deletion. Allows CRDT sync to propagate deletions.

### Views
Pre-built views for common queries:
- `v_cards_with_reviews` - Cards joined with review info
- `v_deck_stats` - Deck statistics with counts
- `v_daily_stats` - Daily review statistics

## Performance Considerations

### Indexes
All tables indexed on:
- Primary key (id)
- Foreign keys (deck_id, card_id)
- modified_at (for sync queries)
- is_deleted (for active record queries)

### Query Optimization
- Use views for complex joins
- Filter by is_deleted = 0 for active records
- Use parameterized queries to prevent SQL injection

### Sync Optimization
- Track last_sync timestamp per table
- Only sync modified records
- Use batch operations for bulk sync
- Configurable sync interval

## Testing

```typescript
import { initDatabase, resetDatabase, DeckRepository } from '@/database';

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

## Environment Variables

```env
# SQLiteCloud connection
SQLITECLOUD_CONNECTION_STRING=sqlitecloud://user:password@host.sqlitecloud.io:8860/database
SQLITECLOUD_DATABASE_NAME=srs_flashcards
SQLITECLOUD_AUTO_SYNC=true
SQLITECLOUD_SYNC_INTERVAL_MS=60000
```

## Migration Strategy

For schema changes:
1. Increment schema version
2. Create migration SQL file
3. Apply migrations on app startup
4. Test thoroughly before deploying to cloud

Example migration:
```typescript
// migrations/002_add_card_tags.sql
ALTER TABLE card ADD COLUMN tags TEXT DEFAULT '[]';
```

## Troubleshooting

### Sync Conflicts
- CRDT uses LWW - latest `modified_at` wins
- If manual merge needed, check `history` field

### Performance Issues
- Add indexes for frequently queried fields
- Use `EXPLAIN QUERY PLAN` to analyze slow queries
- Consider pagination for large result sets

### Storage Issues
- Regularly clean up unused media
- Implement media compression
- Use `MediaRepository.findUnused()` to identify orphans

## Next Steps

1. **FSRS Integration**: Implement FSRS scheduling algorithm
2. **Media Upload**: Add cloud storage for media files
3. **Conflict UI**: Show conflicts to user if manual resolution needed
4. **Analytics**: Track usage patterns and learning statistics
5. **Export/Import**: Add backup and restore functionality
