A local‑history backup like PyCharm’s is a great safety net. I’ll outline a lightweight, performant design that fits your Electron + React app and doesn’t abuse the user’s disk.

---

## Core idea
- **Silently capture a snapshot every time a file is saved** (or when the user stops typing for a few seconds).  
- **Store only the changes** (diffs) or full snapshots in a compact SQLite database.  
- **Let the user browse past versions** and restore any one with a single click.

---

## Architecture

```
Renderer (React)                  Main Process
┌─────────────────┐               ┌──────────────────────────┐
│ FileContextMenu  │  IPC event    │  historyHandler.cjs      │
│ LocalHistoryPanel│─────────────→│  - saveSnapshot()         │
│ (right panel)    │              │  - getHistory(filePath)   │
│                 │←─────────────│  - restore(filePath, id)  │
│                 │  IPC result   │  - pruneOldVersions()     │
└─────────────────┘               └──────────┬───────────────┘
                                             │
                                      SQLite DB (userData/history.db)
                                      Tables:
                                      - snapshots(id, filePath, timestamp, contentBlob, changeDesc?)
```

---

## Key design decisions

| Decision | Why |
|----------|-----|
| **Store full file content, not diffs** | Simpler, faster restore, and disk is cheap for text files. |
| **Use SQLite** (`better-sqlite3`) | Embedded, zero‑config, very fast, can compress via `zlib`. |
| **Trigger on file save only** (not keystrokes) | Avoids flooding the DB; still captures every meaningful state. |
| **Exclude binary files & heavy folders** | Only track text files (< 500 KB), skip `node_modules`, `.venv`, `build/`, etc. |
| **Retention policy** | Keep up to 50 versions per file, delete older ones (configurable). |
| **Global storage cap** | ~100 MB, after which oldest snapshots are purged. |
| **UI panel** | A “Local History” tab in the right panel (like chat/browser). |

---

## Database schema

```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  filePath  TEXT NOT NULL,
  timestamp INTEGER NOT NULL,   -- Unix ms
  content   BLOB NOT NULL,      -- compressed original text
  size      INTEGER NOT NULL    -- bytes of uncompressed content
);
CREATE INDEX idx_history_file ON snapshots(filePath, timestamp);
```

---

## IPC handlers (main process)

### 1. `history:save`
Called when a file is saved (or autosaved). The frontend sends the file path and current content.  
The handler:
- Checks if the file should be tracked (extension in allowed list, size < limit, not in excluded dirs).
- Compresses content with `zlib.deflateSync`.
- Inserts a row into SQLite.
- Trims old versions for that file (keep last 50).
- Periodically checks global DB size and purges if needed.

### 2. `history:list`
Returns an array of `{ id, timestamp, size }` for a given file path, sorted by date descending.

### 3. `history:restore`
Given a snapshot ID, returns the uncompressed content. The frontend can then write it to the file or open a diff view.

### 4. `history:delete`
Deletes a specific snapshot or all history for a file.

---

## Frontend integration

### Trigger save in `CodeEditor.tsx` or `EditorContainer.tsx`
After the file is saved (you already have `MARK_TAB_SAVED`), call:
```ts
Cordex.history.save({ filePath: tab.path, content: tab.content });
```

### UI panel
Add a new right‑panel component `LocalHistoryPanel.tsx` that:
- Lists snapshots for the currently active file (fetched via `history:list`).
- Shows timestamp and a preview (first 100 chars).
- Has a **Restore** button that either replaces the editor content or opens a diff modal.
- Has a **Clear all** button.

Add a “Local History” button in the toolbar (or sidebar) that toggles this panel, similar to Chat/Browser.

---

## Performance & disk usage

- **Compression** reduces text to ~10–20% of original size. Even 50 versions of a 50KB file = ~2.5MB compressed.  
- **SQLite** with an index is lightning fast for lookups.  
- **Global cap** prevents runaway disk use.  
- **Skipping large/binary files** keeps the DB lean.

---

## Implementation plan (I can provide code for each part)

1. **Set up SQLite** in `electron/utils/historyDb.cjs` (connection, table creation, helper functions).  
2. **Create `historyHandler.cjs`** with the four IPC handlers.  
3. **Expose `Cordex.history`** in `preload.cjs`.  
4. **Hook into the save flow** in `EditorContainer` or `useFileTree`.  
5. **Build `LocalHistoryPanel.tsx`** component.  
6. **Add the toggle button** to the toolbar or right panel container.

Would you like me to write the exact code for the SQLite helper and `historyHandler.cjs` first? Then we can proceed to the UI.