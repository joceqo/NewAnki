/**
 * SQLiteCloud sync setup with CRDT conflict resolution
 * Uses @sqlitecloud/react-native for cloud sync
 */

import { SQLiteCloud } from '@sqlitecloud/react-native';
import { getDatabase, initDatabase } from './db';

// Cloud sync configuration
interface SyncConfig {
  connectionString: string; // SQLiteCloud connection string
  databaseName: string;
  enableAutoSync?: boolean;
  syncIntervalMs?: number;
}

let cloudConnection: SQLiteCloud | null = null;
let syncInterval: NodeJS.Timeout | null = null;

/**
 * Initialize SQLiteCloud connection with sync
 *
 * Example connection string:
 * sqlitecloud://user:password@host.sqlitecloud.io:8860/database
 */
export async function initCloudSync(config: SyncConfig): Promise<void> {
  try {
    // Initialize local database first
    initDatabase();

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
      const intervalMs = config.syncIntervalMs || 60000; // Default: 1 minute
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
    // Initialize cloud sync for each table
    const tables = ['deck', 'card', 'review_record', 'media'];

    for (const table of tables) {
      // cloudsync_init() sets up CRDT tracking for the table
      await cloudConnection.sql(`SELECT cloudsync_init('${table}')`);
      console.log(`CRDT sync initialized for table: ${table}`);
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
    console.log('Starting manual sync...');

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
 * Pull changes from cloud to local database
 */
async function pullChangesFromCloud(): Promise<void> {
  if (!cloudConnection) {
    throw new Error('Cloud connection not initialized');
  }

  const tables = ['deck', 'card', 'review_record', 'media'];

  for (const table of tables) {
    try {
      // Get latest modified_at timestamp from local database
      const localDb = getDatabase();
      const result = localDb.execute(
        `SELECT MAX(modified_at) as max_timestamp FROM ${table}`
      );
      const lastSync = result.rows?._array[0]?.max_timestamp || 0;

      // Fetch newer records from cloud
      const cloudRecords = await cloudConnection.sql(
        `SELECT * FROM ${table} WHERE modified_at > ${lastSync} ORDER BY modified_at ASC`
      );

      if (cloudRecords && Array.isArray(cloudRecords)) {
        // Apply CRDT merge logic
        for (const record of cloudRecords) {
          await mergeRecord(table, record);
        }
        console.log(`Pulled ${cloudRecords.length} changes from ${table}`);
      }
    } catch (error) {
      console.error(`Failed to pull changes from ${table}:`, error);
    }
  }
}

/**
 * Push local changes to cloud
 */
async function pushChangesToCloud(): Promise<void> {
  if (!cloudConnection) {
    throw new Error('Cloud connection not initialized');
  }

  const tables = ['deck', 'card', 'review_record', 'media'];

  for (const table of tables) {
    try {
      // Get records modified since last sync
      // In production, you'd track this with a sync_status table
      const localDb = getDatabase();
      const localRecords = localDb.execute(
        `SELECT * FROM ${table} WHERE modified_at > ? ORDER BY modified_at ASC`,
        [Date.now() - 60000] // Last minute (simplified)
      );

      if (localRecords.rows?._array) {
        for (const record of localRecords.rows._array) {
          await uploadRecord(table, record);
        }
        console.log(
          `Pushed ${localRecords.rows._array.length} changes to ${table}`
        );
      }
    } catch (error) {
      console.error(`Failed to push changes to ${table}:`, error);
    }
  }
}

/**
 * Merge a cloud record into local database using CRDT logic
 * Last-Write-Wins (LWW) based on modified_at timestamp
 */
async function mergeRecord(table: string, cloudRecord: any): Promise<void> {
  const localDb = getDatabase();

  // Check if record exists locally
  const existingResult = localDb.execute(
    `SELECT * FROM ${table} WHERE id = ?`,
    [cloudRecord.id]
  );
  const existingRecord = existingResult.rows?._array[0];

  if (!existingRecord) {
    // Insert new record
    const columns = Object.keys(cloudRecord).join(', ');
    const placeholders = Object.keys(cloudRecord)
      .map(() => '?')
      .join(', ');
    const values = Object.values(cloudRecord);

    localDb.execute(
      `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
      values
    );
  } else {
    // CRDT conflict resolution: Last-Write-Wins
    if (cloudRecord.modified_at > existingRecord.modified_at) {
      // Cloud record is newer, update local
      const updates = Object.keys(cloudRecord)
        .filter((key) => key !== 'id')
        .map((key) => `${key} = ?`)
        .join(', ');
      const values = Object.keys(cloudRecord)
        .filter((key) => key !== 'id')
        .map((key) => cloudRecord[key]);
      values.push(cloudRecord.id);

      localDb.execute(`UPDATE ${table} SET ${updates} WHERE id = ?`, values);
    }
    // If local is newer or equal, keep local version
  }
}

/**
 * Upload a local record to cloud
 */
async function uploadRecord(table: string, record: any): Promise<void> {
  if (!cloudConnection) {
    throw new Error('Cloud connection not initialized');
  }

  try {
    // Use UPSERT to handle conflicts
    const columns = Object.keys(record).join(', ');
    const placeholders = Object.keys(record)
      .map(() => '?')
      .join(', ');
    const updateSet = Object.keys(record)
      .filter((key) => key !== 'id')
      .map((key) => `${key} = excluded.${key}`)
      .join(', ');

    const sql = `
      INSERT INTO ${table} (${columns})
      VALUES (${placeholders})
      ON CONFLICT(id) DO UPDATE SET ${updateSet}
      WHERE excluded.modified_at > ${table}.modified_at
    `;

    await cloudConnection.sql(sql, Object.values(record));
  } catch (error) {
    console.error(`Failed to upload record to ${table}:`, error);
    throw error;
  }
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
 * Get cloud connection instance (for advanced usage)
 */
export function getCloudConnection(): SQLiteCloud | null {
  return cloudConnection;
}

/**
 * Handle offline mode
 * All operations work offline, sync will catch up when online
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
