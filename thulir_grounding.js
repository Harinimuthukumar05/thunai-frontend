/* ═══════════════════════════════════════════════════════════
   thulir_grounding.js
   Guided Grounding Exercise for Thulir
   -------------------------------------------------------
   An isolated, self-contained grounding breathing exercise.
   Runs a 4-4-6 pattern (inhale 4 s, hold 4 s, exhale 6 s).
   Completion is triggered after exactly 3 full cycles.
   The user may exit at any time with no penalty.

   This module is completely independent of the existing
   breathing exercise in index.html — it uses its own state
   variables and DOM elements (created and destroyed at runtime).

   Public API (window.ThulirGrounding):
     .open(onComplete, onExit)   — open the grounding panel
     .close()                    — close / cleanup
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── Phase configuration ─── */
  const PHASES = [
    { name: 'inhale', label: 'Breathe In',  durationMs: 4000, scale: 1.55 },
    { name: 'hold',   label: 'Hold gently', durationMs: 4000, scale: 1.55 },
    { name: 'exhale', label: 'Breathe Out', durationMs: 6000, scale: 1.0  },
  ];
  const TARGET_CYCLES = 3;
  const ORB_BASE_SCALE = 1.0;
  const ORB_PEAK_SCALE = 1.55;

  /* ─── State ─── */
  let _onComplete = null;
  let _onExit = null;
  let _overlay = null;
  let _panel = null;
  let _phaseIndex = 0;
  let _cycleCount = 0;
  let _running = false;
  let _paused = false;
  let _rafId = null;
  let _phaseStartTs = 0;
  let _elapsedAtPause = 0;

  /* ─── Helpers ─── */
  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _prefersReducedMotion() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ─── DOM builders ─── */
  function _buildUI() {
    /* overlay */
    const overlay = document.createElement('div');
    overlay.id = 'thulirGroundingOverlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:3000;',
      'background:rgba(44,62,53,0.55);',
      'display:flex;align-items:center;justify-content:center;',
      'animation:tgFadeIn .25s ease both;',
    ].join('');

    /* panel */
    const panel = document.createElement('div');
    panel.id = 'thulirGroundingPanel';
    panel.style.cssText = [
      'background:#fff;border-radius:20px;padding:36px 30px 28px;',
      'width:min(480px,92vw);',
      'box-shadow:0 12px 48px rgba(44,62,53,.22);',
      'display:flex;flex-direction:column;align-items:center;gap:18px;',
      'font-family:"DM Sans",sans-serif;',
      'animation:tgSlideUp .3s cubic-bezier(.4,0,.2,1) both;',
    ].join('');

    panel.innerHTML = `
      <div style="width:100%;display:flex;align-items:flex-start;justify-content:space-between;">
        <div>
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#5E9E84;margin-bottom:4px;">
            🌬️ Guided Grounding
          </div>
          <h3 style="font-size:18px;font-weight:600;color:#2C3E35;margin:0;">Follow the circle</h3>
        </div>
        <button id="tgExitBtn"
          style="background:none;border:none;font-size:20px;cursor:pointer;color:#8FA49E;line-height:1;padding:4px;"
          title="Exit exercise" aria-label="Exit grounding exercise">✕</button>
      </div>

      <p style="font-size:13px;color:#5A706A;text-align:center;margin:0;line-height:1.6;max-width:360px;">
        Breathe gently with the circle. No need to hold your breath tightly —
        breathe at a pace that feels comfortable.
      </p>

      <!-- orb stage -->
      <div id="tgStage" style="
        position:relative;width:200px;height:200px;flex-shrink:0;
        display:flex;align-items:center;justify-content:center;
      ">
        <!-- outer ring -->
        <div id="tgRing" style="
          position:absolute;inset:0;border-radius:50%;
          border:2px dashed rgba(94,158,132,.3);
        "></div>
        <!-- breathing orb -->
        <div id="tgOrb" style="
          width:110px;height:110px;border-radius:50%;
          background:radial-gradient(circle at 32% 28%,#c4e2d4 0%,#5E9E84 55%,#3d7a60 100%);
          box-shadow:0 0 40px rgba(94,158,132,.4),0 0 80px rgba(94,158,132,.15),
                     inset 0 0 20px rgba(255,255,255,.3);
          transform:scale(1);
          transition:transform .5s ease;
          will-change:transform;
          display:flex;align-items:center;justify-content:center;
        ">
          <div id="tgOrbText" style="
            text-align:center;color:#fff;
            text-shadow:0 1px 3px rgba(0,0,0,.2);
          ">
            <div id="tgPhaseLabel" style="font-size:13px;font-weight:600;">Ready</div>
            <div id="tgCountdown" style="font-size:22px;font-weight:700;margin-top:2px;">—</div>
          </div>
        </div>
      </div>

      <!-- cycle progress -->
      <div style="display:flex;gap:10px;align-items:center;">
        <span id="tgDot0" style="width:10px;height:10px;border-radius:50%;background:#E0DDD6;transition:background .3s;"></span>
        <span id="tgDot1" style="width:10px;height:10px;border-radius:50%;background:#E0DDD6;transition:background .3s;"></span>
        <span id="tgDot2" style="width:10px;height:10px;border-radius:50%;background:#E0DDD6;transition:background .3s;"></span>
        <span style="font-size:12px;color:#8FA49E;margin-left:4px;" id="tgCycleLabel">0 / ${TARGET_CYCLES} cycles</span>
      </div>

      <!-- controls -->
      <div style="display:flex;gap:10px;width:100%;justify-content:center;">
        <button id="tgStartBtn"
          style="flex:1;max-width:130px;background:#5E9E84;color:#fff;border:none;border-radius:12px;
                 padding:11px 0;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;
                 cursor:pointer;transition:background .2s;">
          Start
        </button>
        <button id="tgPauseBtn" disabled
          style="flex:1;max-width:130px;background:#EDF4EF;color:#5E9E84;border:none;border-radius:12px;
                 padding:11px 0;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;
                 cursor:pointer;opacity:.5;transition:all .2s;">
          Pause
        </button>
      </div>

      <!-- completion banner (hidden initially) -->
      <div id="tgComplete" style="
        display:none;width:100%;border-radius:12px;
        background:linear-gradient(120deg,#EDF4EF,#f6fbf8);
        border:1px solid #C6D9C8;padding:16px 18px;text-align:center;
        animation:tgSlideUp .3s ease both;
      ">
        <div style="font-size:28px;margin-bottom:6px;">🌿</div>
        <div style="font-size:15px;font-weight:600;color:#2C3E35;">Well done!</div>
        <div style="font-size:13px;color:#5A706A;margin-top:4px;line-height:1.5;">
          You completed ${TARGET_CYCLES} grounding cycles.<br>Take a moment to notice how you feel.
        </div>
        <button id="tgDoneBtn"
          style="margin-top:14px;background:#5E9E84;color:#fff;border:none;border-radius:12px;
                 padding:11px 26px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;
                 cursor:pointer;transition:background .2s;">
          Earn my water drop 💧
        </button>
      </div>
    `;

    overlay.appendChild(panel);

    /* CSS keyframes (idempotent — only added once) */
    if (!document.getElementById('tgStyles')) {
      const style = document.createElement('style');
      style.id = 'tgStyles';
      style.textContent = `
        @keyframes tgFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes tgSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        #tgStartBtn:hover { background:#4a7a64 !important; }
        #tgDoneBtn:hover  { background:#4a7a64 !important; }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    return { overlay, panel };
  }

  /* ─── Exercise logic ─── */
  function _setPhase(index) {
    _phaseIndex = index % PHASES.length;
    _elapsedAtPause = 0;
    _phaseStartTs = performance.now();

    const phase = PHASES[_phaseIndex];
    const orb = document.getElementById('tgOrb');
    const label = document.getElementById('tgPhaseLabel');
    if (orb && !_prefersReducedMotion()) {
      orb.style.transform = `scale(${phase.scale})`;
    }
    if (label) label.textContent = phase.label;
  }

  function _tick(now) {
    if (!_running || _paused) return;

    const phase = PHASES[_phaseIndex];
    const elapsed = _elapsedAtPause + (now - _phaseStartTs);
    const progress = Math.min(elapsed / phase.durationMs, 1);

    /* countdown display */
    const remaining = Math.max(0, Math.ceil((phase.durationMs - elapsed) / 1000));
    const countdown = document.getElementById('tgCountdown');
    if (countdown) countdown.textContent = remaining + 's';

    if (progress >= 1) {
      /* advance to next phase */
      const nextIndex = _phaseIndex + 1;
      if (nextIndex >= PHASES.length) {
        /* completed one full cycle */
        _cycleCount++;
        _updateCycleDots();
        if (_cycleCount >= TARGET_CYCLES) {
          _showComplete();
          return;
        }
      }
      _setPhase(nextIndex);
    }

    _rafId = requestAnimationFrame(_tick);
  }

  function _updateCycleDots() {
    for (let i = 0; i < TARGET_CYCLES; i++) {
      const dot = document.getElementById(`tgDot${i}`);
      if (dot) {
        dot.style.background = i < _cycleCount ? '#5E9E84' : '#E0DDD6';
      }
    }
    const lbl = document.getElementById('tgCycleLabel');
    if (lbl) lbl.textContent = `${_cycleCount} / ${TARGET_CYCLES} cycles`;
  }

  function _showComplete() {
    _running = false;
    cancelAnimationFrame(_rafId);

    /* reset orb to neutral */
    const orb = document.getElementById('tgOrb');
    if (orb) orb.style.transform = 'scale(1)';

    const startBtn = document.getElementById('tgStartBtn');
    const pauseBtn = document.getElementById('tgPauseBtn');
    const completeDiv = document.getElementById('tgComplete');
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (completeDiv) completeDiv.style.display = 'block';

    const phaseLabel = document.getElementById('tgPhaseLabel');
    const countdown  = document.getElementById('tgCountdown');
    if (phaseLabel) phaseLabel.textContent = 'Done!';
    if (countdown)  countdown.textContent  = '🌿';
  }

  function _start() {
    _cycleCount = 0;
    _running = true;
    _paused = false;
    _phaseIndex = 0;
    _updateCycleDots();

    const startBtn = document.getElementById('tgStartBtn');
    const pauseBtn = document.getElementById('tgPauseBtn');
    if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '.5'; }
    if (pauseBtn) { pauseBtn.disabled = false; pauseBtn.style.opacity = '1'; }

    _setPhase(0);
    _rafId = requestAnimationFrame(_tick);
  }

  function _pause() {
    if (!_running) return;
    const pauseBtn = document.getElementById('tgPauseBtn');
    if (!_paused) {
      _paused = true;
      cancelAnimationFrame(_rafId);
      _elapsedAtPause += performance.now() - _phaseStartTs;
      const orb = document.getElementById('tgOrb');
      if (orb) orb.style.transform = 'scale(1)';
      const lbl = document.getElementById('tgPhaseLabel');
      if (lbl) lbl.textContent = 'Paused';
      const cd = document.getElementById('tgCountdown');
      if (cd) cd.textContent = '—';
      if (pauseBtn) pauseBtn.textContent = 'Resume';
    } else {
      _paused = false;
      _phaseStartTs = performance.now();
      const phase = PHASES[_phaseIndex];
      const orb = document.getElementById('tgOrb');
      if (orb && !_prefersReducedMotion()) orb.style.transform = `scale(${phase.scale})`;
      const lbl = document.getElementById('tgPhaseLabel');
      if (lbl) lbl.textContent = phase.label;
      if (pauseBtn) pauseBtn.textContent = 'Pause';
      _rafId = requestAnimationFrame(_tick);
    }
  }

  function _cleanup() {
    _running = false;
    _paused = false;
    cancelAnimationFrame(_rafId);
    if (_overlay && _overlay.parentNode) {
      _overlay.parentNode.removeChild(_overlay);
    }
    _overlay = null;
    _panel = null;
  }

  /* ─── Public API ─── */
  function open(onComplete, onExit) {
    if (_overlay) return; /* already open */

    _onComplete = typeof onComplete === 'function' ? onComplete : null;
    _onExit     = typeof onExit     === 'function' ? onExit     : null;
    _cycleCount = 0;
    _running = false;
    _paused  = false;

    const { overlay, panel } = _buildUI();
    _overlay = overlay;
    _panel   = panel;

    /* wire buttons */
    document.getElementById('tgStartBtn').addEventListener('click', _start);
    document.getElementById('tgPauseBtn').addEventListener('click', _pause);
    document.getElementById('tgExitBtn').addEventListener('click', function () {
      _cleanup();
      if (_onExit) _onExit();
    });
    document.getElementById('tgDoneBtn').addEventListener('click', function () {
      _cleanup();
      if (_onComplete) _onComplete();
    });
  }

  function close() {
    _cleanup();
  }

  window.ThulirGrounding = { open, close };
})();
