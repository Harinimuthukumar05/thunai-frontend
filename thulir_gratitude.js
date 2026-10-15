/* ═══════════════════════════════════════════════════════════
   thulir_gratitude.js
   30-Day Gratitude Challenge for Thulir
   -------------------------------------------------------
   Shows the current challenge day, a short text input,
   and a history of previous entries. Submitting calls
   the Thulir backend — the UI marks the activity as
   complete only after the backend confirms success.

   One entry + one reward per user per local calendar day.
   The challenge progresses day-by-day; missing a day does
   not restart the challenge. All state is server-authoritative.

   Public API (window.ThulirGratitude):
     .open(userId, currentState, onComplete, onExit)
     .close()
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let _overlay = null;
  let _userId  = null;
  let _onComplete = null;
  let _onExit     = null;
  let _submitting = false;

  /* ─── Helpers ─── */
  function _apiBase() {
    return window.getApiBase ? window.getApiBase() : 'http://127.0.0.1:8000';
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _todayISO() {
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  }

  const GRATITUDE_PROMPTS = [
    'What is one small thing that brought you comfort today?',
    'Who is someone you feel grateful to have in your life?',
    'What is a skill or ability you are thankful to have?',
    'Describe a moment today that made you smile.',
    'What is something about your body or health you appreciate?',
    'What is a memory that always brings you warmth?',
    'Is there an experience from the past week you feel grateful for?',
    'What simple pleasure made today a little better?',
    'Think of a challenge you have overcome — what did it teach you?',
    'What do you appreciate about where you live?',
    'Who showed you kindness recently, and in what way?',
    'What piece of music, art, or writing are you grateful to have discovered?',
    'What is something in nature that you find beautiful?',
    'Name something you have today that past-you would have wished for.',
    'What is a comfort or convenience in your life you often take for granted?',
    'Reflect on a lesson you learned this week.',
    'What book, show, or conversation inspired you recently?',
    'Is there a relationship in your life that has grown stronger? How?',
    'What personal value or belief are you grateful you hold?',
    'What small act of your own kindness are you proud of?',
    'What is one thing about today\'s weather or season you appreciated?',
    'Name something you are looking forward to.',
    'What is a food, smell, or texture that brings you joy?',
    'Who is someone who believed in you when you doubted yourself?',
    'What resource — a library, the internet, a park — are you thankful for?',
    'What moment of quiet or stillness are you grateful for today?',
    'Reflect on how far you have come compared to a year ago.',
    'What strength did you draw on today?',
    'Name something unexpected that turned out well.',
    'You have reached Day 30! What is the most meaningful thing gratitude has shown you?',
  ];

  /* ─── DOM builder ─── */
  function _build(challengeDay, alreadyDone, entriesCount) {
    const overlay = document.createElement('div');
    overlay.id = 'thulirGratitudeOverlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:3000;',
      'background:rgba(44,62,53,.55);',
      'display:flex;align-items:center;justify-content:center;',
      'animation:tgFadeIn .25s ease both;',
      'padding:16px;',
    ].join('');

    const promptIndex = Math.min(challengeDay - 1, GRATITUDE_PROMPTS.length - 1);
    const prompt = GRATITUDE_PROMPTS[promptIndex];
    const alreadyDoneHtml = alreadyDone
      ? `<div style="
            background:#EDF4EF;border:1px solid #C6D9C8;border-radius:12px;
            padding:14px 16px;font-size:13px;color:#5A706A;text-align:center;
          ">
           ✅ You already wrote today's gratitude. Come back tomorrow!
         </div>`
      : `<div>
           <label style="font-size:12px;font-weight:600;color:#5A706A;text-transform:uppercase;
                         letter-spacing:.06em;display:block;margin-bottom:8px;">
             Your reflection
           </label>
           <textarea id="tgGratTf"
             style="width:100%;min-height:100px;resize:vertical;
                    border:1.5px solid #E0DDD6;border-radius:12px;
                    padding:12px 14px;font-family:'DM Sans',sans-serif;
                    font-size:14px;color:#2C3E35;background:#F9F7F4;
                    outline:none;transition:border-color .2s;line-height:1.6;
                    box-sizing:border-box;"
             placeholder="A short reflection is all you need…"
             maxlength="500"
             onfocus="this.style.borderColor='#5E9E84'"
             onblur="this.style.borderColor='#E0DDD6'"
           ></textarea>
           <div style="font-size:11px;color:#8FA49E;margin-top:4px;text-align:right;">
             <span id="tgCharCount">0</span> / 500
           </div>
         </div>
         <div id="tgGratError" style="display:none;font-size:12px;color:#c0392b;text-align:center;"></div>
         <button id="tgGratSubmit"
           style="width:100%;background:#5E9E84;color:#fff;border:none;border-radius:12px;
                  padding:13px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;
                  cursor:pointer;transition:background .2s;">
           Save my gratitude 💚
         </button>`;

    overlay.innerHTML = `
      <div style="
        background:#fff;border-radius:20px;padding:32px 26px 26px;
        width:min(500px,94vw);max-height:90vh;overflow-y:auto;
        box-shadow:0 12px 48px rgba(44,62,53,.22);
        font-family:'DM Sans',sans-serif;
        animation:tgSlideUp .3s cubic-bezier(.4,0,.2,1) both;
      ">
        <!-- header -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;">
          <div>
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;
                        letter-spacing:.07em;color:#5E9E84;margin-bottom:4px;">
              🙏 30-Day Gratitude Challenge
            </div>
            <h3 style="font-size:18px;font-weight:600;color:#2C3E35;margin:0;">
              Day ${challengeDay} of 30
            </h3>
          </div>
          <button id="tgGratExit"
            style="background:none;border:none;font-size:20px;cursor:pointer;
                   color:#8FA49E;line-height:1;padding:4px;"
            title="Close" aria-label="Close gratitude panel">✕</button>
        </div>

        <!-- progress bar -->
        <div style="background:#E0DDD6;border-radius:99px;height:6px;margin-bottom:20px;overflow:hidden;">
          <div style="
            height:100%;border-radius:99px;
            background:linear-gradient(90deg,#5E9E84,#A9C7B7);
            width:${Math.min((entriesCount / 30) * 100, 100).toFixed(1)}%;
            transition:width .5s ease;
          "></div>
        </div>

        <!-- prompt -->
        <div style="
          background:linear-gradient(120deg,#EDF4EF,#f8fbf9);
          border-left:3px solid #5E9E84;border-radius:0 12px 12px 0;
          padding:14px 16px;margin-bottom:18px;
        ">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;
                      letter-spacing:.08em;color:#5E9E84;margin-bottom:6px;">
            Today's prompt
          </div>
          <p style="font-size:14px;color:#2C3E35;line-height:1.65;margin:0;font-style:italic;">
            "${_esc(prompt)}"
          </p>
        </div>

        <!-- input or done state -->
        <div id="tgGratBody" style="display:flex;flex-direction:column;gap:12px;">
          ${alreadyDoneHtml}
        </div>

        <!-- completion state -->
        <div id="tgGratSuccess" style="display:none;text-align:center;padding:10px 0;">
          <div style="font-size:36px;margin-bottom:8px;">🌱</div>
          <div style="font-size:15px;font-weight:600;color:#2C3E35;">Gratitude saved!</div>
          <div style="font-size:13px;color:#5A706A;margin-top:4px;line-height:1.5;">
            You earned a water drop. <br>Come back tomorrow for Day ${Math.min(challengeDay + 1, 30)}.
          </div>
          <button id="tgGratDoneBtn"
            style="margin-top:16px;background:#5E9E84;color:#fff;border:none;border-radius:12px;
                   padding:11px 26px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;
                   cursor:pointer;transition:background .2s;">
            Earn my water drop 💧
          </button>
        </div>
      </div>
    `;

    return overlay;
  }

  /* ─── Load entries and open ─── */
  async function open(userId, currentState, onComplete, onExit) {
    if (_overlay) return;

    _userId     = userId || 'User';
    _onComplete = typeof onComplete === 'function' ? onComplete : null;
    _onExit     = typeof onExit     === 'function' ? onExit     : null;
    _submitting = false;

    const challengeDay   = (currentState && currentState.gratitude_challenge_day)  || 1;
    const alreadyDone    = !!(currentState && currentState.today_completions && currentState.today_completions.gratitude);
    const entriesCount   = (currentState && currentState.gratitude_completed_days) || 0;

    _overlay = _build(challengeDay, alreadyDone, entriesCount);
    document.body.appendChild(_overlay);

    /* wire exit */
    document.getElementById('tgGratExit').addEventListener('click', function () {
      _cleanup();
      if (_onExit) _onExit();
    });

    if (!alreadyDone) {
      /* character counter */
      const tf = document.getElementById('tgGratTf');
      if (tf) {
        tf.addEventListener('input', function () {
          const cc = document.getElementById('tgCharCount');
          if (cc) cc.textContent = tf.value.length;
        });
      }

      /* submit */
      const submitBtn = document.getElementById('tgGratSubmit');
      if (submitBtn) {
        submitBtn.addEventListener('click', _submit);
      }
    }

    /* done button (post-submit) */
    document.getElementById('tgGratDoneBtn').addEventListener('click', function () {
      _cleanup();
      if (_onComplete) _onComplete();
    });
  }

  async function _submit() {
    if (_submitting) return;

    const tf = document.getElementById('tgGratTf');
    const errEl = document.getElementById('tgGratError');
    const submitBtn = document.getElementById('tgGratSubmit');

    const text = tf ? tf.value.trim() : '';
    if (!text) {
      if (errEl) { errEl.textContent = 'Please write something — even a sentence is enough.'; errEl.style.display = 'block'; }
      return;
    }
    if (errEl) errEl.style.display = 'none';

    _submitting = true;
    if (submitBtn) { submitBtn.textContent = 'Saving…'; submitBtn.disabled = true; }

    try {
      const res = await fetch(
        `${_apiBase()}/thulir/${encodeURIComponent(_userId)}/complete-activity`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activity_type: 'gratitude',
            date: _todayISO(),
            gratitude_text: text,
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server error ${res.status}`);
      }

      /* show success state */
      const body = document.getElementById('tgGratBody');
      const success = document.getElementById('tgGratSuccess');
      if (body) body.style.display = 'none';
      if (success) success.style.display = 'block';

    } catch (err) {
      console.error('ThulirGratitude: submit failed', err);
      if (errEl) {
        errEl.textContent = 'Could not save your entry. Please check your connection and try again.';
        errEl.style.display = 'block';
      }
      if (submitBtn) { submitBtn.textContent = 'Save my gratitude 💚'; submitBtn.disabled = false; }
    } finally {
      _submitting = false;
    }
  }

  function _cleanup() {
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
  }

  function close() { _cleanup(); }

  window.ThulirGratitude = { open, close };
})();
