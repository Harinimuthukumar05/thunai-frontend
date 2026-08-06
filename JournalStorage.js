/* ═══════════════════════════════════════════════════════════
   JournalStorage.js
   Clean Storage API layer for local JSON database persistence.
   Manages all user profile creation, journal entry saving,
   editing, and retrieval against the persistent JSON database
   (journal_database.json).
   ═══════════════════════════════════════════════════════════ */

const JournalStorage = {
  // In-memory cache for fast UI rendering
  _currentUserId: 'User',
  _currentName: '',
  _journals: [],

  /**
   * Returns API endpoint base URL.
   */
  getApiBase() {
    return window.getApiBase();
  },

  /**
   * Creates or loads a user in the JSON database.
   * If User ID already exists, loads existing user's journal entries.
   * If User ID does not exist, creates a new user object.
   * @param {string} userId - Unique User ID
   * @param {string} name - Display Name (optional)
   * @returns {Promise<object>} { userId, name, journals }
   */
  async createUser(userId, name = '') {
    if (!userId || !userId.trim()) userId = 'User';
    userId = userId.trim();
    this._currentUserId = userId;
    if (name) this._currentName = name.trim();

    try {
      const url = `${this.getApiBase()}/api/users`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name: this._currentName })
      });
      if (res.ok) {
        const data = await res.json();
        this._currentUserId = data.userId || userId;
        this._currentName = data.name || this._currentName || userId;
        this._journals = Array.isArray(data.journals) ? data.journals : [];
        console.log('JournalStorage: createUser success for', userId, 'journals:', this._journals.length);
        return data;
      }
    } catch (e) {
      console.warn('JournalStorage: createUser API request failed, falling back to getUser', e);
    }

    return await this.getUser(userId);
  },

  /**
   * Retrieves a user's profile and journal history from the JSON database.
   * @param {string} userId
   * @returns {Promise<object>} { userId, name, journals }
   */
  async getUser(userId) {
    if (!userId || !userId.trim()) userId = this._currentUserId || 'User';
    userId = userId.trim();
    this._currentUserId = userId;

    try {
      const url = `${this.getApiBase()}/journals/${encodeURIComponent(userId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this._currentUserId = data.userId || userId;
        if (data.name) this._currentName = data.name;
        this._journals = Array.isArray(data.journals) ? data.journals : [];
        return data;
      }
    } catch (e) {
      console.warn('JournalStorage: getUser API request failed', e);
    }

    return {
      userId: this._currentUserId,
      name: this._currentName || this._currentUserId,
      journals: this._journals
    };
  },

  /**
   * Saves or updates a journal entry for a calendar date in the JSON database.
   * Only one journal entry exists per user per date.
   * Updates lastUpdated timestamp.
   * @param {string} userId
   * @param {object} entry { date, content, mood, intensity, note, lastUpdated }
   * @returns {Promise<object>} saved entry
   */
  async saveJournal(userId, entry) {
    if (!userId || !userId.trim()) userId = this._currentUserId || 'User';
    userId = userId.trim();
    this._currentUserId = userId;

    if (!entry || !entry.date) return null;

    const isoDate = entry.date;
    const nowIso = new Date().toISOString();

    const formattedEntry = {
      userId,
      date: isoDate,
      content: entry.content !== undefined ? entry.content : '',
      mood: entry.mood !== undefined ? entry.mood : '',
      intensity: entry.intensity !== undefined ? entry.intensity : null,
      note: entry.note !== undefined ? entry.note : '',
      lastUpdated: entry.lastUpdated || nowIso
    };

    // Update in-memory cache immediately so UI reflects change fast
    const existingIdx = this._journals.findIndex(j => j.date === isoDate);
    if (existingIdx >= 0) {
      this._journals[existingIdx] = Object.assign({}, this._journals[existingIdx], formattedEntry);
    } else {
      this._journals.push(formattedEntry);
    }

    // Persist to local JSON database via backend API
    try {
      const url = `${this.getApiBase()}/journals/${encodeURIComponent(userId)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formattedEntry)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.journals)) {
          this._journals = data.journals;
        }
      }
    } catch (e) {
      console.warn('JournalStorage: saveJournal backend sync failed', e);
    }

    // Invalidate analytics cache so Insights page updates automatically next time opened
    if (window.InsightsAnalytics) {
      window.InsightsAnalytics.invalidateCache(userId);
    }

    return formattedEntry;
  },

  /**
   * Updates an existing journal entry inside the JSON database.
   * @param {string} userId
   * @param {object} entry
   * @returns {Promise<object>}
   */
  async updateJournal(userId, entry) {
    return await this.saveJournal(userId, entry);
  },

  /**
   * Retrieves a single journal entry for a given calendar date.
   * @param {string} userId
   * @param {string} date (YYYY-MM-DD)
   * @returns {object|null}
   */
  getJournalByDate(userId, date) {
    if (!date) return null;
    const entry = this._journals.find(j => j.date === date);
    return entry || null;
  },

  /**
   * Retrieves all journal entries for a user, sorted by date (newest first).
   * @param {string} userId
   * @returns {Array<object>}
   */
  getAllJournals(userId) {
    return [...this._journals].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
};

window.JournalStorage = JournalStorage;
