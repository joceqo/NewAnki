/**
 * Media model - stores references to images, audio, video files
 * Used by cards for rich content (image occlusion, TTS audio, etc.)
 */

export enum MediaType {
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
}

export interface Media {
  id: string; // UUID v4
  type: MediaType;
  file_path: string; // Local file path or cloud URL
  alt_text: string | null; // Accessibility description
  mime_type: string; // e.g., 'image/png', 'audio/mp3'
  file_size_bytes: number; // File size for storage tracking
  width: number | null; // For images/videos
  height: number | null; // For images/videos
  duration_ms: number | null; // For audio/video
  checksum: string; // SHA-256 hash for deduplication
  created_at: number; // Unix timestamp (ms)
  modified_at: number; // Unix timestamp (ms)
  is_deleted: boolean; // Soft delete flag
}

export interface CreateMediaInput {
  type: MediaType;
  file_path: string;
  alt_text?: string;
  mime_type: string;
  file_size_bytes: number;
  width?: number;
  height?: number;
  duration_ms?: number;
  checksum: string;
}

export interface UpdateMediaInput {
  file_path?: string;
  alt_text?: string;
  mime_type?: string;
}

// Helper type for media with usage count
export type MediaWithUsage = Media & {
  usage_count: number; // How many cards reference this media
};
