-- SQLite Schema for SRS Flashcard App with CRDT Sync Support
-- Compatible with SQLiteCloud cloudsync_init()
-- All tables use UUID primary keys for distributed sync

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================================================
-- DECK TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS deck (
  id TEXT PRIMARY KEY NOT NULL, -- UUID v4
  title TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL, -- Unix timestamp (ms)
  modified_at INTEGER NOT NULL, -- Unix timestamp (ms)
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  is_public INTEGER NOT NULL DEFAULT 0, -- Boolean: 0=private, 1=public
  is_deleted INTEGER NOT NULL DEFAULT 0, -- Soft delete flag for CRDT

  CHECK (length(id) = 36), -- UUID format validation
  CHECK (created_at > 0),
  CHECK (modified_at >= created_at),
  CHECK (is_public IN (0, 1)),
  CHECK (is_deleted IN (0, 1))
);

CREATE INDEX idx_deck_modified_at ON deck(modified_at);
CREATE INDEX idx_deck_is_deleted ON deck(is_deleted);
CREATE INDEX idx_deck_is_public ON deck(is_public) WHERE is_deleted = 0;

-- ============================================================================
-- CARD TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS card (
  id TEXT PRIMARY KEY NOT NULL, -- UUID v4
  deck_id TEXT NOT NULL,
  type TEXT NOT NULL, -- ENUM: flashcard, mcq, cloze, image_occlusion
  content TEXT NOT NULL, -- JSON field with card-specific content
  metadata TEXT NOT NULL DEFAULT '{}', -- JSON field for additional data
  created_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (deck_id) REFERENCES deck(id) ON DELETE CASCADE,

  CHECK (length(id) = 36),
  CHECK (type IN ('flashcard', 'mcq', 'cloze', 'image_occlusion')),
  CHECK (created_at > 0),
  CHECK (modified_at >= created_at),
  CHECK (is_deleted IN (0, 1)),
  CHECK (json_valid(content)),
  CHECK (json_valid(metadata))
);

CREATE INDEX idx_card_deck_id ON card(deck_id);
CREATE INDEX idx_card_type ON card(type);
CREATE INDEX idx_card_modified_at ON card(modified_at);
CREATE INDEX idx_card_is_deleted ON card(is_deleted);
CREATE INDEX idx_card_deck_active ON card(deck_id, is_deleted);

-- ============================================================================
-- REVIEW_RECORD TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS review_record (
  id TEXT PRIMARY KEY NOT NULL, -- UUID v4
  card_id TEXT NOT NULL UNIQUE, -- One review record per card

  -- FSRS scheduling parameters
  interval_days REAL NOT NULL DEFAULT 0,
  next_due_date INTEGER NOT NULL, -- Unix timestamp (ms)
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 5, -- FSRS difficulty (0-10)
  retrievability_estimate REAL NOT NULL DEFAULT 0, -- Probability 0-1

  -- SM-2 compatibility (optional, for migration)
  ease_factor REAL NOT NULL DEFAULT 2.5,

  -- Review history
  history TEXT NOT NULL DEFAULT '[]', -- JSON array of ReviewHistory objects

  -- Tracking metadata
  total_reviews INTEGER NOT NULL DEFAULT 0,
  lapse_count INTEGER NOT NULL DEFAULT 0,
  last_review_at INTEGER, -- NULL for new cards
  created_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (card_id) REFERENCES card(id) ON DELETE CASCADE,

  CHECK (length(id) = 36),
  CHECK (interval_days >= 0),
  CHECK (next_due_date > 0),
  CHECK (stability >= 0),
  CHECK (difficulty >= 0 AND difficulty <= 10),
  CHECK (retrievability_estimate >= 0 AND retrievability_estimate <= 1),
  CHECK (ease_factor >= 1.3),
  CHECK (total_reviews >= 0),
  CHECK (lapse_count >= 0),
  CHECK (total_reviews >= lapse_count),
  CHECK (created_at > 0),
  CHECK (modified_at >= created_at),
  CHECK (is_deleted IN (0, 1)),
  CHECK (json_valid(history))
);

CREATE INDEX idx_review_card_id ON review_record(card_id);
CREATE INDEX idx_review_next_due ON review_record(next_due_date) WHERE is_deleted = 0;
CREATE INDEX idx_review_modified_at ON review_record(modified_at);
CREATE INDEX idx_review_last_review ON review_record(last_review_at);

