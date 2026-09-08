/* ═══════════════════════════════════════════════════════════
   Storage.js
   Local JSON database persistence layer adapter.
   Delegates all diary storage and retrieval operations to
   JournalStorage (journal_database.json backend).
   Browser-only localStorage for journal database is removed.
   ═══════════════════════════════════════════════════════════ */

function getActiveUserId() {
  try {
    if (typeof loadUserSettings === 'function') {
      const settings = loadUserSettings();
      if (settings && settings.username) {
        return settings.username;
      }
    }
  } catch (e) {
    // ignore
  }
  return 'User';
}

/**
 * Loads a single day's diary entry from the JSON database layer.
 * @param {string} isoDate
 * @returns {object|null}
 */
function loadDiaryEntry(isoDate) {
  const userId = getActiveUserId();
  if (window.JournalStorage) {
    return window.JournalStorage.getJournalByDate(userId, isoDate);
  }
  return null;
}

/**
 * Saves or updates a diary entry in the JSON database layer for today/selected date.
 * @param {string} isoDate
 * @param {{content?:string, mood?:string, intensity?:number, note?:string}} fields
 * @returns {object} saved entry
 */
function saveDiaryEntry(isoDate, fields) {
  const userId = getActiveUserId();
  const entry = Object.assign({ date: isoDate }, fields, {
    emotion: fields && (fields.emotion || fields.mood || 'neutral')
  });

  if (window.JournalStorage) {
    window.JournalStorage.saveJournal(userId, entry);
  }

  return entry;
}

/**
 * Returns all diary entries for current user as an array of {date, ...entry}, newest first.
 * @returns {Array<object>}
 */
function listDiaryEntries() {
  const userId = getActiveUserId();
  if (window.JournalStorage) {
    if (Array.isArray(window.JournalStorage._journals) && window.JournalStorage._journals.length === 0) {
      if (typeof window.JournalStorage.getUser === 'function') {
        window.JournalStorage.getUser(userId).catch(() => {});
      }
    }
    return window.JournalStorage.getAllJournals(userId);
  }
  return [];
}

async function refreshDiaryEntriesFromBackend() {
  const userId = getActiveUserId();
  if (window.JournalStorage && typeof window.JournalStorage.getUser === 'function') {
    const data = await window.JournalStorage.getUser(userId);
    if (Array.isArray(data && data.journals)) {
      window.JournalStorage._journals = data.journals;
    }
  }
}

/**
 * Reads all diary entries as a key-value object { [date]: entry }.
 * @returns {Object.<string, object>}
 */
function dsLoadAll() {
  const entries = listDiaryEntries();
  const map = {};
  entries.forEach(e => {
    if (e.date) map[e.date] = e;
  });
  return map;
}

// Expose as namespaced API for existing UI callers
window.DiaryStorage = {
  saveEntry: saveDiaryEntry,
  loadEntry: loadDiaryEntry,
  listEntries: listDiaryEntries,
  loadAll: dsLoadAll,
  refreshFromBackend: refreshDiaryEntriesFromBackend
};