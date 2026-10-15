/* ═══════════════════════════════════════════════════════════
   thulir_grounding.js
   Guided Grounding Exercise for Thulir
   -------------------------------------------------------
   An isolated, self-contained grounding breathing exercise.
   Runs a 4-4-6 pattern (inhale 4 s, hold 4 s, exhale 6 s).
   Completion is triggered after exactly 3 full cycles.
   The user may exit at any time with no penalty.

   Performance fix (Oct 2026):
   ─ Root cause of lag: CSS transition on the orb + rAF loop
     writing countdown text every frame forced the browser to
     flush style recalculation ~60×/s while the transition ran.
   ─ Fix: orb animation now runs entirely via Web Animations API
     (compositor-threaded). The rAF loop only updates the cheap
     countdown textContent — no layout recalculation triggered.
   ─ Pause/resume now freezes the animation at its current
     rendered position and resumes from there.

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
    { name: 'inhale', label: 'Breathe In',  durationMs: 4000, scale: 1.55, easing: 'ease-in'  },
    { name: 'hold',   label: 'Hold gently', durationMs: 4000, scale: 1.55, easing: 'linear'   },
    { name: 'exhale', label: 'Breathe Out', durationMs: 6000, scale: 1.0,  easing: 'ease-out' },
  ];
  const TARGET_CYCLES  = 3;
  const ORB_BASE_SCALE = 1.0;

  /* ─── Module state ─── */
  let _onComplete    = null;
  let _onExit        = null;
  let _overlay       = null;
  let _panel         = null;
  let _phaseIndex    = 0;
  let _cycleCount    = 0;
  let _running       = false;
  let _paused        = false;
  let _rafId         = null;
  let _phaseStartTs  = 0;      // performance.now() when current phase began (or resumed)
  let _elapsedAtPause = 0;     // ms elapsed before the last pause
  let _orbAnim       = null;   // current Web Animations API Animation object
  let _currentScale  = ORB_BASE_SCALE; // tracked orb scale for resume continuity

  /* ─── Helpers ─── */
  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _prefersReducedMotion() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ─── Orb animation (Web Animations API) ─── */
  /*
   * We drive the breathing orb entirely through the Web Animations API
   * instead of CSS transitions. This keeps the animation on the
   * compositor thread and decouples it from the rAF loop that updates
   * the countdown text — eliminating the forced-reflow jank.
   */
  function _animateOrb(fromScale, toScale, durationMs, easingFn) {
    const orb = document.getElementById('tgOrb');
    if (!orb || _prefersReducedMotion()) {
      _currentScale = toScale;
      return null;
    }
    const anim = orb.animate(
      [
        { transform: `scale(${fromScale})` },
        { transform: `scale(${toScale})`   },
      ],
      {
        duration: durationMs,
        easing:   easingFn,
        fill:     'forwards',
      }
    );
    _currentScale = toScale; // will be the final value when animation finishes
    return anim;
  }

  /* Cancel any currently running orb animation */
  function _cancelOrbAnim() {
    if (_orbAnim) {
      try {
        // Commit the current position before cancelling so the orb
        // stays at whatever scale it reached rather than snapping back.
        _orbAnim.commitStyles();
        _orbAnim.cancel();
      } catch (_) { /* commitStyles may throw if element is detached */ }
      _orbAnim = null;
    }
  }

  /* Read the orb's current rendered scale (for smooth resume) */
  function _readOrbScale() {
    const orb = document.getElementById('tgOrb');
    if (!orb) return ORB_BASE_SCALE;
    try {
      // matrix(a,b,c,d,tx,ty) — scale is 'a' for uniform scale
      const style  = window.getComputedStyle(orb);
      const matrix = style.transform || style.webkitTransform || '';
      if (matrix && matrix !== 'none') {
        const m = matrix.match(/matrix\(([^,]+)/);
        if (m) return parseFloat(m[1]);
      }
    } catch (_) {}
    return _currentScale;
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

        <!-- breathing orb — animation is driven by Web Animations API,
             NOT by the rAF loop, so no layout cost per frame -->
        <div id="tgOrb" style="
          width:110px;height:110px;border-radius:50%;
          background:radial-gradient(circle at 32% 28%,#c4e2d4 0%,#5E9E84 55%,#3d7a60 100%);
          box-shadow:0 0 40px rgba(94,158,132,.4),0 0 80px rgba(94,158,132,.15),
                     inset 0 0 20px rgba(255,255,255,.3);
          transform:scale(1);
          will-change:transform;
          display:flex;align-items:center;justify-content:center;
        ">
          <div id="tgOrbText" style="
            text-align:center;color:#fff;
            text-shadow:0 1px 3px rgba(0,0,0,.2);
            pointer-events:none;
          ">
            <div id="tgPhaseLabel" style="font-size:13px;font-weight:600;">Ready</div>
            <div id="tgCountdown"  style="font-size:22px;font-weight:700;margin-top:2px;">—</div>
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
        @keyframes tgFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes tgSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
        #tgStartBtn:hover { background:#4a7a64 !important; }
        #tgDoneBtn:hover  { background:#4a7a64 !important; }
        #tgPauseBtn:not(:disabled):hover { background:#d5ebe0 !important; }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    return { overlay, panel };
  }

  /* ─── Exercise logic ─── */

  /*
   * _setPhase(index, fromScale)
   *
   * Starts a new breathing phase. Launches the orb animation
   * using the Web Animations API from `fromScale` to the phase's
   * target scale over the full phase duration.
   *
   * The rAF loop (_tick) handles ONLY the countdown text and
   * phase-end detection — it does not touch orb styles.
   */
  function _setPhase(index, fromScale) {
    _phaseIndex     = index % PHASES.length;
    _elapsedAtPause = 0;
    _phaseStartTs   = performance.now();

    const phase = PHASES[_phaseIndex];
    const label = document.getElementById('tgPhaseLabel');
    if (label) label.textContent = phase.label;

    /* Cancel any previous orb animation cleanly */
    _cancelOrbAnim();

    /* Start the new orb animation (compositor-threaded, no rAF cost) */
    const start = (fromScale !== undefined) ? fromScale : _currentScale;
    _orbAnim = _animateOrb(start, phase.scale, phase.durationMs, phase.easing);
  }

  /*
   * _tick(now)
   *
   * rAF callback — only updates the countdown text and checks
   * whether the current phase has elapsed. It NEVER touches
   * orb transform/style, so there is no forced layout reflow.
   */
  function _tick(now) {
    if (!_running || _paused) return;

    const phase   = PHASES[_phaseIndex];
    const elapsed = _elapsedAtPause + (now - _phaseStartTs);
    const remaining = Math.max(0, Math.ceil((phase.durationMs - elapsed) / 1000));

    /* Update countdown — cheap textContent write, no layout flush */
    const countdown = document.getElementById('tgCountdown');
    if (countdown) countdown.textContent = remaining + 's';

    if (elapsed >= phase.durationMs) {
      /* Phase complete — advance */
      const nextIndex = _phaseIndex + 1;
      if (nextIndex >= PHASES.length) {
        /* End of one full cycle */
        _cycleCount++;
        _updateCycleDots();
        if (_cycleCount >= TARGET_CYCLES) {
          _showComplete();
          return; // stop the rAF loop
        }
      }
      /* Start next phase from the previous phase's end scale */
      _setPhase(nextIndex, PHASES[_phaseIndex].scale);
    }

    _rafId = requestAnimationFrame(_tick);
  }

  function _updateCycleDots() {
    for (let i = 0; i < TARGET_CYCLES; i++) {
      const dot = document.getElementById(`tgDot${i}`);
      if (dot) dot.style.background = i < _cycleCount ? '#5E9E84' : '#E0DDD6';
    }
    const lbl = document.getElementById('tgCycleLabel');
    if (lbl) lbl.textContent = `${_cycleCount} / ${TARGET_CYCLES} cycles`;
  }

  function _showComplete() {
    _running = false;
    cancelAnimationFrame(_rafId);
    _cancelOrbAnim();

    /* Reset orb to neutral — instant, no transition needed */
    const orb = document.getElementById('tgOrb');
    if (orb) orb.style.transform = 'scale(1)';
    _currentScale = ORB_BASE_SCALE;

    const startBtn    = document.getElementById('tgStartBtn');
    const pauseBtn    = document.getElementById('tgPauseBtn');
    const completeDiv = document.getElementById('tgComplete');
    if (startBtn)    startBtn.style.display    = 'none';
    if (pauseBtn)    pauseBtn.style.display    = 'none';
    if (completeDiv) completeDiv.style.display = 'block';

    const phaseLabel = document.getElementById('tgPhaseLabel');
    const countdown  = document.getElementById('tgCountdown');
    if (phaseLabel) phaseLabel.textContent = 'Done!';
    if (countdown)  countdown.textContent  = '🌿';
  }

  function _start() {
    _cycleCount    = 0;
    _running       = true;
    _paused        = false;
    _currentScale  = ORB_BASE_SCALE;
    _updateCycleDots();

    const startBtn = document.getElementById('tgStartBtn');
    const pauseBtn = document.getElementById('tgPauseBtn');
    if (startBtn) { startBtn.disabled = true;  startBtn.style.opacity = '.5'; }
    if (pauseBtn) { pauseBtn.disabled = false; pauseBtn.style.opacity = '1'; }

    _setPhase(0, ORB_BASE_SCALE);
    _rafId = requestAnimationFrame(_tick);
  }

  function _pause() {
    if (!_running) return;
    const pauseBtn = document.getElementById('tgPauseBtn');

    if (!_paused) {
      /* ── Pausing ── */
      _paused = true;
      cancelAnimationFrame(_rafId);

      /* Accumulate elapsed time before freezing */
      _elapsedAtPause += performance.now() - _phaseStartTs;

      /* Freeze the orb at its current rendered position */
      if (_orbAnim) {
        try { _orbAnim.pause(); } catch (_) {}
        /* Read actual rendered scale so resume can continue from here */
        _currentScale = _readOrbScale();
      }

      /* Update UI */
      const lbl = document.getElementById('tgPhaseLabel');
      const cd  = document.getElementById('tgCountdown');
      if (lbl) lbl.textContent = 'Paused';
      if (cd)  cd.textContent  = '—';
      if (pauseBtn) pauseBtn.textContent = 'Resume';

    } else {
      /* ── Resuming ── */
      _paused = false;

      /* Cancel the frozen orb anim and start a fresh one from current scale
         covering only the REMAINING duration of this phase */
      _cancelOrbAnim();
      const phase     = PHASES[_phaseIndex];
      const remaining = Math.max(0, phase.durationMs - _elapsedAtPause);
      _orbAnim = _animateOrb(_currentScale, phase.scale, remaining, phase.easing);

      /* Reset the phase start timestamp to NOW (elapsed is preserved in _elapsedAtPause) */
      _phaseStartTs = performance.now();

      /* Restore phase label */
      const lbl = document.getElementById('tgPhaseLabel');
      if (lbl) lbl.textContent = phase.label;
      if (pauseBtn) pauseBtn.textContent = 'Pause';

      _rafId = requestAnimationFrame(_tick);
    }
  }

  function _cleanup() {
    _running = false;
    _paused  = false;
    cancelAnimationFrame(_rafId);
    _cancelOrbAnim();
    _currentScale  = ORB_BASE_SCALE;
    _elapsedAtPause = 0;
    if (_overlay && _overlay.parentNode) {
      _overlay.parentNode.removeChild(_overlay);
    }
    _overlay = null;
    _panel   = null;
  }

  /* ─── Public API ─── */
  function open(onComplete, onExit) {
    if (_overlay) return; /* already open — prevent duplicates */

    _onComplete = typeof onComplete === 'function' ? onComplete : null;
    _onExit     = typeof onExit     === 'function' ? onExit     : null;
    _cycleCount    = 0;
    _running       = false;
    _paused        = false;
    _currentScale  = ORB_BASE_SCALE;
    _elapsedAtPause = 0;

    const { overlay, panel } = _buildUI();
    _overlay = overlay;
    _panel   = panel;

    /* Wire buttons */
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

    /* Keyboard: Escape to exit */
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { _cleanup(); if (_onExit) _onExit(); }
    });
  }

  function close() {
    _cleanup();
  }

  window.ThulirGrounding = { open, close };
})();
