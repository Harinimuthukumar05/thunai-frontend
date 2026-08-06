/* ═══════════════════════════════════════════════════════════
   settings.js
   Wires the Settings page (Profile + Voice cards) into a real,
   persistent local preferences manager (FEATURE 1–11). Nothing
   here touches the page's markup structure beyond the ids that
   were added for wiring, and no other page/theme/nav/animation
   is modified.

   FEATURE 8 / 11 — BACKEND-READY ARCHITECTURE:
   Every read/write goes through the small helper API at the
   bottom of this file (loadUserSettings / saveUserSettings /
   updateProfile / loadVoiceSettings / saveVoiceSettings). Today
   they read/write LocalStorage; later they can be swapped for
   `await fetch('/api/settings', ...)` calls without changing a
   single line of the UI wiring above them, because the UI only
   ever calls these functions — it never touches localStorage
   directly.
   ═══════════════════════════════════════════════════════════ */

const SETTINGS_STORAGE_KEY = 'thunai_user_settings';

function normalizeVoiceUserId(value) {
  const base = String(value || 'default_user').trim();
  const cleaned = base.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'default_user';
}

function getCurrentVoiceUserId() {
  const settings = loadUserSettings();
  const persisted = normalizeVoiceUserId(settings.voiceUserId || settings.username || 'default_user');
  if (!settings.voiceUserId || settings.voiceUserId !== persisted) {
    saveUserSettings({ voiceUserId: persisted });
  }
  return persisted;
}

/**
 * Shape of a settings object and its defaults. `playbackSpeed`
 * and `theme` are included now (FEATURE 7 / 10) even though the
 * current UI has no speed slider or theme switch yet, so the
 * backend contract is already stable — a UI control can be added
 * later without a migration.
 */
const DEFAULT_SETTINGS = {
  username: 'User',
  voiceUserId: 'user',
  displayName: '',
  email: '',
  language: 'English',
  profilePicture: null,      // data URL string, or null = use default avatar

  voiceEnabled: true,
  voiceMode: 'default',      // 'default' | 'cloned'
  defaultVoice: 'female',    // 'female' | 'male'
  volume: 0.8,               // 0..1
  playbackSpeed: 1.0,        // reserved for FEATURE 7 (no UI slider yet)
  clonedVoice: null,         // {filename, uploadedAt, dataUrl} | null

  theme: 'light'             // reserved for FEATURE 10 (no theme switch yet)
};

/* ── LOCAL STORAGE HELPERS (today's implementation of the
   backend-ready API — the ONLY place that touches localStorage) ── */

function stLoadRaw() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('settings: could not read local storage, using defaults', e);
    return {};
  }
}

function stSaveRaw(data) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('settings: could not write local storage', e);
    return false;
  }
}

/* ── PUBLIC BACKEND-READY API ── */

/**
 * Loads the full settings object, merged over defaults so missing
 * keys (e.g. after adding a new setting) never break callers.
 * FUTURE: `return await fetch('/api/settings').then(r => r.json())`
 * @returns {object}
 */
function loadUserSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, stLoadRaw());
}

/**
 * Merges `patch` into the saved settings and persists the result.
 * FUTURE: `return await fetch('/api/settings', {method:'PATCH', body: JSON.stringify(patch)}).then(r => r.json())`
 * @param {object} patch partial settings to merge in
 * @returns {object} the full, updated settings object
 */
function saveUserSettings(patch) {
  const updated = Object.assign({}, loadUserSettings(), patch);
  stSaveRaw(updated);
  return updated;
}

/**
 * Profile-specific save entry point (FEATURE 1). Persists the
 * profile fields, then refreshes every place the username/avatar
 * is shown (topbar, chat) immediately — no page refresh needed.
 * FUTURE: this is the natural place to POST to `/api/profile`.
 * @param {{username?:string, displayName?:string, email?:string, language?:string, profilePicture?:(string|null)}} profileFields
 * @returns {object} the full, updated settings object
 */
function updateProfile(profileFields) {
  const updated = saveUserSettings(profileFields);
  if (window.ThunAvatars) window.ThunAvatars.applyBranding();
  return updated;
}

