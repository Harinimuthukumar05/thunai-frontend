/* ═══════════════════════════════════════════════════════════
   dateUtils.js
   Small date helpers used by the Journal / Diary Timeline
   (FEATURE 4, 5, 6). No hardcoded dates anywhere — everything
   derives from `new Date()` at call time.
   ═══════════════════════════════════════════════════════════ */

/**
 * Returns today's date as a local ISO key: "YYYY-MM-DD".
 * This is the canonical key used to store/retrieve diary entries.
 * @param {Date} [d] optional date to convert (defaults to now)
 * @returns {string}
 */
function duToISO(d) {
  const date = d || new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parses a "YYYY-MM-DD" key back into a local Date (midnight).
 * @param {string} iso
 * @returns {Date}
 */
function duFromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Formats a date as "Sunday, August 2, 2026" — used for the
 * live current-date label on the Journal page (FEATURE 4).
 * @param {Date} [d]
 * @returns {string}
 */
function duFormatLong(d) {
  const date = d || new Date();
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

/**
 * Formats a date as a short "Jul 31" style label, used inside
 * the Diary Timeline list (FEATURE 6).
 * @param {Date} d
 * @returns {string}
 */
function duFormatShort(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Returns the human label for a given ISO date key relative to
 * today: "Today", "Yesterday", or a short "Jul 31" style date.
 * @param {string} iso
 * @returns {string}
 */
function duRelativeLabel(iso) {
  const today = duToISO();
  const yestDate = new Date();
  yestDate.setDate(yestDate.getDate() - 1);
  const yesterday = duToISO(yestDate);

  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return duFormatShort(duFromISO(iso));
}

// Expose as a small namespaced API for other modules to consume.
window.DateUtils = {
  toISO: duToISO,
  fromISO: duFromISO,
  formatLong: duFormatLong,
  formatShort: duFormatShort,
  relativeLabel: duRelativeLabel
};