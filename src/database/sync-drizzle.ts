/**
 * SQLiteCloud sync with Drizzle ORM
 * CRDT Last-Write-Wins conflict resolution
 */

import { SQLiteCloud } from '@sqlitecloud/react-native';
import { eq, gt, and } from 'drizzle-orm';
import { getDatabase, getConnection } from './db-drizzle';
import { deck, card, reviewRecord, media } from './schema';

interface SyncConfig {
  connectionString: string;
  databaseName: string;
  enableAutoSync?: boolean;
  syncIntervalMs?: number;
}

let cloudConnection: SQLiteCloud | null = null;
let syncInterval: NodeJS.Timeout | null = null;
let lastSyncTimestamp: Record<string, number> = {
  deck: 0,
  card: 0,
  review_record: 0,
  media: 0,
};

/**
 * Initialize SQLiteCloud connection with sync
 */
export async function initCloudSync(config: SyncConfig): Promise<void> {
  try {
    // Connect to SQLiteCloud
    cloudConnection = new SQLiteCloud(config.connectionString);
    await cloudConnection.connect();

    console.log('Connected to SQLiteCloud');

    // Use the specified database
    await cloudConnection.sql(`USE DATABASE ${config.databaseName}`);

    // Initialize CRDT sync
    await initializeCRDTSync();

    // Enable auto-sync if requested
    if (config.enableAutoSync) {
      const intervalMs = config.syncIntervalMs || 60000;
      startAutoSync(intervalMs);
    }

    console.log('SQLiteCloud sync initialized');
  } catch (error) {
    console.error('Failed to initialize cloud sync:', error);
    throw error;
  }
}

/**
 * Initialize CRDT sync using SQLiteCloud's cloudsync_init()
 */
async function initializeCRDTSync(): Promise<void> {
  if (!cloudConnection) {
    throw new Error('Cloud connection not initialized');
  }

  try {
    const tables = ['deck', 'card', 'review_record', 'media'];

    for (const table of tables) {
      await cloudConnection.sql(`SELECT cloudsync_init('${table}')`);
      console.log(`CRDT sync initialized for: ${table}`);
    }
  } catch (error) {
    console.error('Failed to initialize CRDT sync:', error);
    throw error;
  }
}

/**
 * Manually trigger a sync operation
 */
