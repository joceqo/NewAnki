/**
 * Card model - represents a single flashcard with various types
 * Supports: basic flashcard, MCQ, cloze, image occlusion
 */

export enum CardType {
  FLASHCARD = 'flashcard',
  MCQ = 'mcq',
  CLOZE = 'cloze',
  IMAGE_OCCLUSION = 'image_occlusion',
}

export interface Card {
  id: string; // UUID v4
  deck_id: string; // Foreign key to Deck
  type: CardType;
  content: CardContent; // JSON field - varies by type
  metadata: CardMetadata; // JSON field - additional data
  created_at: number; // Unix timestamp (ms)
  modified_at: number; // Unix timestamp (ms)
  is_deleted: boolean; // Soft delete flag for CRDT sync
}

// Card content types - varies by CardType
export interface FlashcardContent {
  front: string;
  back: string;
  front_media_id?: string; // Optional media attachment
  back_media_id?: string;
}

export interface MCQContent {
  question: string;
  options: string[]; // Array of answer choices
  correct_index: number; // Index of correct answer (0-based)
  explanation?: string; // Optional explanation after answer
  question_media_id?: string;
}

export interface ClozeContent {
  text: string; // Text with {{c1::cloze}} markers
  cloze_count: number; // Number of cloze deletions
  hints?: string[]; // Optional hints per cloze
}

export interface ImageOcclusionContent {
  image_media_id: string; // Reference to Media table
  occlusions: Occlusion[]; // Array of occluded regions
}

export interface Occlusion {
  id: string; // Unique ID for this occlusion
  x: number; // Position and size (percentage or pixels)
  y: number;
  width: number;
  height: number;
  label?: string; // Optional label for what's occluded
}

export type CardContent =
  | FlashcardContent
  | MCQContent
  | ClozeContent
  | ImageOcclusionContent;

// Metadata for additional card information
export interface CardMetadata {
  source?: string; // Where the card came from
  tags?: string[]; // Card-specific tags
  ai_generated?: boolean; // Whether AI created this card
  difficulty_override?: number; // Manual difficulty setting
  notes?: string; // User notes about the card
}

// Input types for creating/updating cards
export interface CreateCardInput {
  deck_id: string;
  type: CardType;
  content: CardContent;
  metadata?: Partial<CardMetadata>;
}

export interface UpdateCardInput {
  type?: CardType;
  content?: CardContent;
  metadata?: Partial<CardMetadata>;
}

export type CardWithReview = Card & {
  next_due_date?: number;
  interval_days?: number;
  is_due?: boolean;
};
