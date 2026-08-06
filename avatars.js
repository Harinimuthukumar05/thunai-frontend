/* ═══════════════════════════════════════════════════════════
   avatars.js
   FEATURE 13 — ThunAI branding & chat avatars.

   Centralizes every avatar/logo asset path in ONE place so the
   images can be swapped later (e.g. once the backend serves a
   user-uploaded profile picture) without touching markup around
   the app. Nothing here changes chat layout, bubble design,
   theme, colors, or spacing — it only swaps the emoji placeholder
   that used to sit inside `.mavatar` / `.logo-mark` / `.avatar-btn`
   for the real image.

   Depends on settings.js being loaded first (to read a saved
   profile picture, if any) — but degrades gracefully if it isn't
   loaded yet, always falling back to the default asset.
   ═══════════════════════════════════════════════════════════ */

/* ── Centralized asset paths (swap these, not the markup, when
   branding changes) ── */
const THUNAI_ASSISTANT_AVATAR_SRC = "./assets/thunai-logo.jpeg";
const THUNAI_DEFAULT_USER_AVATAR_SRC = "./assets/default-user-avatar.jpeg";
/**
 * Resolves the avatar image that should represent the *user*
 * right now: their uploaded profile picture if Settings > Profile
 * has one saved, otherwise the shipped default user avatar.
 * @returns {string} an <img> src (data URL or asset path)
 */
function avGetUserAvatarSrc() {
  try {
    if (window.ThunSettings && typeof window.ThunSettings.loadUserSettings === 'function') {
      const s = window.ThunSettings.loadUserSettings();
      if (s && s.profilePicture) return s.profilePicture;
    }
  } catch (e) {
    console.warn('avatars: could not read saved profile picture, using default', e);
  }
  return THUNAI_DEFAULT_USER_AVATAR_SRC;
}

/** ThunAI's avatar never changes — always the Wings logo. */
function avGetAssistantAvatarSrc() {
  return THUNAI_ASSISTANT_AVATAR_SRC;
}

/**
 * Markup for one chat-message avatar, reusing the existing
 * `.mavatar` box (same size/spacing/shadow) with an <img> inside
 * instead of an emoji.
 * @param {'ai'|'user'} role
 * @returns {string}
 */
function avAvatarHTML(role) {
  const src = role === 'user' ? avGetUserAvatarSrc() : avGetAssistantAvatarSrc();
  const alt = role === 'user' ? 'You' : 'ThunAI';
  return `<div class="mavatar"><img class="mavatar-img" src="${src}" alt="${alt}"></div>`;
}

/**
 * Re-applies the correct avatar image to every existing chat
 * bubble already on screen (the two hardcoded intro AI messages,
 * plus anything sent since). Safe to call repeatedly/idempotent.
 */
function avRefreshChatAvatars() {
  document.querySelectorAll('#chatMsgs .mrow.ai .mavatar, #typingRow .mavatar').forEach(el => {
    el.innerHTML = `<img class="mavatar-img" src="${avGetAssistantAvatarSrc()}" alt="ThunAI">`;
  });
  document.querySelectorAll('#chatMsgs .mrow.user .mavatar').forEach(el => {
    el.innerHTML = `<img class="mavatar-img" src="${avGetUserAvatarSrc()}" alt="You">`;
  });
}

/**
 * Updates the top-right profile chip (avatar + username), per
 * FEATURE 9 — called on load and again immediately after the
 * user saves their profile in Settings, no refresh required.
 */
function avRefreshTopbarProfile() {
  const btn = document.getElementById('topAvatarBtn');
  if (btn) btn.innerHTML = `<img class="topbar-avatar-img" src="${avGetUserAvatarSrc()}" alt="You">`;

  const nameEl = document.getElementById('topUsername');
  if (nameEl) {
    let uname = 'User';
    try {
      if (window.ThunSettings) {
        const s = window.ThunSettings.loadUserSettings();
        uname = (s && (s.displayName || s.username)) || 'User';
      }
    } catch (e) { /* keep default */ }
    nameEl.textContent = uname;
  }
}

/** Swaps the top-left sidebar logo mark for the Wings logo image. */
function avApplySidebarLogo() {
  const mark = document.querySelector('.logo-mark');
  if (mark && !mark.querySelector('img')) {
    mark.innerHTML = `<img class="logo-mark-img" src="${THUNAI_ASSISTANT_AVATAR_SRC}" alt="ThunAI">`;
  }
}

/**
 * One call to apply all branding across the app — sidebar logo,
 * topbar avatar/username, and any chat bubbles already rendered.
 * Called on load, and again whenever the profile picture changes.
 */
function avApplyBranding() {
  avApplySidebarLogo();
  avRefreshTopbarProfile();
  avRefreshChatAvatars();
}

// Expose as a small namespaced API — chatOffline.js / journal.js /
// settings.js and the inline UI.html script all read from this
// instead of hardcoding image paths anywhere else.
window.ThunAvatars = {
  assistantAvatarSrc: avGetAssistantAvatarSrc,
  userAvatarSrc: avGetUserAvatarSrc,
  avatarHTML: avAvatarHTML,
  refreshChatAvatars: avRefreshChatAvatars,
  refreshTopbarProfile: avRefreshTopbarProfile,
  applyBranding: avApplyBranding
};

document.addEventListener('DOMContentLoaded', avApplyBranding);