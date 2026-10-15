/* ═══════════════════════════════════════════════════════════
   thulir.js
   Thulir — Grow Your Inner Plant
   Main orchestrator module for the ThunAI sidebar plant widget
   and daily self-care activity panel.
   -------------------------------------------------------
   Responsibilities:
   • Render the sidebar plant widget (replacing the 🧘‍♀️ illustration).
   • Load and cache plant state from the backend on init.
   • Open the activity panel when the widget is clicked.
   • Coordinate the three activity sub-modules:
       ThulirGrounding, ThulirGratitude, ThulirShimmer.
   • Handle watering: spend one water drop, animate plant growth.
   • Persist state from backend only; localStorage is a UI cache.

   Called from index.html after all scripts are loaded:
     window.addEventListener('load', () => Thulir.init());

   Public API (window.Thulir):
     .init()         — load state and render sidebar widget
     .openPanel()    — open activity panel
     .closePanel()   — close activity panel
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Module state ─── */
  let _state    = null;   // latest server state
  let _userId   = 'User';
  let _panel    = null;   // current modal panel element
  let _watering = false;  // prevent double-click on water button

  /* ─── Utilities ─── */
  function _apiBase() {
    return window.getApiBase ? window.getApiBase() : 'http://127.0.0.1:8000';
  }

  function _getUsername() {
    try {
      const raw = localStorage.getItem('thunai_user_settings');
      const s   = raw ? JSON.parse(raw) : {};
      return (s.username || 'User').trim() || 'User';
    } catch (e) { return 'User'; }
  }

  function _todayISO() {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ─── Plant SVG stages ─── */
  /*
   * Each stage is an inline SVG showing a terracotta pot with a subtle
   * friendly face, a soil patch, and an increasing number of leaves.
   * The SVG viewBox is 100×130. It scales to the available sidebar width
   * via CSS width:100%.
   *
   * Terracotta pot colour: #C76C3A / #D8814F
   * Leaf greens: #5E9E84, #4A8A6F, #7FBD9E
   * Stem: #6B8E63
   */
  const STAGE_SVGS = {
    1: `
<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" aria-label="Thulir plant — 2 leaves">
  <!-- stem -->
  <line x1="50" y1="60" x2="50" y2="42" stroke="#6B8E63" stroke-width="2.5" stroke-linecap="round"/>
  <!-- left leaf -->
  <ellipse cx="35" cy="41" rx="16" ry="9" fill="#5E9E84"
    transform="rotate(-35 35 41)" opacity=".92"/>
  <!-- right leaf -->
  <ellipse cx="65" cy="41" rx="16" ry="9" fill="#4A8A6F"
    transform="rotate(35 65 41)" opacity=".92"/>
  <!-- pot body -->
  <path d="M22 62 Q18 92 17 98 L83 98 Q82 92 78 62 Z" fill="#C76C3A"/>
  <!-- pot rim -->
  <rect x="19" y="58" width="62" height="9" rx="4" fill="#D8814F"/>
  <!-- soil -->
  <ellipse cx="50" cy="62" rx="24" ry="5" fill="#7B5738"/>
  <!-- face: eyes -->
  <circle cx="40" cy="79" r="2.5" fill="#8B3A1A"/>
  <circle cx="60" cy="79" r="2.5" fill="#8B3A1A"/>
  <!-- face: smile -->
  <path d="M41 86 Q50 92 59 86" stroke="#8B3A1A" stroke-width="1.8"
    fill="none" stroke-linecap="round"/>
  <!-- face: blush dots -->
  <circle cx="35" cy="83" r="4" fill="#e09070" opacity=".35"/>
  <circle cx="65" cy="83" r="4" fill="#e09070" opacity=".35"/>
</svg>`,

    2: `
<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" aria-label="Thulir plant — 4 leaves">
  <!-- stems -->
  <line x1="50" y1="60" x2="50" y2="36" stroke="#6B8E63" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="50" y1="50" x2="38" y2="40" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="50" x2="62" y2="40" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <!-- lower left leaf -->
  <ellipse cx="31" cy="47" rx="15" ry="8" fill="#5E9E84"
    transform="rotate(-40 31 47)" opacity=".9"/>
  <!-- lower right leaf -->
  <ellipse cx="69" cy="47" rx="15" ry="8" fill="#4A8A6F"
    transform="rotate(40 69 47)" opacity=".9"/>
  <!-- upper left leaf -->
  <ellipse cx="33" cy="32" rx="13" ry="7" fill="#7FBD9E"
    transform="rotate(-25 33 32)" opacity=".9"/>
  <!-- upper right leaf -->
  <ellipse cx="67" cy="32" rx="13" ry="7" fill="#5E9E84"
    transform="rotate(25 67 32)" opacity=".9"/>
  <!-- pot body -->
  <path d="M22 62 Q18 92 17 98 L83 98 Q82 92 78 62 Z" fill="#C76C3A"/>
  <rect x="19" y="58" width="62" height="9" rx="4" fill="#D8814F"/>
  <ellipse cx="50" cy="62" rx="24" ry="5" fill="#7B5738"/>
  <!-- face -->
  <circle cx="40" cy="79" r="2.5" fill="#8B3A1A"/>
  <circle cx="60" cy="79" r="2.5" fill="#8B3A1A"/>
  <path d="M40 86 Q50 93 60 86" stroke="#8B3A1A" stroke-width="1.8"
    fill="none" stroke-linecap="round"/>
  <circle cx="35" cy="83" r="4" fill="#e09070" opacity=".35"/>
  <circle cx="65" cy="83" r="4" fill="#e09070" opacity=".35"/>
</svg>`,

    3: `
<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" aria-label="Thulir plant — 6 leaves">
  <!-- stems -->
  <line x1="50" y1="60" x2="50" y2="30" stroke="#6B8E63" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="50" y1="52" x2="35" y2="42" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="52" x2="65" y2="42" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="42" x2="36" y2="30" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="42" x2="64" y2="30" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <!-- bottom pair -->
  <ellipse cx="28" cy="49" rx="15" ry="8" fill="#4A8A6F"
    transform="rotate(-45 28 49)" opacity=".9"/>
  <ellipse cx="72" cy="49" rx="15" ry="8" fill="#5E9E84"
    transform="rotate(45 72 49)" opacity=".9"/>
  <!-- middle pair -->
  <ellipse cx="30" cy="34" rx="14" ry="7.5" fill="#7FBD9E"
    transform="rotate(-30 30 34)" opacity=".9"/>
  <ellipse cx="70" cy="34" rx="14" ry="7.5" fill="#5E9E84"
    transform="rotate(30 70 34)" opacity=".9"/>
  <!-- top pair -->
  <ellipse cx="36" cy="22" rx="12" ry="6.5" fill="#5E9E84"
    transform="rotate(-15 36 22)" opacity=".88"/>
  <ellipse cx="64" cy="22" rx="12" ry="6.5" fill="#4A8A6F"
    transform="rotate(15 64 22)" opacity=".88"/>
  <!-- pot -->
  <path d="M22 62 Q18 92 17 98 L83 98 Q82 92 78 62 Z" fill="#C76C3A"/>
  <rect x="19" y="58" width="62" height="9" rx="4" fill="#D8814F"/>
  <ellipse cx="50" cy="62" rx="24" ry="5" fill="#7B5738"/>
  <!-- face -->
  <circle cx="40" cy="79" r="2.5" fill="#8B3A1A"/>
  <circle cx="60" cy="79" r="2.5" fill="#8B3A1A"/>
  <path d="M40 87 Q50 94 60 87" stroke="#8B3A1A" stroke-width="1.8"
    fill="none" stroke-linecap="round"/>
  <circle cx="35" cy="83" r="4" fill="#e09070" opacity=".35"/>
  <circle cx="65" cy="83" r="4" fill="#e09070" opacity=".35"/>
</svg>`,

    4: `
<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" aria-label="Thulir plant — flourishing">
  <!-- many stems -->
  <line x1="50" y1="60" x2="50" y2="26" stroke="#6B8E63" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="50" y1="54" x2="33" y2="44" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="54" x2="67" y2="44" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="44" x2="34" y2="33" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="44" x2="66" y2="33" stroke="#6B8E63" stroke-width="2" stroke-linecap="round"/>
  <line x1="50" y1="36" x2="36" y2="24" stroke="#6B8E63" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="50" y1="36" x2="64" y2="24" stroke="#6B8E63" stroke-width="1.8" stroke-linecap="round"/>
  <!-- bottom layer -->
  <ellipse cx="26" cy="51" rx="16" ry="8.5" fill="#4A8A6F"
    transform="rotate(-48 26 51)" opacity=".9"/>
  <ellipse cx="74" cy="51" rx="16" ry="8.5" fill="#5E9E84"
    transform="rotate(48 74 51)" opacity=".9"/>
  <!-- second layer -->
  <ellipse cx="27" cy="37" rx="14" ry="7.5" fill="#7FBD9E"
    transform="rotate(-35 27 37)" opacity=".92"/>
  <ellipse cx="73" cy="37" rx="14" ry="7.5" fill="#5E9E84"
    transform="rotate(35 73 37)" opacity=".92"/>
  <!-- third layer -->
  <ellipse cx="33" cy="24" rx="13" ry="7" fill="#5E9E84"
    transform="rotate(-20 33 24)" opacity=".9"/>
  <ellipse cx="67" cy="24" rx="13" ry="7" fill="#4A8A6F"
    transform="rotate(20 67 24)" opacity=".9"/>
  <!-- top crown -->
  <ellipse cx="50" cy="16" rx="11" ry="6.5" fill="#7FBD9E" opacity=".92"/>
  <!-- pot -->
  <path d="M22 62 Q18 92 17 98 L83 98 Q82 92 78 62 Z" fill="#C76C3A"/>
  <rect x="19" y="58" width="62" height="9" rx="4" fill="#D8814F"/>
  <ellipse cx="50" cy="62" rx="24" ry="5" fill="#7B5738"/>
  <!-- face — happier! -->
  <circle cx="40" cy="78" r="3" fill="#8B3A1A"/>
  <circle cx="60" cy="78" r="3" fill="#8B3A1A"/>
  <path d="M38 87 Q50 96 62 87" stroke="#8B3A1A" stroke-width="2"
    fill="none" stroke-linecap="round"/>
  <circle cx="33" cy="83" r="5" fill="#e09070" opacity=".4"/>
  <circle cx="67" cy="83" r="5" fill="#e09070" opacity=".4"/>
  <!-- sparkles -->
  <text x="10" y="20" font-size="10" opacity=".7">✨</text>
  <text x="75" y="18" font-size="9"  opacity=".6">✨</text>
</svg>`,
  };

  /* Missed-day SVG: stage 1 but droopy */
  const MISSED_SVG = `
<svg viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" aria-label="Thulir plant — resting">
  <line x1="50" y1="60" x2="50" y2="44" stroke="#6B8E63" stroke-width="2.5" stroke-linecap="round"/>
  <!-- droopy left leaf -->
  <ellipse cx="33" cy="48" rx="16" ry="8" fill="#5E9E84"
    transform="rotate(-55 33 48)" opacity=".55"/>
  <!-- droopy right leaf -->
  <ellipse cx="67" cy="48" rx="16" ry="8" fill="#4A8A6F"
    transform="rotate(55 67 48)" opacity=".55"/>
  <!-- pot -->
  <path d="M22 62 Q18 92 17 98 L83 98 Q82 92 78 62 Z" fill="#C76C3A" opacity=".75"/>
  <rect x="19" y="58" width="62" height="9" rx="4" fill="#D8814F" opacity=".75"/>
  <ellipse cx="50" cy="62" rx="24" ry="5" fill="#7B5738" opacity=".75"/>
  <!-- sleepy face -->
  <path d="M37 77 Q40 74 43 77" stroke="#8B3A1A" stroke-width="1.8"
    fill="none" stroke-linecap="round"/>
  <path d="M57 77 Q60 74 63 77" stroke="#8B3A1A" stroke-width="1.8"
    fill="none" stroke-linecap="round"/>
  <path d="M41 86 Q50 89 59 86" stroke="#8B3A1A" stroke-width="1.5"
    fill="none" stroke-linecap="round"/>
  <text x="42" y="57" font-size="10" text-anchor="middle" opacity=".4">💤</text>
</svg>`;

  /* ─── API calls ─── */
  async function _fetchState() {
    const res = await fetch(
      `${_apiBase()}/thulir/${encodeURIComponent(_userId)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (!res.ok) throw new Error(`GET /thulir failed: ${res.status}`);
    return res.json();
  }

  async function _completeActivity(activityType) {
    const res = await fetch(
      `${_apiBase()}/thulir/${encodeURIComponent(_userId)}/complete-activity`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_type: activityType, date: _todayISO() }),
      }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Error ${res.status}`);
    }
    return res.json();
  }

  async function _waterPlant() {
    const res = await fetch(
      `${_apiBase()}/thulir/${encodeURIComponent(_userId)}/water-plant`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Error ${res.status}`);
    }
    return res.json();
  }

  /* ─── Sidebar widget rendering ─── */
  function _plantSVG(state) {
    if (!state) return STAGE_SVGS[1];
    if (state.missed_day && state.streak_days === 0) return MISSED_SVG;
    const stage = Math.max(1, Math.min(4, state.growth_stage || 1));
    return STAGE_SVGS[stage] || STAGE_SVGS[1];
  }

  function _ageLabel(state) {
    if (!state) return 'Day 1 of growing';
    const days = state.plant_age_days || 1;
    if (days === 1) return 'Day 1 of growing';
    return `${days} days growing`;
  }

  function _streakLabel(state) {
    if (!state) return '';
    const s = state.streak_days || 0;
    if (s === 0) return '';
    return s === 1 ? '🔥 1-day streak' : `🔥 ${s}-day streak`;
  }

  function _waterLabel(state) {
    if (!state) return '';
    const bal = state.water_balance || 0;
    if (bal <= 0) return '';
    return `💧 ${bal} drop${bal !== 1 ? 's' : ''} ready`;
  }

  function _renderSidebarWidget() {
    const container = document.getElementById('thulirSidebarWidget');
    if (!container) return;

    const svg      = _plantSVG(_state);
    const ageLabel = _ageLabel(_state);
    const streak   = _streakLabel(_state);
    const water    = _waterLabel(_state);
    const missedDay = _state && _state.missed_day;

    container.innerHTML = `
      <div id="thulirWidgetBtn"
        role="button" tabindex="0" aria-label="Open Thulir plant and activities"
        style="cursor:pointer;padding:0;background:none;border:none;width:100%;
               outline:none;">
        <div style="
          background:linear-gradient(160deg,#e8f0eb 0%,#ddeae2 100%);
          padding:16px 16px 12px;position:relative;overflow:hidden;
          border-radius:var(--r) var(--r) 0 0;
          display:flex;flex-direction:column;align-items:center;gap:4px;
          min-height:160px;justify-content:flex-end;
        ">
          <!-- decorative leaf hints -->
          <div style="position:absolute;bottom:0;left:4px;font-size:22px;opacity:.2;pointer-events:none;">🌿</div>
          <div style="position:absolute;bottom:0;right:4px;font-size:20px;opacity:.2;pointer-events:none;">🍃</div>

          <!-- plant SVG -->
          <div id="thulirPlantSvg" style="
            width:80px;flex-shrink:0;
            filter:drop-shadow(0 4px 10px rgba(44,62,53,.12));
            transition:transform .3s ease;
            ${missedDay ? 'opacity:.7;' : ''}
          ">
            ${svg}
          </div>

          <!-- water indicator -->
          ${water ? `<div style="
            position:absolute;top:8px;right:8px;
            background:#5E9E84;color:#fff;border-radius:99px;
            padding:3px 9px;font-size:10px;font-weight:700;
            box-shadow:0 2px 8px rgba(94,158,132,.4);
            animation:thulirPulse 2s ease-in-out infinite;
          ">${_esc(water)}</div>` : ''}
        </div>

        <div style="background:var(--card);padding:12px 14px 14px;border-radius:0 0 var(--r) var(--r);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
            <span style="font-size:13px;font-weight:700;color:var(--text);">Thulir</span>
            ${streak ? `<span style="font-size:10px;font-weight:600;color:#5E9E84;">${_esc(streak)}</span>` : ''}
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">${_esc(ageLabel)}</div>
          ${missedDay
            ? `<div style="font-size:11px;color:#8FA49E;font-style:italic;line-height:1.4;">
                Thulir had a quiet day. Whenever you're ready 🌱
               </div>`
            : `<div style="font-size:11px;color:var(--primary);font-weight:500;">
                Grow your inner plant today →
               </div>`
          }
        </div>
      </div>
    `;

    /* open panel on click / Enter / Space */
    const btn = document.getElementById('thulirWidgetBtn');
    if (btn) {
      btn.addEventListener('click', openPanel);
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(); }
      });
      btn.addEventListener('mouseenter', function () {
        const svgWrap = document.getElementById('thulirPlantSvg');
        if (svgWrap) svgWrap.style.transform = 'scale(1.06)';
      });
      btn.addEventListener('mouseleave', function () {
        const svgWrap = document.getElementById('thulirPlantSvg');
        if (svgWrap) svgWrap.style.transform = 'scale(1)';
      });
    }
  }

  /* ─── Activity panel ─── */
  function _activityCardHTML(id, icon, title, description, actionLabel, done, earnedToday, totalEarned, maxDaily) {
    const doneClass = done ? 'thulir-activity-done' : '';
    return `
    <div class="thulir-act-card ${doneClass}" id="thulirAct_${id}">
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="font-size:26px;flex-shrink:0;line-height:1.2;">${icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px;">
            ${_esc(title)}
            ${done ? '<span style="color:#5E9E84;font-size:11px;margin-left:6px;">✓ Done</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:10px;">
            ${_esc(description)}
          </div>
          ${done
            ? `<div style="font-size:11px;color:#5E9E84;font-weight:600;">💧 Water drop earned today</div>`
            : `<button class="thulir-act-btn" data-activity="${id}"
                 style="background:var(--primary);color:#fff;border:none;border-radius:10px;
                        padding:9px 16px;font-family:'DM Sans',sans-serif;font-size:12.5px;
                        font-weight:600;cursor:pointer;transition:all .2s;">
                 ${_esc(actionLabel)}
               </button>`
          }
        </div>
      </div>
    </div>`;
  }

  function _buildPanel(state) {
    const tc = state ? state.today_completions : {};
    const earned = state ? (state.earned_today || 0) : 0;
    const balance = state ? (state.water_balance || 0) : 0;
    const stage = state ? (state.growth_stage || 1) : 1;
    const atMax = stage >= 4;

    const allDone = tc.grounding && tc.gratitude && tc.shimmer;
    const gratDay = state ? (state.gratitude_challenge_day || 1) : 1;

    const overlay = document.createElement('div');
    overlay.id = 'thulirPanelOverlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:2000;',
      'background:rgba(44,62,53,.5);',
      'display:flex;align-items:center;justify-content:center;',
      'padding:16px;',
      'animation:thulirFadeIn .25s ease both;',
    ].join('');

    overlay.innerHTML = `
      <div id="thulirPanel" style="
        background:var(--bg);border-radius:20px;
        width:min(560px,96vw);max-height:90vh;overflow-y:auto;
        box-shadow:0 16px 60px rgba(44,62,53,.25);
        font-family:'DM Sans',sans-serif;
        animation:thulirSlideUp .3s cubic-bezier(.4,0,.2,1) both;
      ">
        <!-- panel header -->
        <div style="
          background:linear-gradient(135deg,#3d7a60 0%,#5E9E84 100%);
          border-radius:20px 20px 0 0;padding:22px 24px 18px;
          display:flex;align-items:flex-start;justify-content:space-between;
        ">
          <div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;
                        letter-spacing:.07em;color:rgba(255,255,255,.75);margin-bottom:4px;">
              🌱 Thulir
            </div>
            <h2 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 4px;">
              Grow your inner plant today
            </h2>
            <p style="font-size:12.5px;color:rgba(255,255,255,.8);margin:0;line-height:1.5;">
              A few gentle moments for yourself can help you grow.
            </p>
          </div>
          <button id="thulirPanelClose"
            style="background:rgba(255,255,255,.15);border:none;border-radius:99px;
                   width:34px;height:34px;cursor:pointer;font-size:18px;color:#fff;
                   display:flex;align-items:center;justify-content:center;
                   transition:background .2s;flex-shrink:0;margin-top:2px;"
            aria-label="Close panel">✕</button>
        </div>

        <div style="padding:20px 22px 26px;">

          <!-- water balance -->
          <div style="
            background:#fff;border-radius:14px;padding:14px 18px;
            border:1px solid var(--border);margin-bottom:18px;
            display:flex;align-items:center;justify-content:space-between;
            flex-wrap:wrap;gap:10px;
          ">
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.06em;color:var(--text-muted);margin-bottom:3px;">
                Water earned today
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                ${[0,1,2].map(i => `
                  <span style="font-size:20px;transition:opacity .3s;
                               opacity:${i < earned ? 1 : 0.2};">💧</span>
                `).join('')}
                <span style="font-size:12px;color:var(--text-muted);margin-left:4px;">
                  ${earned}/3 drops
                </span>
              </div>
            </div>
            <div id="thulirWaterSection">
              ${_waterSectionHTML(balance, atMax)}
            </div>
          </div>

          <!-- activities -->
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                      letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px;">
            Today's activities
          </div>

          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px;">
            ${_activityCardHTML('grounding','🌬️','Guided Grounding Exercise',
              'Take a few moments to reconnect with the present.',
              'Start grounding', !!tc.grounding, earned, 3)}
            ${_activityCardHTML('gratitude','🙏','30-Day Gratitude Challenge',
              `Pause and reflect on something you appreciate today. (Day ${gratDay} of 30)`,
              'Write today\'s gratitude', !!tc.gratitude, earned, 3)}
            ${_activityCardHTML('shimmer','✨','Cut the Shimmer Ball',
              'Take a playful break and watch the light sparkle.',
              'Play now', !!tc.shimmer, earned, 3)}
          </div>

          <!-- all-done message -->
          ${allDone ? `
          <div style="
            background:linear-gradient(120deg,#EDF4EF,#f8fbf9);
            border:1px solid #C6D9C8;border-radius:14px;
            padding:16px 18px;text-align:center;
          ">
            <div style="font-size:22px;margin-bottom:6px;">🎉</div>
            <div style="font-size:14px;font-weight:600;color:var(--text);">
              All done for today!
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.5;">
              You've completed all three activities. Come back tomorrow for more ways to grow.
            </div>
          </div>` : ''}

        </div>
      </div>
    `;

    return overlay;
  }

  function _waterSectionHTML(balance, atMax) {
    if (atMax) {
      return `<div style="font-size:12px;color:#5E9E84;font-weight:600;text-align:right;">
                🌿 Thulir is flourishing!
              </div>`;
    }
    if (balance < 1) {
      return `<div style="font-size:12px;color:var(--text-muted);text-align:right;">
                Complete activities to earn water 💧
              </div>`;
    }
    return `
      <button id="thulirWaterBtn"
        style="background:linear-gradient(135deg,#5E9E84,#4a7a64);color:#fff;
               border:none;border-radius:12px;padding:10px 16px;
               font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;
               cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:7px;
               box-shadow:0 3px 12px rgba(94,158,132,.35);"
        aria-label="Water Thulir plant (costs 1 water drop)">
        💧 Water Thulir
        <span style="font-size:11px;opacity:.8;">(${balance} left)</span>
      </button>`;
  }

  function _wirePanel() {
    /* close button */
    const closeBtn = document.getElementById('thulirPanelClose');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    /* close on overlay click (not panel click) */
    const overlay = document.getElementById('thulirPanelOverlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closePanel();
      });
    }

    /* activity buttons */
    document.querySelectorAll('.thulir-act-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.dataset.activity;
        _launchActivity(id);
      });
    });

    /* water button */
    _wireWaterBtn();
  }

  function _wireWaterBtn() {
    const waterBtn = document.getElementById('thulirWaterBtn');
    if (!waterBtn) return;

    waterBtn.addEventListener('click', async function () {
      if (_watering) return;
      _watering = true;
      waterBtn.textContent = '💧 Watering…';
      waterBtn.disabled = true;

      try {
        const newState = await _waterPlant();
        _state = newState;

        /* animate the sidebar plant */
        _renderSidebarWidget();
        _animateWater(newState.grew);

        /* update the panel in place */
        _refreshPanelWaterSection(newState);

        if (newState.grew) {
          _showToast(newState.message || 'A little care goes a long way. 🌱');
        } else {
          _showToast(newState.message || 'Thulir loved the water! 💧');
        }
      } catch (err) {
        console.error('Thulir: water-plant failed', err);
        _showToast('Could not water Thulir — check your connection.', true);
        waterBtn.textContent = '💧 Water Thulir';
        waterBtn.disabled = false;
      } finally {
        _watering = false;
      }
    });
  }

  function _animateWater(grew) {
    const svgWrap = document.getElementById('thulirPlantSvg');
    if (!svgWrap) return;
    /* quick scale bounce */
    svgWrap.style.transition = 'transform .15s ease';
    svgWrap.style.transform  = 'scale(1.15)';
    setTimeout(() => {
      svgWrap.style.transform = 'scale(1)';
    }, 300);
    if (grew) {
      /* extra glow pulse */
      svgWrap.style.filter = 'drop-shadow(0 0 12px rgba(94,158,132,.7))';
      setTimeout(() => {
        svgWrap.style.filter = 'drop-shadow(0 4px 10px rgba(44,62,53,.12))';
      }, 900);
    }
  }

  function _refreshPanelWaterSection(newState) {
    const section = document.getElementById('thulirWaterSection');
    if (section) {
      section.innerHTML = _waterSectionHTML(
        newState.water_balance,
        (newState.growth_stage || 1) >= 4
      );
      _wireWaterBtn();
    }
    /* update drop indicators */
    const earned = newState.earned_today || 0;
    document.querySelectorAll('#thulirPanel span[style*="font-size:20px"]').forEach(
      (el, i) => { el.style.opacity = i < earned ? '1' : '0.2'; }
    );
  }

  /* ─── Activity launchers ─── */
  function _launchActivity(id) {
    if (id === 'grounding') {
      if (!window.ThulirGrounding) return;
      ThulirGrounding.open(
        async function onComplete() {
          /* activity complete — record on backend */
          await _recordCompletion('grounding');
        },
        function onExit() { /* user chose to exit — no reward */ }
      );

    } else if (id === 'gratitude') {
      if (!window.ThulirGratitude) return;
      ThulirGratitude.open(
        _userId,
        _state,
        async function onComplete() {
          /* gratitude module submitted to backend itself; refresh state */
          await _reloadAndRefreshPanel();
        },
        function onExit() {}
      );

    } else if (id === 'shimmer') {
      if (!window.ThulirShimmer) return;
      ThulirShimmer.open(
        async function onComplete() {
          await _recordCompletion('shimmer');
        },
        function onExit() {}
      );
    }
  }

  async function _recordCompletion(activityType) {
    try {
      const newState = await _completeActivity(activityType);
      _state = newState;
      _renderSidebarWidget();
      _rebuildPanelActivities(newState);
      if (newState.reward_issued) {
        _showToast('💧 Water drop earned!');
      }
    } catch (err) {
      console.error(`Thulir: failed to record ${activityType}`, err);
      _showToast('Could not save your progress — please try again.', true);
    }
  }

  async function _reloadAndRefreshPanel() {
    try {
      _state = await _fetchState();
      _renderSidebarWidget();
      _rebuildPanelActivities(_state);
    } catch (err) {
      console.error('Thulir: reload failed', err);
    }
  }

  function _rebuildPanelActivities(state) {
    /* Rebuild just the activities + water section without closing panel */
    const existing = document.getElementById('thulirPanelOverlay');
    if (!existing) return;

    /* Remove old panel and rebuild (simplest safe approach) */
    closePanel();
    setTimeout(() => openPanel(), 60);
  }

  /* ─── Toast ─── */
  function _showToast(msg, isError) {
    let toast = document.getElementById('thulirToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'thulirToast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.cssText = [
      'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);',
      `background:${isError ? '#c0392b' : '#2C3E35'};color:#fff;`,
      'border-radius:12px;padding:12px 20px;font-size:13px;font-weight:600;',
      'z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,.2);',
      'font-family:"DM Sans",sans-serif;',
      'animation:thulirSlideUp .3s ease both;',
      'max-width:min(360px,90vw);text-align:center;',
    ].join('');
    clearTimeout(window._thulirToastT);
    window._thulirToastT = setTimeout(() => {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3500);
  }

  /* ─── Public: openPanel / closePanel ─── */
  function openPanel() {
    if (document.getElementById('thulirPanelOverlay')) return; /* already open */
    if (!_state) {
      /* state not loaded yet — show a brief loading panel */
      const tmp = document.createElement('div');
      tmp.id = 'thulirPanelOverlay';
      tmp.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(44,62,53,.5);display:flex;align-items:center;justify-content:center;';
      tmp.innerHTML = '<div style="background:#fff;border-radius:16px;padding:32px;font-family:\'DM Sans\',sans-serif;color:#5A706A;">Loading Thulir… 🌱</div>';
      document.body.appendChild(tmp);
      tmp.addEventListener('click', function (e) { if (e.target === tmp) closePanel(); });
      _fetchState().then(s => {
        _state = s;
        closePanel();
        setTimeout(() => openPanel(), 30);
      });
      return;
    }

    _panel = _buildPanel(_state);
    document.body.appendChild(_panel);
    _wirePanel();
  }

  function closePanel() {
    const overlay = document.getElementById('thulirPanelOverlay');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    _panel = null;
  }

  /* ─── Init ─── */
  async function init() {
    _userId = _getUsername();

    /* Listen for username changes (user saves settings) */
    window.addEventListener('thunai:usernameChanged', function () {
      const newId = _getUsername();
      if (newId !== _userId) {
        _userId = newId;
        _state  = null;
        _init();
      }
    });

    await _init();
  }

  async function _init() {
    try {
      _state = await _fetchState();
    } catch (e) {
      console.warn('Thulir: could not load state from backend (offline?)', e);
      _state = null;
    }
    _renderSidebarWidget();
  }

  /* ─── Global CSS (injected once) ─── */
  (function _injectCSS() {
    if (document.getElementById('thulirCSS')) return;
    const s = document.createElement('style');
    s.id = 'thulirCSS';
    s.textContent = `
      @keyframes thulirFadeIn  { from{opacity:0} to{opacity:1} }
      @keyframes thulirSlideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
      @keyframes thulirPulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }

      /* Activity cards */
      .thulir-act-card {
        background:#fff;border-radius:14px;padding:16px;
        border:1px solid var(--border);transition:box-shadow .2s,border-color .2s;
      }
      .thulir-act-card:hover { box-shadow:var(--shadow-md); }
      .thulir-act-card.thulir-activity-done {
        background:linear-gradient(120deg,#EDF4EF,#f8fbf9);
        border-color:#C6D9C8;
      }
      .thulir-act-btn:hover {
        background:#4a7a64 !important;
        transform:translateY(-1px);
        box-shadow:0 3px 10px rgba(94,158,132,.3);
      }
      #thulirWaterBtn:hover {
        background:linear-gradient(135deg,#4a7a64,#3d6652) !important;
        transform:translateY(-1px);
        box-shadow:0 5px 18px rgba(94,158,132,.45) !important;
      }
      #thulirPanelClose:hover { background:rgba(255,255,255,.25) !important; }

      /* Keyframes for tgFadeIn/tgSlideUp (shared with grounding/shimmer/gratitude) */
      @keyframes tgFadeIn  { from{opacity:0} to{opacity:1} }
      @keyframes tgSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
    `;
    document.head.appendChild(s);
  })();

  /* ─── Export ─── */
  window.Thulir = { init, openPanel, closePanel };
})();
