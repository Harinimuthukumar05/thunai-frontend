/* ═══════════════════════════════════════════════════════════
   journal.js
   Wires the Journal page together: automatic current date
   (FEATURE 4), local JSON/localStorage diary persistence
   (FEATURE 5), and the clickable Diary Timeline / "My Diary"
   panel that replaces AI Reflection + Recent Entries
   (FEATURE 2, 3, 6). Also layers crisis detection onto journal
   writing (FEATURE 12). Depends on dateUtils.js and storage.js
   (and crisisDetection.js for the safety layer) being loaded
   first.
   ═══════════════════════════════════════════════════════════ */

// Tracks which diary date is currently loaded in the editor.
let journalActiveDate = null;

/**
 * Auto-refresh timeline from backend periodically to catch entries
 * saved in other browser tabs or by other users (if shared account).
 */
let journalRefreshInterval = null;
function journalStartAutoRefresh(intervalMs = 60000) {
  if (journalRefreshInterval) clearInterval(journalRefreshInterval);
  journalRefreshInterval = setInterval(() => {
    journalRefreshFromBackend();
  }, intervalMs);
}

/**
 * Sets the live "Sunday, August 2, 2026"-style date label at the
 * top of the journal editor. Re-derives from `new Date()` — never
 * hardcoded.
 */
function journalRenderDateLabel() {
  const lbl = document.getElementById('journalDateLbl');
  if (lbl) lbl.textContent = window.DateUtils.formatLong();
}

function journalFormatISOLabel(isoDate) {
  const today = window.DateUtils.toISO();
  const yest = window.DateUtils.toISO(new Date(Date.now() - 86400 * 1000));
  if (isoDate === today) return 'Today';
  if (isoDate === yest) return 'Yesterday';
  return window.DateUtils.formatShort(window.DateUtils.fromISO(isoDate));
}

function journalBuildDateOption(isoDate) {
  const opt = document.createElement('option');
  opt.value = isoDate;
  opt.textContent = `${journalFormatISOLabel(isoDate)} — ${isoDate}`;
  return opt;
}

function journalRenderDateSelector() {
  const select = document.getElementById('journalDateSelect');
  if (!select) return;
  const today = window.DateUtils.toISO();
  select.innerHTML = '';

  for (let i = 0; i < 30; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = window.DateUtils.toISO(d);
    select.appendChild(journalBuildDateOption(iso));
  }
  select.value = journalActiveDate || today;
}

/**
 * Builds one row of the Diary Timeline list for a given entry.
 * Displays mood emoji, date, preview text, and mood label as a
 * journal-like entry that users can click to view full entry.
 * @param {object} entry {date, title, content, mood, ...}
 * @returns {HTMLElement}
 */
function journalBuildTimelineRow(entry) {
  const row = document.createElement('div');
  row.className = 'diary-t-row';
  row.dataset.date = entry.date;
  if (entry.date === journalActiveDate) row.classList.add('sel');

  const moodIcons = { Happy: '😊', Calm: '😌', Anxious: '😟', Sad: '😔', Tired: '😴', Frustrated: '😡' };
  const icon = moodIcons[entry.mood] || '📝';
  
  // Get preview text from content
  const preview = (entry.content || '').split(/[.!?\n]/)[0].slice(0, 55) || 'No entry text';
  const moodLabel = entry.mood || 'Neutral';
  
  // Get relative date label
  const relativeDate = window.DateUtils ? window.DateUtils.relativeLabel(entry.date) : entry.date;
  
  row.innerHTML = `
    <span class="diary-t-icon">${icon}</span>
    <div class="diary-t-mid">
      <div class="diary-t-date">${relativeDate}</div>
      <div class="diary-t-preview">${preview}${preview.length >= 55 ? '…' : ''}</div>
      <div class="diary-t-mood">${moodLabel}${entry.intensity ? ` · Intensity: ${entry.intensity}/10` : ''}</div>
    </div>
  `;
  
  row.addEventListener('click', () => journalLoadDate(entry.date));
  row.style.cursor = 'pointer';
  
  return row;
}

/**
 * Re-renders the whole Diary Timeline list from storage, grouped
 * under Today / Yesterday / Previous Dates, all inside a
 * "Last 30 Days" heading per FEATURE 6.
 */