/**
 * Voice-specific slice of settings (FEATURE 8 convenience
 * accessor) — used by chatOffline.js / a future TTS layer so it
 * doesn't need to know about profile fields at all.
 * @returns {{voiceEnabled:boolean, voiceMode:string, defaultVoice:string, volume:number, playbackSpeed:number, clonedVoice:(object|null)}}
 */
function loadVoiceSettings() {
  const s = loadUserSettings();
  return {
    voiceEnabled: s.voiceEnabled,
    voiceMode: s.voiceMode,
    defaultVoice: s.defaultVoice,
    volume: s.volume,
    playbackSpeed: s.playbackSpeed,
    clonedVoice: s.clonedVoice
  };
}

/**
 * Voice-specific save entry point (FEATURE 2–7).
 * FUTURE: POST to `/api/voice-settings`.
 * @param {object} voiceFields
 * @returns {object} the full, updated settings object
 */
function saveVoiceSettings(voiceFields) {
  return saveUserSettings(voiceFields);
}

/* ═══════════════════════════════════════════════════════════
   UI WIRING — everything below reads/writes ONLY through the
   helper API above.
   ═══════════════════════════════════════════════════════════ */

/* ── FEATURE 1: PROFILE ── */

// Holds a newly-picked (not-yet-saved) profile picture as a data
// URL so the on-page preview can update instantly while the actual
// save (and the app-wide avatar swap) still only happens on Save,
// per the spec ("When the user saves the profile... replace the
// avatar everywhere").
let pendingProfilePicture = undefined; // undefined = no new pick since last save

function settingsRenderProfileForm(settings) {
  const usernameEl = document.getElementById('settingsUsername');
  const displayNameEl = document.getElementById('settingsDisplayName');
  const emailEl = document.getElementById('settingsEmail');
  const languageEl = document.getElementById('settingsLanguage');
  const avatarImg = document.getElementById('profileAvatarImg');

  if (usernameEl) usernameEl.value = settings.username || '';
  if (displayNameEl) displayNameEl.value = settings.displayName || '';
  if (emailEl) emailEl.value = settings.email || '';
  if (languageEl && settings.language) languageEl.value = settings.language;
  if (avatarImg) avatarImg.src = settings.profilePicture || (window.ThunAvatars ? window.ThunAvatars.userAvatarSrc() : '');
}

function settingsHandleProfilePicPick(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingProfilePicture = reader.result; // data URL, previewed immediately below
    const avatarImg = document.getElementById('profileAvatarImg');
    if (avatarImg) avatarImg.src = pendingProfilePicture;
  };
  reader.onerror = () => console.warn('settings: could not read the selected image');
  reader.readAsDataURL(file);
}

function settingsSaveProfile() {
  const usernameEl = document.getElementById('settingsUsername');
  const displayNameEl = document.getElementById('settingsDisplayName');
  const emailEl = document.getElementById('settingsEmail');
  const languageEl = document.getElementById('settingsLanguage');

  const profileFields = {
    username: (usernameEl && usernameEl.value.trim()) || 'User',
    displayName: (displayNameEl && displayNameEl.value.trim()) || '',
    email: (emailEl && emailEl.value.trim()) || '',
    language: (languageEl && languageEl.value) || 'English'
  };
  // Only touch profilePicture if the user actually picked a new one
  // this session, so re-saving other fields never clears it.
  if (pendingProfilePicture !== undefined) {
    profileFields.profilePicture = pendingProfilePicture;
  }

  updateProfile(profileFields);
  pendingProfilePicture = undefined;

  // Sync user profile with persistent local JSON database (journal_database.json)
  if (window.JournalStorage) {
    window.JournalStorage.createUser(profileFields.username, profileFields.displayName).then(() => {
      if (typeof journalRenderTimeline === 'function') {
        journalRenderTimeline();
      }
      if (typeof journalLoadDate === 'function' && window.DateUtils) {
        journalLoadDate(window.DateUtils.toISO());
      }
    }).catch(e => console.warn('settingsSaveProfile: JournalStorage error', e));
  }

  const msg = document.getElementById('profileSavedMsg');
  if (msg) {
    msg.style.display = 'inline';
    clearTimeout(window._profileSavedMsgT);
    window._profileSavedMsgT = setTimeout(() => { msg.style.display = 'none'; }, 2600);
  }
}

