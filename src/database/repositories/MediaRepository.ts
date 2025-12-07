/**
 * Media Repository - Drizzle ORM
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { getDatabase, generateUUID, getCurrentTimestamp } from '../db-drizzle';
import { media, card } from '../schema';
import { MediaType } from '../../models/Media';
import type { CreateMediaInput, UpdateMediaInput } from '../../models/Media';

export class MediaRepository {
  /**
   * Create a new media record (with automatic deduplication)
   */
  static async create(input: CreateMediaInput) {
    const db = getDatabase();

    // Check if media with same checksum already exists
    const existing = await this.findByChecksum(input.checksum);
    if (existing) {
      return existing;
    }

    const now = getCurrentTimestamp();

    const newMedia = {
      id: generateUUID(),
      type: input.type,
      filePath: input.file_path,
      altText: input.alt_text ?? null,
      mimeType: input.mime_type,
      fileSizeBytes: input.file_size_bytes,
      width: input.width ?? null,
      height: input.height ?? null,
      durationMs: input.duration_ms ?? null,
      checksum: input.checksum,
      createdAt: now,
      modifiedAt: now,
      isDeleted: false,
    };

    await db.insert(media).values(newMedia);
    return newMedia;
  }

  /**
   * Find media by ID
   */
  static async findById(id: string) {
    const db = getDatabase();

    const result = await db
      .select()
      .from(media)
      .where(and(eq(media.id, id), eq(media.isDeleted, false)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find media by checksum (for deduplication)
   */
  static async findByChecksum(checksum: string) {
    const db = getDatabase();

    const result = await db
      .select()
      .from(media)
      .where(and(eq(media.checksum, checksum), eq(media.isDeleted, false)))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find all media by type
   */
  static async findByType(type: MediaType) {
    const db = getDatabase();

    return await db
      .select()
      .from(media)
      .where(and(eq(media.type, type), eq(media.isDeleted, false)))
      .orderBy(desc(media.createdAt));
  }

  /**
   * Find all media
   */
  static async findAll() {
    const db = getDatabase();

    return await db
      .select()
      .from(media)
      .where(eq(media.isDeleted, false))
      .orderBy(desc(media.createdAt));
  }

  /**
   * Find unused media (not referenced by any cards)
   */
  static async findUnused() {
    const db = getDatabase();

    return await db
      .select()
      .from(media)
      .where(
        and(
          eq(media.isDeleted, false),
          sql`NOT EXISTS (
            SELECT 1 FROM ${card}
            WHERE ${card.isDeleted} = 0
            AND ${card.content} LIKE '%' || ${media.id} || '%'
          )`
        )
      )
      .orderBy(desc(media.createdAt));
  }

  /**
   * Get media with usage count
   */
  static async findWithUsage() {
    const db = getDatabase();

    return await db
      .select({
        id: media.id,
        type: media.type,
        filePath: media.filePath,
        altText: media.altText,
        mimeType: media.mimeType,
        fileSizeBytes: media.fileSizeBytes,
        width: media.width,
        height: media.height,
        durationMs: media.durationMs,
        checksum: media.checksum,
        createdAt: media.createdAt,
        modifiedAt: media.modifiedAt,
        isDeleted: media.isDeleted,
        usageCount: sql<number>`(
          SELECT COUNT(*)
          FROM ${card}
          WHERE ${card.isDeleted} = 0
          AND ${card.content} LIKE '%' || ${media.id} || '%'
        )`.as('usage_count'),
      })
      .from(media)
      .where(eq(media.isDeleted, false))
      .orderBy(desc(media.createdAt));
  }

  /**
   * Update media
   */
  static async update(id: string, input: UpdateMediaInput) {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    const updates: any = { modifiedAt: now };

    if (input.file_path !== undefined) updates.filePath = input.file_path;
    if (input.alt_text !== undefined) updates.altText = input.alt_text;
    if (input.mime_type !== undefined) updates.mimeType = input.mime_type;

    await db.update(media).set(updates).where(eq(media.id, id));

    return this.findById(id);
  }

  /**
   * Soft delete media
   */
  static async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const now = getCurrentTimestamp();

    await db
      .update(media)
      .set({ isDeleted: true, modifiedAt: now })
      .where(eq(media.id, id));

    // Verify deletion by checking if record exists
    const deleted = await this.findById(id);
    return deleted === null;
  }

  /**
   * Get total storage usage
   */
  static async getTotalStorageUsage(): Promise<number> {
    const db = getDatabase();

    const [result] = await db
      .select({
        total: sql<number>`SUM(${media.fileSizeBytes})`,
      })
      .from(media)
      .where(eq(media.isDeleted, false));

    return result?.total || 0;
  }

  /**
   * Get storage usage by type
   */
  static async getStorageUsageByType(): Promise<Record<MediaType, number>> {
    const db = getDatabase();

    const results = await db
      .select({
        type: media.type,
        total: sql<number>`SUM(${media.fileSizeBytes})`,
      })
      .from(media)
      .where(eq(media.isDeleted, false))
      .groupBy(media.type);

    const usage: Record<string, number> = {
      image: 0,
      audio: 0,
      video: 0,
    };

    for (const row of results) {
      if (row.type) {
        usage[row.type] = row.total || 0;
      }
    }

    return usage as Record<MediaType, number>;
  }
}