export async function syncNow(): Promise<void> {
  if (!cloudConnection) {
    throw new Error('Cloud connection not initialized');
  }

  try {
    console.log('Starting sync...');

    // Pull changes from cloud
    await pullChangesFromCloud();

    // Push local changes to cloud
    await pushChangesToCloud();

    console.log('Sync completed successfully');
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
}

/**
 * Pull changes from cloud to local database using Drizzle
 */
async function pullChangesFromCloud(): Promise<void> {
  if (!cloudConnection) {
    throw new Error('Cloud connection not initialized');
  }

  const db = getDatabase();

  // Sync decks
  await syncTable('deck', deck, db);

  // Sync cards
  await syncTable('card', card, db);

  // Sync review records
  await syncTable('review_record', reviewRecord, db);

  // Sync media
  await syncTable('media', media, db);
}

/**
 * Generic table sync function
 */
async function syncTable(
  tableName: string,
  table: any,
  db: ReturnType<typeof getDatabase>
): Promise<void> {
  if (!cloudConnection) return;

  const lastSync = lastSyncTimestamp[tableName] || 0;

  try {
    // Fetch records from cloud modified since last sync
    const cloudRecords = await cloudConnection.sql(
      `SELECT * FROM ${tableName} WHERE modified_at > ${lastSync} ORDER BY modified_at ASC`
    );

    if (!cloudRecords || !Array.isArray(cloudRecords) || cloudRecords.length === 0) {
      return;
    }

    // Merge each record using CRDT logic
    for (const cloudRecord of cloudRecords) {
      await mergeRecord(tableName, table, cloudRecord, db);
    }

    // Update last sync timestamp
    const maxTimestamp = Math.max(
      ...cloudRecords.map((r: any) => r.modified_at || 0)
    );
    lastSyncTimestamp[tableName] = maxTimestamp;

    console.log(`Pulled ${cloudRecords.length} changes from ${tableName}`);
  } catch (error) {
    console.error(`Failed to sync table ${tableName}:`, error);
  }
}

/**
 * Merge a cloud record into local database using CRDT Last-Write-Wins
 */
async function mergeRecord(
  tableName: string,
  table: any,
  cloudRecord: any,
  db: ReturnType<typeof getDatabase>
): Promise<void> {
  // Check if record exists locally
  const existing = await db
    .select()
    .from(table)
    .where(eq(table.id, cloudRecord.id))
    .limit(1);

  const localRecord = existing[0];

  if (!localRecord) {
    // Insert new record
    await db.insert(table).values(convertCloudRecord(cloudRecord));
  } else {
    // CRDT conflict resolution: Last-Write-Wins
    if (cloudRecord.modified_at > localRecord.modifiedAt) {
      // Cloud record is newer, update local
      await db
        .update(table)
        .set(convertCloudRecord(cloudRecord))
        .where(eq(table.id, cloudRecord.id));
    }
    // If local is newer or equal, keep local version
  }
}

/**
 * Convert cloud record format to local format
 * Handles field name mapping (snake_case to camelCase)
 */
function convertCloudRecord(cloudRecord: any): any {
  return {
    id: cloudRecord.id,
    deckId: cloudRecord.deck_id,
    cardId: cloudRecord.card_id,
    type: cloudRecord.type,
    title: cloudRecord.title,
    description: cloudRecord.description,
    content: cloudRecord.content ? JSON.parse(cloudRecord.content) : undefined,
    metadata: cloudRecord.metadata ? JSON.parse(cloudRecord.metadata) : undefined,
    tags: cloudRecord.tags ? JSON.parse(cloudRecord.tags) : undefined,
    filePath: cloudRecord.file_path,
    altText: cloudRecord.alt_text,
    mimeType: cloudRecord.mime_type,
    fileSizeBytes: cloudRecord.file_size_bytes,
    width: cloudRecord.width,
    height: cloudRecord.height,
    durationMs: cloudRecord.duration_ms,
    checksum: cloudRecord.checksum,
    intervalDays: cloudRecord.interval_days,
    nextDueDate: cloudRecord.next_due_date,
    stability: cloudRecord.stability,
    difficulty: cloudRecord.difficulty,
    retrievabilityEstimate: cloudRecord.retrievability_estimate,
    easeFactor: cloudRecord.ease_factor,
    history: cloudRecord.history ? JSON.parse(cloudRecord.history) : undefined,
    totalReviews: cloudRecord.total_reviews,
    lapseCount: cloudRecord.lapse_count,
    lastReviewAt: cloudRecord.last_review_at,
    createdAt: cloudRecord.created_at,
    modifiedAt: cloudRecord.modified_at,
    isPublic: Boolean(cloudRecord.is_public),
    isDeleted: Boolean(cloudRecord.is_deleted),
  };
}

/**
 * Push local changes to cloud
 */
async function pushChangesToCloud(): Promise<void> {
  if (!cloudConnection) {
    throw new Error('Cloud connection not initialized');
  }

  const db = getDatabase();

  // For each table, push recent changes
  await pushTableChanges('deck', deck, db);
  await pushTableChanges('card', card, db);
  await pushTableChanges('review_record', reviewRecord, db);
  await pushTableChanges('media', media, db);
}

/**
 * Push table changes to cloud
 */
async function pushTableChanges(
  tableName: string,
  table: any,
  db: ReturnType<typeof getDatabase>
): Promise<void> {
  if (!cloudConnection) return;

  const lastSync = lastSyncTimestamp[tableName] || Date.now() - 60000;

  try {
    // Get records modified since last sync
    const localRecords = await db
      .select()
      .from(table)
      .where(gt(table.modifiedAt, lastSync))
      .orderBy(table.modifiedAt);

    if (localRecords.length === 0) {
      return;
    }

    // Upload each record
    for (const record of localRecords) {
      await uploadRecord(tableName, record);
    }

    console.log(`Pushed ${localRecords.length} changes to ${tableName}`);
  } catch (error) {
    console.error(`Failed to push changes to ${tableName}:`, error);
  }
}

/**
 * Upload a local record to cloud with UPSERT
 */
async function uploadRecord(tableName: string, record: any): Promise<void> {
  if (!cloudConnection) {
    throw new Error('Cloud connection not initialized');
  }

  try {
    // Convert camelCase to snake_case for cloud
    const cloudRecord = convertLocalRecord(record, tableName);

    // Build column names and values
    const columns = Object.keys(cloudRecord);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(cloudRecord);

    // Build update clause
    const updateSet = columns
      .filter((col) => col !== 'id')
      .map((col) => `${col} = excluded.${col}`)
      .join(', ');

    // UPSERT with LWW conflict resolution
    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(id) DO UPDATE SET ${updateSet}
      WHERE excluded.modified_at > ${tableName}.modified_at
    `;

    await cloudConnection.sql(sql, values);
  } catch (error) {
    console.error(`Failed to upload record to ${tableName}:`, error);
    throw error;
  }
}

/**
 * Convert local record (camelCase) to cloud format (snake_case)
 */
function convertLocalRecord(record: any, tableName: string): any {
  const base: any = {
    id: record.id,
    created_at: record.createdAt,
    modified_at: record.modifiedAt,
    is_deleted: record.isDeleted ? 1 : 0,
  };

  // Add table-specific fields
  if (tableName === 'deck') {
    return {
      ...base,
      title: record.title,
      description: record.description,
      tags: JSON.stringify(record.tags || []),
      is_public: record.isPublic ? 1 : 0,
    };
  } else if (tableName === 'card') {
    return {
      ...base,
      deck_id: record.deckId,
      type: record.type,
      content: JSON.stringify(record.content),
      metadata: JSON.stringify(record.metadata || {}),
    };
  } else if (tableName === 'review_record') {
    return {
      ...base,
      card_id: record.cardId,
      interval_days: record.intervalDays,
      next_due_date: record.nextDueDate,
      stability: record.stability,
      difficulty: record.difficulty,
      retrievability_estimate: record.retrievabilityEstimate,
      ease_factor: record.easeFactor,
      history: JSON.stringify(record.history || []),
      total_reviews: record.totalReviews,
      lapse_count: record.lapseCount,
      last_review_at: record.lastReviewAt,
    };
  } else if (tableName === 'media') {
    return {
      ...base,
      type: record.type,
      file_path: record.filePath,
      alt_text: record.altText,
      mime_type: record.mimeType,
      file_size_bytes: record.fileSizeBytes,
      width: record.width,
      height: record.height,
      duration_ms: record.durationMs,
      checksum: record.checksum,
    };
  }

  return base;
}

/**
 * Start automatic background sync
 */
function startAutoSync(intervalMs: number): void {
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(() => {
    syncNow().catch((error) => {
      console.error('Auto-sync failed:', error);
    });
  }, intervalMs);

  console.log(`Auto-sync started with ${intervalMs}ms interval`);
}

/**
 * Stop automatic background sync
 */
export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('Auto-sync stopped');
  }
}

/**
 * Disconnect from SQLiteCloud
 */
export async function disconnectCloud(): Promise<void> {
  stopAutoSync();

  if (cloudConnection) {
    await cloudConnection.disconnect();
    cloudConnection = null;
    console.log('Disconnected from SQLiteCloud');
  }
}

/**
 * Get cloud connection status
 */
export function isCloudConnected(): boolean {
  return cloudConnection !== null;
}

/**
 * Handle offline mode
 */
export function handleOfflineMode(): void {
  console.log('Offline mode - changes will sync when connection restored');
  stopAutoSync();
}

/**
 * Handle online mode restoration
 */
export async function handleOnlineMode(config: SyncConfig): Promise<void> {
  console.log('Online mode restored - resuming sync');

  if (!isCloudConnected()) {
    await initCloudSync(config);
  } else {
    await syncNow();
    if (config.enableAutoSync) {
      startAutoSync(config.syncIntervalMs || 60000);
    }
  }
}