function settingsInitProfileSection() {
  const settings = loadUserSettings();
  settingsRenderProfileForm(settings);

  // Automatically initialize/load user profile in JSON database on startup
  if (window.JournalStorage && settings.username) {
    window.JournalStorage.createUser(settings.username, settings.displayName || settings.username).then(() => {
      if (typeof journalRenderTimeline === 'function') {
        journalRenderTimeline();
      }
    }).catch(() => {});
  }

  const picInput = document.getElementById('profilePicUpload');
  if (picInput) picInput.addEventListener('change', settingsHandleProfilePicPick);

  const saveBtn = document.getElementById('saveProfileBtn');
  if (saveBtn) saveBtn.addEventListener('click', settingsSaveProfile);
}

/* ── FEATURE 2 / 3: DEFAULT VOICES + PREVIEW ── */

/* ── FEATURE 2 / 3: DEFAULT VOICES + PREVIEW ── */

const DEFAULT_VOICE_FILES = {
    female: "./assets/voices/female_default.mp3",
    male: "./assets/voices/male_default.mp3"
};

// Single shared <audio> element so starting a new preview always
// stops whatever was already playing (FEATURE 3: "only one preview
// should play at a time").
let previewAudioEl = null;
function stGetPreviewAudioEl() {
  if (!previewAudioEl) previewAudioEl = new Audio();
  return previewAudioEl;
}

function settingsStopPreview() {
  const audio = stGetPreviewAudioEl();
  audio.pause();
  audio.currentTime = 0;
  document.querySelectorAll('.prev-btn[data-voice]').forEach(btn => {
    btn.textContent = '▶ Preview';
    btn.disabled = false;
  });
}

/**
 * Plays a default voice sample locally (no AI, no network),
 * using the currently-saved volume + playback speed, and shows a
 * brief loading state while the file buffers.
 * @param {'female'|'male'} voiceKey
 */
function settingsPreviewVoice(voiceKey) {
  const settings = loadVoiceSettings();
  if (!settings.voiceEnabled) return; // voice is off — previews stay disabled

  const btn = document.getElementById(voiceKey === 'female' ? 'previewFemaleBtn' : 'previewMaleBtn');
  settingsStopPreview(); // stop any other preview first

  const audio = stGetPreviewAudioEl();
  audio.src = DEFAULT_VOICE_FILES[voiceKey];
  audio.volume = settings.volume;
  audio.playbackRate = settings.playbackSpeed || 1.0;

  if (btn) { btn.textContent = '⏳ Loading…'; btn.disabled = true; }

  audio.oncanplay = () => { if (btn) { btn.textContent = '⏸ Playing…'; } };
  audio.onended = () => { if (btn) { btn.textContent = '▶ Preview'; btn.disabled = false; } };
  audio.onerror = () => {
    console.warn('settings: could not play voice preview for', voiceKey);
    if (btn) { btn.textContent = '▶ Preview'; btn.disabled = false; }
  };

  audio.play().catch(err => {
    console.warn('settings: preview playback was blocked', err);
    if (btn) { btn.textContent = '▶ Preview'; btn.disabled = false; }
  });
}

/* ── FEATURE 4: VOICE MODE (default vs cloned) ── */

function settingsSelectVoiceMode(mode) {
  saveVoiceSettings({ voiceMode: mode });
  settingsRenderVoiceModeSections(loadVoiceSettings());
}