-- ============================================================================
-- MEDIA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY NOT NULL, -- UUID v4
  type TEXT NOT NULL, -- ENUM: image, audio, video
  file_path TEXT NOT NULL, -- Local path or cloud URL
  alt_text TEXT, -- Accessibility description
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  width INTEGER, -- For images/videos
  height INTEGER, -- For images/videos
  duration_ms INTEGER, -- For audio/video
  checksum TEXT NOT NULL, -- SHA-256 for deduplication
  created_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,

  CHECK (length(id) = 36),
  CHECK (type IN ('image', 'audio', 'video')),
  CHECK (file_size_bytes >= 0),
  CHECK (width IS NULL OR width > 0),
  CHECK (height IS NULL OR height > 0),
  CHECK (duration_ms IS NULL OR duration_ms > 0),
  CHECK (created_at > 0),
  CHECK (modified_at >= created_at),
  CHECK (is_deleted IN (0, 1))
);

CREATE UNIQUE INDEX idx_media_checksum ON media(checksum) WHERE is_deleted = 0;
CREATE INDEX idx_media_type ON media(type);
CREATE INDEX idx_media_modified_at ON media(modified_at);
CREATE INDEX idx_media_is_deleted ON media(is_deleted);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Active cards with review info
CREATE VIEW IF NOT EXISTS v_cards_with_reviews AS
SELECT
  c.*,
  r.next_due_date,
  r.interval_days,
  r.total_reviews,
  r.last_review_at,
  CASE
    WHEN r.next_due_date IS NULL THEN 1 -- New card
    WHEN r.next_due_date <= strftime('%s', 'now') * 1000 THEN 1 -- Due
    ELSE 0
  END as is_due
FROM card c
LEFT JOIN review_record r ON c.id = r.card_id AND r.is_deleted = 0
WHERE c.is_deleted = 0;

-- View: Deck statistics
CREATE VIEW IF NOT EXISTS v_deck_stats AS
SELECT
  d.id,
  d.title,
  COUNT(DISTINCT c.id) as total_cards,
  COUNT(DISTINCT CASE WHEN r.next_due_date <= strftime('%s', 'now') * 1000 THEN c.id END) as due_count,
  COUNT(DISTINCT CASE WHEN r.next_due_date IS NULL THEN c.id END) as new_count,
  AVG(r.interval_days) as avg_interval
FROM deck d
LEFT JOIN card c ON d.id = c.deck_id AND c.is_deleted = 0
LEFT JOIN review_record r ON c.id = r.card_id AND r.is_deleted = 0
WHERE d.is_deleted = 0
GROUP BY d.id;

-- View: Daily review statistics
CREATE VIEW IF NOT EXISTS v_daily_stats AS
SELECT
  date(last_review_at / 1000, 'unixepoch') as review_date,
  COUNT(*) as review_count,
  AVG(CASE WHEN json_extract(history, '$[#-1].grade') >= 3 THEN 1.0 ELSE 0.0 END) as success_rate
FROM review_record
WHERE last_review_at IS NOT NULL AND is_deleted = 0
GROUP BY review_date
ORDER BY review_date DESC;

-- ============================================================================
-- TRIGGERS FOR CRDT SYNC
-- ============================================================================

-- Auto-update modified_at on deck changes
CREATE TRIGGER IF NOT EXISTS trg_deck_update_modified
AFTER UPDATE ON deck
FOR EACH ROW
WHEN NEW.modified_at = OLD.modified_at
BEGIN
  UPDATE deck SET modified_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
END;

-- Auto-update modified_at on card changes
CREATE TRIGGER IF NOT EXISTS trg_card_update_modified
AFTER UPDATE ON card
FOR EACH ROW
WHEN NEW.modified_at = OLD.modified_at
BEGIN
  UPDATE card SET modified_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
END;

-- Auto-update modified_at on review_record changes
CREATE TRIGGER IF NOT EXISTS trg_review_update_modified
AFTER UPDATE ON review_record
FOR EACH ROW
WHEN NEW.modified_at = OLD.modified_at
BEGIN
  UPDATE review_record SET modified_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
END;

-- Auto-update modified_at on media changes
CREATE TRIGGER IF NOT EXISTS trg_media_update_modified
AFTER UPDATE ON media
FOR EACH ROW
WHEN NEW.modified_at = OLD.modified_at
BEGIN
  UPDATE media SET modified_at = strftime('%s', 'now') * 1000 WHERE id = NEW.id;
END;

-- Cascade deck deletion to cards (soft delete)
CREATE TRIGGER IF NOT EXISTS trg_deck_soft_delete
AFTER UPDATE OF is_deleted ON deck
FOR EACH ROW
WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0
BEGIN
  UPDATE card SET is_deleted = 1 WHERE deck_id = NEW.id;
END;

-- Cascade card deletion to review records (soft delete)
CREATE TRIGGER IF NOT EXISTS trg_card_soft_delete
AFTER UPDATE OF is_deleted ON card
FOR EACH ROW
WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0
BEGIN
  UPDATE review_record SET is_deleted = 1 WHERE card_id = NEW.id;
END;
