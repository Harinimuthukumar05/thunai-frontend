/* ═══════════════════════════════════════════════════════════
   JournalService.js
   Service wrapper bridging UI and JournalStorage layer.
   Maintains backward compatibility with any existing callers.
   ═══════════════════════════════════════════════════════════ */

const JournalService = {
  async syncFromBackend(userId) {
    if (!userId) return false;
    if (window.JournalStorage) {
      await window.JournalStorage.getUser(userId);
      return true;
    }
    return false;
  },

  async saveToBackend(userId, isoDate, fields) {
    if (!userId) return false;
    if (window.JournalStorage) {
      const entry = Object.assign({ date: isoDate }, fields);
      await window.JournalStorage.saveJournal(userId, entry);
      return true;
    }
    return false;
  }
};

window.JournalService = JournalService;