function settingsRenderVoiceModeSections(voiceSettings) {
  const defaultSection = document.getElementById('defaultVoiceSection');
  const clonedSection = document.getElementById('clonedVoiceSection');
  if (defaultSection) defaultSection.style.display = voiceSettings.voiceMode === 'cloned' ? 'none' : '';
  if (clonedSection) clonedSection.style.display = voiceSettings.voiceMode === 'cloned' ? '' : 'none';

  const emptyState = document.getElementById('clonedVoiceEmpty');
  const infoState = document.getElementById('clonedVoiceInfo');
  const hasClone = !!(voiceSettings.clonedVoice && voiceSettings.clonedVoice.filename);
  if (emptyState) emptyState.style.display = hasClone ? 'none' : '';
  if (infoState) infoState.style.display = hasClone ? '' : 'none';
  if (hasClone) {
    const nameEl = document.getElementById('clonedVoiceFilename');
    const dateEl = document.getElementById('clonedVoiceDate');
    if (nameEl) nameEl.textContent = voiceSettings.clonedVoice.filename;
    if (dateEl) dateEl.textContent = new Date(voiceSettings.clonedVoice.uploadedAt).toLocaleString();
  }
}

async function settingsUploadClonedVoice(file) {
  const userId = getCurrentVoiceUserId();
  if (!file) {
    throw new Error('No voice file selected.');
  }

  saveVoiceSettings({ voiceUserId: userId });

  const apiBase = window.getApiBase();
  const uploadResult = await fetch(`${apiBase}/upload-voice`, {
    method: 'POST',
    body: (() => {
      const formData = new FormData();
      formData.append('user_id', userId);
      formData.append('voice_file', file, file.name || 'voice_sample');
      return formData;
    })()
  });

  const payload = await uploadResult.json().catch(() => ({}));
  if (!uploadResult.ok) {
    const detail = payload && payload.detail ? payload.detail : `HTTP ${uploadResult.status}`;
    throw new Error(detail);
  }

  return { userId, payload };
}

async function settingsHandleClonedVoiceUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const uploadInput = document.getElementById('voiceUpload');
  const statusEl = document.getElementById('clonedVoiceStatus');
  const reader = new FileReader();

  reader.onload = async () => {
    try {
      if (statusEl) {
        statusEl.textContent = 'Uploading to ThunAI…';
      }

      const { userId, payload } = await settingsUploadClonedVoice(file);

      saveVoiceSettings({
        clonedVoice: {
          filename: file.name,
          uploadedAt: new Date().toISOString(),
          backendUserId: userId,
          dataUrl: reader.result,
          savedFile: payload && payload.saved_file ? payload.saved_file : null
        }
      });

      if (statusEl) {
        statusEl.textContent = 'Voice uploaded successfully.';
      }
      settingsRenderVoiceModeSections(loadVoiceSettings());
    } catch (err) {
      console.warn('settings: could not upload the cloned voice sample to the backend', err);
      if (statusEl) {
        statusEl.textContent = err && err.message ? err.message : 'Upload failed. Please try a different file.';
      }
      if (uploadInput) uploadInput.value = '';
    }
  };

  reader.onerror = () => {
    console.warn('settings: could not read the uploaded voice sample');
    if (statusEl) statusEl.textContent = 'Could not read the selected file.';
    if (uploadInput) uploadInput.value = '';
  };

  reader.readAsDataURL(file);
}

function settingsDeleteClonedVoice() {
  saveVoiceSettings({ clonedVoice: null });
  const input = document.getElementById('voiceUpload');
  if (input) input.value = '';
  settingsRenderVoiceModeSections(loadVoiceSettings());
}

/* ── FEATURE 5: VOICE ENABLE / DISABLE ── */

function settingsApplyVoiceEnabledState(enabled) {
  ['voiceModeRow', 'defaultVoiceSection', 'clonedVoiceSection', 'volumeRow'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('settings-disabled', !enabled);
  });
  document.querySelectorAll(
    '#defaultVoiceSection input, #defaultVoiceSection button, ' +
    '#clonedVoiceSection input, #clonedVoiceSection button, #clonedVoiceSection label, ' +
    '#volumeRow input'
  ).forEach(el => { el.disabled = !enabled; });

  if (!enabled) settingsStopPreview();
}

function settingsToggleVoiceEnabled(e) {
  const enabled = e.target.checked;
  saveVoiceSettings({ voiceEnabled: enabled });
  settingsApplyVoiceEnabledState(enabled);
}

/* ── FEATURE 6: VOLUME ── */

