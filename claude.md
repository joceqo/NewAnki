## Application Goal

Build a modern spaced-repetition flashcard app (Anki alternative) using React Native CLI that fills gaps in existing solutions:

**Core Value Proposition:**

- Offline-first with automatic cloud sync (CRDT-based)
- Multiple card types: flashcards, MCQ, cloze, image occlusion
- FSRS algorithm (20-30% fewer reviews vs SM-2)
- Modern UI/UX (Tamagui)
- Optional TTS/STT for accessibility
- AI-assisted card generation

**Tech Stack:**

- React Native CLI (not Expo)
- SQLiteCloud with SQLite-Sync (offline + CRDT sync)
- Tamagui (cross-platform UI)
- FSRS npm package (scheduling)
- Notifee (notifications)

**Target Users:**

Students and learners who want:

- Simpler UX than Anki
- Reliable offline mode + cross-device sync
- Quiz-style MCQ testing
- Voice features
- Fast card creation (manual + AI)
