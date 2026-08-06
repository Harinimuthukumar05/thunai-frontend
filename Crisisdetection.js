/* ═══════════════════════════════════════════════════════════
   crisisDetection.js
   Highest-priority safety layer. Runs BEFORE the Offline
   Knowledge Base for every message (chat) and on journal
   writing/saving, online or offline. Pure pattern matching —
   no AI, no network — so it can never fail because a backend
   is unreachable. Modular and easy to extend (e.g. with
   region-specific helplines) later.

   REFACTOR NOTE: the public API (`detect`, `getChatResponse`,
   `showBanner`, `hideBanner`, `goToCareContacts`) is unchanged
   from before, so chatOffline.js / journal.js keep working.
   Two additions were layered on top without touching the rest:
     • classify(text)      -> 'crisis' | 'violence' | null
     • highlightCareContacts() -> glowing pulse on Care Contacts
   ═══════════════════════════════════════════════════════════ */

/**
 * Normalizes free-typed text so pattern matching survives missing
 * apostrophes, common contractions, and informal spelling — e.g.
 * "dont wanna live" and "don't want to live" both normalize to
 * "do not want to live".
 * @param {string} text
 * @returns {string}
 */
function crisisNormalize(text) {
  let t = (text || '').toLowerCase();
  t = t.replace(/'/g, '');           // delete apostrophes: "I'm"->"im", "don't"->"dont"
  t = t.replace(/[^a-z\s]/g, ' ');   // remaining punctuation/numbers become spaces
  t = t.replace(/\s+/g, ' ').trim();

  const expansions = {
    dont: 'do not', cant: 'can not', wont: 'will not',
    isnt: 'is not', wasnt: 'was not', werent: 'were not',
    doesnt: 'does not', didnt: 'did not', arent: 'are not',
    shouldnt: 'should not', couldnt: 'could not', wouldnt: 'would not',
    im: 'i am', ive: 'i have', ill: 'i will', id: 'i would',
    gonna: 'going to', wanna: 'want to', gotta: 'have to', cannot: 'can not'
  };
  t = t.split(' ').map(w => expansions[w] || w).join(' ');
  return ` ${t} `; // pad so word-boundary-free substring checks stay safe
}

/**
 * Tiny Levenshtein distance (edit distance) — used only for
 * short, high-stakes words so simple typos ("suicde", "suicdal")
 * still get caught without a fuzzy-matching library.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function crisisEditDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Checks the normalized text for near-misspellings of a small set
 * of high-stakes words (suicide/suicidal/dying) within edit
 * distance 1 — catches things like "suicde" without over-matching
 * unrelated short words.
 * @param {string} normText
 * @returns {boolean}
 */
function crisisFuzzyHighRiskWord(normText) {
  const targets = ['suicide', 'suicidal'];
  const words = normText.trim().split(' ').filter(w => w.length >= 5);
  return words.some(w => targets.some(t => crisisEditDistance(w, t) <= 1));
}

/* ── Self-harm / suicide risk patterns (checked against the
   normalized+expanded text from crisisNormalize) ── */
const CRISIS_PATTERNS = [
  /\bi want to die\b/, /\bi am going to die\b/, /\bi going to die\b/, /\bi will die\b/, /\bdie\b/,
  /\bwish i (was|were) dead\b/, /\bbetter off dead\b/,
  /\bi do not want to live\b/, /\bi do not want to be here\b/, /\bi do not want to exist\b/,
  /\bi do not want to live anymore\b/,
  /\blife is not worth living\b/, /\bno point in living\b/, /\bno reason to live\b/,
  /\bi do not see any reason to live\b/,
  /\beveryone.*better.*without me\b/, /\bnobody needs me\b/, /\bnobody loves me\b/,
  /\bi can not do this anymore\b/, /\bi can not go on\b/, /\bi give up\b/,
  /\bi am done\b/, /\bi am finished\b/,
  /\bi want to disappear\b/, /\bdisappear forever\b/,
  /\bi do not deserve to live\b/, /\bgoodbye everyone\b/, /\bthis is my last day\b/,
  /\bthis is goodbye\b/, /\bi am ending everything\b/,
  /\bi want to end my life\b/, /\bend my life\b/, /\bending my life\b/, /\bend it all\b/,
  /\bi want to kill myself\b/, /\bkill myself\b/, /\bkilling myself\b/, /\bkill my self\b/,
  /\bsuicide\b/, /\bsuicidal\b/,
  /\bself[\s-]?harm\b/, /\bcut myself\b/, /\bhurt myself\b/, /\bharm myself\b/,
  /\bfeel like dying\b/, /\bi am dying\b/, /\bthinking about suicide\b/,
  /\bplanning to (end|kill)\b/
];

/* ── Violence / harm-to-others patterns ── */
const VIOLENCE_PATTERNS = [
  /\bwant to kill (someone|somebody|him|her|them)\b/,
  /\bwant to hurt (someone|somebody|him|her|them)\b/,
  /\bwant to attack (someone|somebody|him|her|them)\b/,
  /\bwant to beat (someone|somebody|him|her|them)\b/,
  /\bfeel like (killing|hurting|attacking|beating) (someone|somebody)\b/,
  /\bi want revenge\b/
];

/**
 * Classifies a message as a suicide/self-harm crisis, a
 * violence-toward-others risk, or neither. This is the single
 * source of truth both `detect()` and the chat wiring use.
 * @param {string} text
 * @returns {'crisis'|'violence'|null}
 */
function classifyCrisis(text) {
  if (!text) return null;
  const norm = crisisNormalize(text);
  if (CRISIS_PATTERNS.some(re => re.test(norm)) || crisisFuzzyHighRiskWord(norm)) return 'crisis';
  if (VIOLENCE_PATTERNS.some(re => re.test(norm))) return 'violence';
  return null;
}

/**
 * Boolean convenience wrapper (unchanged signature) — true for
 * either a suicide/self-harm crisis or a violence risk, since
 * both must bypass the Knowledge Base and open Self Care.
 * @param {string} text
 * @returns {boolean}
 */
function detectCrisis(text) {
  return classifyCrisis(text) !== null;
}

/**
 * Builds the calm, supportive response shown in chat.
 * @param {'crisis'|'violence'} [type='crisis']
 * @returns {string}
 */
function getCrisisChatResponse(type) {
  if (type === 'violence') {
    return "I hear that you're carrying a lot of anger or a really intense urge right now — thank you for putting it into words instead of acting on it. Let's slow down together. You don't have to handle this feeling alone; the Get Help Now option below connects you with people who can support you right now.";
  }
  return "I'm really glad you told me. What you're feeling matters, and you don't have to carry it alone. 💚 Please consider reaching out to someone you trust right now, or use the Get Help Now option below to reach a crisis helpline — they're free, confidential, and available right now. I'm still here with you.";
}

/**
 * Shows (or updates) the persistent "Get Help Now" banner.
 * Works on any page — the banner is a single shared element
 * appended to <body> so it stays visible regardless of which
 * page/tab is active, on both desktop and mobile.
 */
function showCrisisBanner() {
  let banner = document.getElementById('crisisBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'crisisBanner';
    banner.className = 'crisis-banner';
    banner.innerHTML = `
      <div class="crisis-banner-txt">
        <strong>You're not alone.</strong> If you're in crisis, immediate support is available right now.
      </div>
      <button class="crisis-help-btn" id="crisisHelpBtn">🆘 Get Help Now</button>
      <button class="crisis-dismiss-btn" id="crisisDismissBtn" aria-label="Dismiss">✕</button>
    `;
    document.body.appendChild(banner);
    document.getElementById('crisisHelpBtn').addEventListener('click', goToCareContacts);
    document.getElementById('crisisDismissBtn').addEventListener('click', hideCrisisBanner);
  }
  banner.classList.add('show');
}

/** Hides the crisis banner (user dismissed it, or risk has passed for this session). */
function hideCrisisBanner() {
  const banner = document.getElementById('crisisBanner');
  if (banner) banner.classList.remove('show');
}

/**
 * Temporarily highlights the existing Care Contacts / Emergency
 * Contact panel with a glowing pulse so the user's eye lands on
 * it immediately after navigation. Purely additive — adds/removes
 * one CSS class, never touches the panel's markup or content.
 */
function highlightCareContacts() {
  const panel = document.querySelector('#careLauncherView .care-panel-wide');
  if (!panel) return;
  panel.classList.add('crisis-highlight');
  clearTimeout(window._crisisHighlightT);
  window._crisisHighlightT = setTimeout(() => {
    panel.classList.remove('crisis-highlight');
  }, 4000);
}

/**
 * Navigates the user straight to the existing Self Care page,
 * scrolls its (unmodified) Care Contacts / Emergency Contact panel
 * into view, and gives it a temporary highlight. Reuses the app's
 * existing `goto`/`closeCare` nav — this page is now driven ONLY
 * by crisis detection, never by Knowledge Base breathing/meditation
 * suggestions.
 */
function goToCareContacts() {
  if (typeof closeCare === 'function') closeCare();
  if (typeof goto === 'function') goto('selfcare');
  setTimeout(() => {
    const panel = document.querySelector('#careLauncherView .care-panel-wide');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightCareContacts();
  }, 80);
}

// Expose as a small namespaced API for other modules (chat/journal wiring) to consume.
window.CrisisDetection = {
  detect: detectCrisis,
  classify: classifyCrisis,
  getChatResponse: getCrisisChatResponse,
  showBanner: showCrisisBanner,
  hideBanner: hideCrisisBanner,
  highlightCareContacts,
  goToCareContacts
};