function settingsUpdateVolumeSliderVisual(slider, value) {
  const pct = Math.round(value * 100);
  slider.style.background = `linear-gradient(90deg,var(--primary) ${pct}%,var(--border) ${pct}%)`;
}

function settingsHandleVolumeInput(e) {
  const value = parseFloat(e.target.value);
  settingsUpdateVolumeSliderVisual(e.target, value);
  saveVoiceSettings({ volume: value });
  // Live-adjust whatever preview is currently playing, if any.
  if (previewAudioEl) previewAudioEl.volume = value;
}

/* ── FULL VOICE SECTION INIT ── */

function settingsInitVoiceSection() {
  const voiceSettings = loadVoiceSettings();

  // Enable/disable master toggle
  const enableToggle = document.getElementById('voiceEnabledToggle');
  if (enableToggle) {
    enableToggle.checked = voiceSettings.voiceEnabled;
    enableToggle.addEventListener('change', settingsToggleVoiceEnabled);
  }

  // Default voice radios (FEATURE 2)
  const femaleRadio = document.getElementById('voiceFemaleRadio');
  const maleRadio = document.getElementById('voiceMaleRadio');
  if (femaleRadio && maleRadio) {
    femaleRadio.checked = voiceSettings.defaultVoice === 'female';
    maleRadio.checked = voiceSettings.defaultVoice === 'male';
    [femaleRadio, maleRadio].forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) saveVoiceSettings({ defaultVoice: radio.value });
      });
    });
  }

  // Preview buttons (FEATURE 3)
  const previewFemaleBtn = document.getElementById('previewFemaleBtn');
  const previewMaleBtn = document.getElementById('previewMaleBtn');
  if (previewFemaleBtn) previewFemaleBtn.addEventListener('click', () => settingsPreviewVoice('female'));
  if (previewMaleBtn) previewMaleBtn.addEventListener('click', () => settingsPreviewVoice('male'));

  // Voice mode radios (FEATURE 4)
  const modeDefaultRadio = document.getElementById('voiceModeDefault');
  const modeClonedRadio = document.getElementById('voiceModeCloned');
  if (modeDefaultRadio && modeClonedRadio) {
    modeDefaultRadio.checked = voiceSettings.voiceMode === 'default';
    modeClonedRadio.checked = voiceSettings.voiceMode === 'cloned';
    modeDefaultRadio.addEventListener('change', () => { if (modeDefaultRadio.checked) settingsSelectVoiceMode('default'); });
    modeClonedRadio.addEventListener('change', () => { if (modeClonedRadio.checked) settingsSelectVoiceMode('cloned'); });
  }
  settingsRenderVoiceModeSections(voiceSettings);

  // Cloned voice upload / replace / delete (FEATURE 4)
  const uploadInput = document.getElementById('voiceUpload');
  if (uploadInput) uploadInput.addEventListener('change', settingsHandleClonedVoiceUpload);
  const deleteBtn = document.getElementById('deleteVoiceBtn');
  if (deleteBtn) deleteBtn.addEventListener('click', settingsDeleteClonedVoice);

  // Volume (FEATURE 6)
  const volumeSlider = document.getElementById('volumeSlider');
  if (volumeSlider) {
    volumeSlider.value = voiceSettings.volume;
    settingsUpdateVolumeSliderVisual(volumeSlider, voiceSettings.volume);
    volumeSlider.addEventListener('input', settingsHandleVolumeInput);
  }

  // Apply the enabled/disabled visual + input state last, once
  // every control above exists.
  settingsApplyVoiceEnabledState(voiceSettings.voiceEnabled);
}

/* ── ONE-TIME SETUP ── */

function initSettingsPage() {
  settingsInitProfileSection();
  settingsInitVoiceSection();
}

document.addEventListener('DOMContentLoaded', initSettingsPage);

// Expose as a small namespaced API — FEATURE 8/11: this is the
// seam a future FastAPI backend integration plugs into.
window.ThunSettings = {
  loadUserSettings,
  saveUserSettings,
  updateProfile,
  loadVoiceSettings,
  saveVoiceSettings
};