function journalRenderTimeline() {
  const list = document.getElementById('diaryTimelineList');
  if (!list) return;
  const entries = window.DiaryStorage.listEntries();

  if (entries.length === 0) {
    list.innerHTML = `<p class="diary-t-empty">No diary entries yet. Write something below and hit Save.</p>`;
    return;
  }

  const today = window.DateUtils.toISO();
  const yestD = new Date(); yestD.setDate(yestD.getDate() - 1);
  const yesterday = window.DateUtils.toISO(yestD);

  const groups = { Today: [], Yesterday: [], Previous: [] };
  entries.forEach(e => {
    if (e.date === today) groups.Today.push(e);
    else if (e.date === yesterday) groups.Yesterday.push(e);
    else groups.Previous.push(e);
  });

  // Sort Previous dates in descending order (newest first)
  groups.Previous.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  list.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'diary-t-heading';
  heading.textContent = 'Last 30 Days';
  list.appendChild(heading);

  ['Today', 'Yesterday', 'Previous'].forEach(key => {
    if (groups[key].length === 0) return;
    groups[key].forEach(entry => {
      const row = journalBuildTimelineRow(entry);
      list.appendChild(row);
    });
  });

  // Auto-scroll to selected entry if one is active
  if (journalActiveDate) {
    const activeRow = list.querySelector(`[data-date="${journalActiveDate}"]`);
    if (activeRow && activeRow.scrollIntoView) {
      activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

/**
 * Loads a given date's entry into the big journal editor + mood
 * log controls, and highlights it in the timeline. Displays it like
 * a real journal page with formatted date, mood indicator, and content.
 * @param {string} isoDate
 */
function journalLoadDate(isoDate) {
  const entry = window.DiaryStorage.loadEntry(isoDate) || {};
  journalActiveDate = isoDate;

  const ta = document.getElementById('journalTf');
  if (ta) ta.value = entry.content || '';

  // Display the date in a journal-page style format
  const lbl = document.getElementById('journalDateLbl');
  if (lbl) {
    const isToday = isoDate === window.DateUtils.toISO();
    const dateObj = window.DateUtils.fromISO(isoDate);
    const longDate = window.DateUtils.formatLong(dateObj);
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    
    // Format as: "Sunday, September 8, 2026"
    lbl.textContent = isToday ? longDate : longDate;
    lbl.title = `Date: ${isoDate}`;
  }

  // Show mood selection and update intensity/note
  document.querySelectorAll('#moodLogGrid .mood-mini').forEach(c => {
    c.classList.toggle('sel', c.dataset.m === entry.mood);
  });
  
  const intSlider = document.getElementById('intSlider');
  if (intSlider && entry.intensity) {
    intSlider.value = entry.intensity;
    if (typeof updateInt === 'function') updateInt(entry.intensity);
  }
  
  const noteTf = document.getElementById('moodNoteTf');
  if (noteTf) noteTf.value = entry.note || '';

  // Highlight in timeline and scroll to view
  journalRenderTimeline();
  journalRenderDateSelector();
  
  // Update visual highlight for the selected entry
  const timelineList = document.getElementById('diaryTimelineList');
  if (timelineList) {
    timelineList.querySelectorAll('.diary-t-row').forEach(row => {
      row.classList.toggle('sel', row.dataset.date === isoDate);
    });
  }
}

/**
 * Reads whichever mood card is currently selected in the mood log.
 * @returns {string} mood name, or '' if none selected
 */
function journalGetSelectedMood() {
  const sel = document.querySelector('#moodLogGrid .mood-mini.sel');
  return sel ? sel.dataset.m : '';
}

/**
 * Saves the current editor + mood-log state as today's diary
 * entry (creating it if it doesn't exist, updating it if it
 * does), then refreshes the timeline. Bound to the journal
 * toolbar's "Save" button.
 */
async function journalRefreshFromBackend() {
  const userId = typeof getActiveUserId === 'function' ? getActiveUserId() : 'User';
  if (window.JournalStorage && typeof window.JournalStorage.getUser === 'function') {
    const data = await window.JournalStorage.getUser(userId);
    if (data && Array.isArray(data.journals)) {
      window.JournalStorage._journals = data.journals;
    }
  }
  journalRenderTimeline();
  journalRenderDateSelector();
}

function saveJournalEntry() {
  const content = (document.getElementById('journalTf') || {}).value || '';
  const intensity = Number((document.getElementById('intSlider') || {}).value || 6);
  const note = (document.getElementById('moodNoteTf') || {}).value || '';
  const mood = journalGetSelectedMood() || 'Neutral';
  const emotion = mood;
  const targetDate = journalActiveDate || (window.DateUtils ? window.DateUtils.toISO() : new Date().toISOString().slice(0, 10));

  const savePayload = { content, mood, emotion, intensity, note, date: targetDate };

  if (window.DiaryStorage && typeof window.DiaryStorage.saveEntry === 'function') {
    window.DiaryStorage.saveEntry(targetDate, savePayload);
  } else if (window.getApiBase && window.JournalStorage && typeof window.JournalStorage.saveJournal === 'function') {
    const userId = typeof getActiveUserId === 'function' ? getActiveUserId() : 'User';
    window.JournalStorage.saveJournal(userId, savePayload);
  } else if (window.getApiBase) {
    const userId = typeof getActiveUserId === 'function' ? getActiveUserId() : 'User';
    const base = window.getApiBase();
    fetch(`${base}/journals/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savePayload)
    }).catch(err => console.error('journal direct save failed', err));
  }

  const saveBtn = document.getElementById('journalSaveBtn');
  if (saveBtn) {
    const oldText = saveBtn.innerHTML;
    saveBtn.innerHTML = '✓ Saved';
    clearTimeout(window._journalSaveBtnTimer);
    window._journalSaveBtnTimer = setTimeout(() => { saveBtn.innerHTML = oldText; }, 1800);
  }

  setTimeout(() => {
    journalRefreshFromBackend();
  }, 300);

  if (window.CrisisDetection && window.CrisisDetection.detect(content)) {
    window.CrisisDetection.showBanner();
  }

  const msg = document.getElementById('moodSavedMsg');
  if (msg) {
    msg.textContent = '✓ Journal saved for today';
    msg.style.display = 'block';
    clearTimeout(window._journalSaveMsgT);
    window._journalSaveMsgT = setTimeout(() => { msg.style.display = 'none'; }, 2600);
  }
}

/**
 * Clears the editor to start a fresh entry for today, without
 * deleting today's already-saved entry until Save is pressed
 * again. Bound to the "New Entry" toolbar button.
 */
function newJournalEntry() {
  const ta = document.getElementById('journalTf');
  if (ta) ta.value = '';
  journalActiveDate = window.DateUtils.toISO();
  journalRenderDateLabel();
  journalRenderDateSelector();
  if (typeof clearMood === 'function') clearMood();
}

/**
 * Simple local search across diary entries (title/content/mood),
 * filters the visible Diary Timeline rows. Bound to the "Search"
 * toolbar button. Pure client-side, no AI/API involved.
 */
function searchJournalEntries() {
  const q = window.prompt('Search your diary entries:');
  if (q === null) return;
  const query = q.trim().toLowerCase();
  const list = document.getElementById('diaryTimelineList');
  if (!list) return;
  if (!query) { journalRenderTimeline(); return; }

  const entries = window.DiaryStorage.listEntries().filter(e =>
    (e.content || '').toLowerCase().includes(query) ||
    (e.mood || '').toLowerCase().includes(query)
  );
  list.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'diary-t-heading';
  heading.textContent = `Results for "${q}"`;
  list.appendChild(heading);
  if (entries.length === 0) {
    list.innerHTML += `<p class="diary-t-empty">No matching entries found.</p>`;
    return;
  }
  entries.forEach(entry => list.appendChild(journalBuildTimelineRow(entry)));
}

/**
 * Debounced crisis check while the user is actively writing in
 * the journal (not just on save) — crisis detection must never
 * wait for an explicit action (FEATURE 12).
 */
let journalCrisisDebounce = null;
function journalOnInputCheck(text) {
  clearTimeout(journalCrisisDebounce);
  journalCrisisDebounce = setTimeout(() => {
    if (window.CrisisDetection && window.CrisisDetection.detect(text)) {
      window.CrisisDetection.showBanner();
    }
  }, 500);
}

/**
 * One-time setup: run on DOMContentLoaded. Renders the date,
 * loads today's entry (if any) into the editor, renders the
 * timeline, wires up the toolbar buttons and mood-emoji
 * animations, and attaches the journal-input crisis listener.
 */
async function initJournal() {
  journalActiveDate = window.DateUtils.toISO();

  if (window.JournalStorage && typeof getActiveUserId === 'function') {
    const activeUser = getActiveUserId();
    if (activeUser) {
      try {
        const userData = await window.JournalStorage.getUser(activeUser);
        if (userData && Array.isArray(userData.journals)) {
          window.JournalStorage._journals = userData.journals;
        }
      } catch (e) {
        console.warn('initJournal: failed to load journal user data', e);
      }
    }
  }

  journalRenderDateLabel();
  
  // First render the timeline with all loaded entries
  journalRenderTimeline();
  journalRenderDateSelector();

  const existingToday = window.DiaryStorage.loadEntry(journalActiveDate);
  if (existingToday) journalLoadDate(journalActiveDate);

  const newBtn = document.getElementById('journalNewBtn');
  const searchBtn = document.getElementById('journalSearchBtn');
  const saveBtn = document.getElementById('journalSaveBtn');
  if (newBtn) newBtn.addEventListener('click', newJournalEntry);
  if (searchBtn) searchBtn.addEventListener('click', searchJournalEntries);
  if (saveBtn) saveBtn.addEventListener('click', saveJournalEntry);

  const select = document.getElementById('journalDateSelect');
  if (select) {
    select.addEventListener('change', () => {
      if (select.value) journalLoadDate(select.value);
    });
  }

  const ta = document.getElementById('journalTf');
  if (ta) ta.addEventListener('input', () => journalOnInputCheck(ta.value));

  // Start auto-refresh to sync timeline with backend (every 60 seconds)
  journalStartAutoRefresh(60000);

  if (window.EmojiAnimation) window.EmojiAnimation.apply();

  // keep the current-date label correct even if the app is left open overnight
  setInterval(journalRenderDateLabel, 60 * 1000);
}

document.addEventListener('DOMContentLoaded', initJournal);