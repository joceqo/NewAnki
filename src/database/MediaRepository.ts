/**
 * CRUD operations for Media model
 */

import {
  query,
  queryFirst,
  executeRaw,
  generateUUID,
  getCurrentTimestamp,
  softDelete,
} from './db';
import type {
  Media,
  MediaType,
  CreateMediaInput,
  UpdateMediaInput,
  MediaWithUsage,
} from '../models/Media';

export class MediaRepository {
  /**
   * Create a new media record
   */
  static async create(input: CreateMediaInput): Promise<Media> {
    // Check if media with same checksum already exists (deduplication)
    const existing = await this.findByChecksum(input.checksum);
    if (existing) {
      return existing;
    }

    const now = getCurrentTimestamp();
    const media: Media = {
      id: generateUUID(),
      type: input.type,
      file_path: input.file_path,
      alt_text: input.alt_text ?? null,
      mime_type: input.mime_type,
      file_size_bytes: input.file_size_bytes,
      width: input.width ?? null,
      height: input.height ?? null,
      duration_ms: input.duration_ms ?? null,
      checksum: input.checksum,
      created_at: now,
      modified_at: now,
      is_deleted: false,
    };

    executeRaw(
      `INSERT INTO media (
        id, type, file_path, alt_text, mime_type, file_size_bytes,
        width, height, duration_ms, checksum, created_at, modified_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        media.id,
        media.type,
        media.file_path,
        media.alt_text,
        media.mime_type,
        media.file_size_bytes,
        media.width,
        media.height,
        media.duration_ms,
        media.checksum,
        media.created_at,
        media.modified_at,
        media.is_deleted ? 1 : 0,
      ]
    );

    return media;
  }

  /**
   * Find media by ID
   */
  static async findById(id: string): Promise<Media | null> {
    const row = queryFirst<any>(
      'SELECT * FROM media WHERE id = ? AND is_deleted = 0',
      [id]
    );

    return row ? this.mapRowToMedia(row) : null;
  }

  /**
   * Find media by checksum (for deduplication)
   */
  static async findByChecksum(checksum: string): Promise<Media | null> {
    const row = queryFirst<any>(
      'SELECT * FROM media WHERE checksum = ? AND is_deleted = 0',
      [checksum]
    );

    return row ? this.mapRowToMedia(row) : null;
  }

  /**
   * Find all media by type
   */
  static async findByType(type: MediaType): Promise<Media[]> {
    const rows = query<any>(
      'SELECT * FROM media WHERE type = ? AND is_deleted = 0 ORDER BY created_at DESC',
      [type]
    );

    return rows.map(this.mapRowToMedia);
  }

  /**
   * Find all media
   */
  static async findAll(): Promise<Media[]> {
    const rows = query<any>(
      'SELECT * FROM media WHERE is_deleted = 0 ORDER BY created_at DESC'
    );

    return rows.map(this.mapRowToMedia);
  }

  /**
   * Find unused media (not referenced by any cards)
   */
  static async findUnused(): Promise<Media[]> {
    const rows = query<any>(
      `SELECT m.* FROM media m
       WHERE m.is_deleted = 0
       AND NOT EXISTS (
         SELECT 1 FROM card c
         WHERE c.is_deleted = 0
         AND (
           c.content LIKE '%' || m.id || '%'
         )
       )
       ORDER BY m.created_at DESC`
    );

    return rows.map(this.mapRowToMedia);
  }

  /**
   * Get media with usage count
   */
  static async findWithUsage(): Promise<MediaWithUsage[]> {
    const rows = query<any>(
      `SELECT m.*,
         (SELECT COUNT(*)
          FROM card c
          WHERE c.is_deleted = 0
          AND c.content LIKE '%' || m.id || '%'
         ) as usage_count
       FROM media m
       WHERE m.is_deleted = 0
       ORDER BY m.created_at DESC`
    );

    return rows.map((row) => ({
      ...this.mapRowToMedia(row),
      usage_count: row.usage_count || 0,
    }));
  }

  /**
   * Update media
   */
  static async update(id: string, input: UpdateMediaInput): Promise<Media | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const now = getCurrentTimestamp();
    const updates: string[] = [];
    const params: any[] = [];

    if (input.file_path !== undefined) {
      updates.push('file_path = ?');
      params.push(input.file_path);
    }
    if (input.alt_text !== undefined) {
      updates.push('alt_text = ?');
      params.push(input.alt_text);
    }
    if (input.mime_type !== undefined) {
      updates.push('mime_type = ?');
      params.push(input.mime_type);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('modified_at = ?');
    params.push(now);
    params.push(id);

    executeRaw(
      `UPDATE media SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    return this.findById(id);
  }

  /**
   * Soft delete media
   */
  static async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    softDelete('media', id);
    return true;
  }

  /**
   * Get total storage usage
   */
  static async getTotalStorageUsage(): Promise<number> {
    const result = queryFirst<{ total: number }>(
      'SELECT SUM(file_size_bytes) as total FROM media WHERE is_deleted = 0'
    );
    return result?.total || 0;
  }

  /**
   * Get storage usage by type
   */
  static async getStorageUsageByType(): Promise<
    Record<MediaType, number>
  > {
    const rows = query<{ type: MediaType; total: number }>(
      `SELECT type, SUM(file_size_bytes) as total
       FROM media
       WHERE is_deleted = 0
       GROUP BY type`
    );

    const usage: Record<MediaType, number> = {
      [MediaType.IMAGE]: 0,
      [MediaType.AUDIO]: 0,
      [MediaType.VIDEO]: 0,
    };

    for (const row of rows) {
      usage[row.type] = row.total;
    }

    return usage;
  }

  /**
   * Map database row to Media model
   */
  private static mapRowToMedia(row: any): Media {
    return {
      id: row.id,
      type: row.type as MediaType,
      file_path: row.file_path,
      alt_text: row.alt_text,
      mime_type: row.mime_type,
      file_size_bytes: row.file_size_bytes,
      width: row.width,
      height: row.height,
      duration_ms: row.duration_ms,
      checksum: row.checksum,
      created_at: row.created_at,
      modified_at: row.modified_at,
      is_deleted: Boolean(row.is_deleted),
    };
  }
}
