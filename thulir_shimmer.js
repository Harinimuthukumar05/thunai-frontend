/* ═══════════════════════════════════════════════════════════
   thulir_shimmer.js
   Cut the Shimmer Ball — mini-game for Thulir
   -------------------------------------------------------
   Canvas-based calming game: glowing shimmer balls drift
   across the play area. Mouse/touch swipes slice through
   balls, producing a burst of shimmering particles.

   Session length: 35 seconds.
   Completion: reaching the end of the timer (no score
   threshold required). Any session that plays through
   to completion earns the reward.

   Respects prefers-reduced-motion: particles are skipped
   and balls simply fade away instead of bursting.

   Public API (window.ThulirShimmer):
     .open(onComplete, onExit)
     .close()
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const SESSION_MS   = 35000;   // 35-second session
  const BALL_COUNT   = 7;       // max simultaneous balls on screen
  const PARTICLE_N   = 14;      // particles per burst

  let _overlay = null;
  let _canvas  = null;
  let _ctx     = null;
  let _rafId   = null;
  let _timerEnd  = 0;
  let _running   = false;
  let _completed = false;
  let _onComplete = null;
  let _onExit     = null;
  let _balls      = [];
  let _particles  = [];
  let _slashPoints = [];      // current pointer trail
  let _lastPointer = null;    // {x, y}

  const BALL_COLORS = [
    ['#7DD4B4', '#3d9e7a'],
    ['#A0D4F0', '#3d8ab5'],
    ['#C4B0F0', '#7b62c8'],
    ['#F0C4B0', '#c87b3d'],
    ['#B0F0D4', '#3dc896'],
    ['#F0E0A0', '#b5962a'],
    ['#F0A0C4', '#c83d78'],
  ];

  function _reduced() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ─── Ball factory ─── */
  function _makeBall(canvasW, canvasH) {
    const r = 28 + Math.random() * 18;
    const colorPair = BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)];
    const edge = Math.floor(Math.random() * 4);
    let x, y, vx, vy;
    const speed = 0.6 + Math.random() * 0.9;

    if (edge === 0)      { x = -r; y = Math.random() * canvasH; vx =  speed; vy = (Math.random()-.5)*speed*.6; }
    else if (edge === 1) { x = canvasW+r; y = Math.random()*canvasH; vx = -speed; vy = (Math.random()-.5)*speed*.6; }
    else if (edge === 2) { x = Math.random()*canvasW; y = -r; vx = (Math.random()-.5)*speed*.6; vy =  speed; }
    else                 { x = Math.random()*canvasW; y = canvasH+r; vx = (Math.random()-.5)*speed*.6; vy = -speed; }

    return {
      x, y, vx, vy, r,
      colors: colorPair,
      glow: 0.5 + Math.random() * 0.5,
      glowDir: 1,
      alive: true,
      opacity: 1,
    };
  }

  /* ─── Particle factory ─── */
  function _burst(x, y, colors) {
    if (_reduced()) return;
    for (let i = 0; i < PARTICLE_N; i++) {
      const angle = (Math.PI * 2 * i) / PARTICLE_N + Math.random() * .5;
      const speed = 1.5 + Math.random() * 3;
      _particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 5,
        opacity: 1,
        color: Math.random() > .5 ? colors[0] : colors[1],
      });
    }
  }

  /* ─── Collision detection ─── */
  function _slashHitsBall(ball) {
    if (_slashPoints.length < 2) return false;
    for (let i = 1; i < _slashPoints.length; i++) {
      const ax = _slashPoints[i-1].x, ay = _slashPoints[i-1].y;
      const bx = _slashPoints[i].x,   by = _slashPoints[i].y;
      // Distance from ball centre to segment [A, B]
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx*dx + dy*dy;
      if (lenSq === 0) continue;
      let t = ((ball.x - ax)*dx + (ball.y - ay)*dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t*dx, cy = ay + t*dy;
      const dist = Math.hypot(ball.x - cx, ball.y - cy);
      if (dist < ball.r + 10) return true;
    }
    return false;
  }

  /* ─── Draw ─── */
  function _draw() {
    if (!_ctx || !_canvas) return;
    const W = _canvas.width, H = _canvas.height;
    _ctx.clearRect(0, 0, W, H);

    /* balls */
    _balls.forEach(b => {
      if (!b.alive && b.opacity <= 0) return;
      _ctx.save();
      _ctx.globalAlpha = b.alive ? 1 : b.opacity;
      const grad = _ctx.createRadialGradient(b.x - b.r*.3, b.y - b.r*.3, b.r*.1, b.x, b.y, b.r);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(.4, b.colors[0]);
      grad.addColorStop(1, b.colors[1]);
      _ctx.beginPath();
      _ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      _ctx.fillStyle = grad;
      _ctx.shadowBlur  = 18 * b.glow;
      _ctx.shadowColor = b.colors[0];
      _ctx.fill();
      /* shimmer specular */
      _ctx.beginPath();
      _ctx.arc(b.x - b.r*.3, b.y - b.r*.3, b.r*.22, 0, Math.PI*2);
      _ctx.fillStyle = 'rgba(255,255,255,.55)';
      _ctx.shadowBlur = 0;
      _ctx.fill();
      _ctx.restore();
    });

    /* particles */
    _particles.forEach(p => {
      _ctx.save();
      _ctx.globalAlpha = p.opacity;
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      _ctx.fillStyle = p.color;
      _ctx.shadowBlur  = 8;
      _ctx.shadowColor = p.color;
      _ctx.fill();
      _ctx.restore();
    });

    /* slash trail */
    if (_slashPoints.length > 1) {
      _ctx.save();
      _ctx.strokeStyle = 'rgba(200,240,220,.75)';
      _ctx.lineWidth   = 3;
      _ctx.lineCap     = 'round';
      _ctx.lineJoin    = 'round';
      _ctx.shadowBlur  = 6;
      _ctx.shadowColor = 'rgba(94,158,132,.6)';
      _ctx.beginPath();
      _ctx.moveTo(_slashPoints[0].x, _slashPoints[0].y);
      for (let i = 1; i < _slashPoints.length; i++) {
        _ctx.lineTo(_slashPoints[i].x, _slashPoints[i].y);
      }
      _ctx.stroke();
      _ctx.restore();
    }
  }

  /* ─── Game loop ─── */
  function _loop(now) {
    if (!_running) return;

    const remaining = Math.max(0, _timerEnd - now);
    const timerEl   = document.getElementById('tgShimmerTimer');
    if (timerEl) {
      const secs = Math.ceil(remaining / 1000);
      timerEl.textContent = secs + 's';
      /* colour shift when nearly done */
      timerEl.style.color = secs <= 10 ? '#e88a4a' : '#5E9E84';
    }

    /* progress ring */
    const ringEl = document.getElementById('tgShimmerRing');
    if (ringEl) {
      const frac = remaining / SESSION_MS;
      const circ = 2 * Math.PI * 18;
      ringEl.style.strokeDasharray  = circ;
      ringEl.style.strokeDashoffset = circ * (1 - frac);
    }

    if (remaining <= 0 && !_completed) {
      _finish();
      return;
    }

    const W = _canvas ? _canvas.width  : 400;
    const H = _canvas ? _canvas.height : 320;

    /* spawn balls to maintain count */
    const aliveBalls = _balls.filter(b => b.alive);
    while (aliveBalls.length < BALL_COUNT) {
      const b = _makeBall(W, H);
      _balls.push(b);
      aliveBalls.push(b);
    }

    /* update balls */
    _balls = _balls.filter(b => b.alive || b.opacity > 0);
    _balls.forEach(b => {
      if (b.alive) {
        b.x += b.vx;
        b.y += b.vy;
        /* glow pulse */
        b.glow += 0.015 * b.glowDir;
        if (b.glow > 1)   { b.glow = 1;   b.glowDir = -1; }
        if (b.glow < .35) { b.glow = .35; b.glowDir =  1; }
        /* check slash */
        if (_slashPoints.length > 1 && _slashHitsBall(b)) {
          _burst(b.x, b.y, b.colors);
          b.alive = false;
          b.opacity = 0;
          return;
        }
        /* off-screen cull */
        if (b.x < -b.r*3 || b.x > W+b.r*3 || b.y < -b.r*3 || b.y > H+b.r*3) {
          b.alive = false;
          b.opacity = 0;
        }
      } else {
        b.opacity -= 0.06;
      }
    });

    /* update particles */
    _particles = _particles.filter(p => p.opacity > 0);
    _particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= .94;
      p.vy *= .94;
      p.r  *= .95;
      p.opacity -= 0.03;
    });

    /* fade out slash trail */
    if (_slashPoints.length > 0 && !_lastPointer) {
      _slashPoints.shift();
    }

    _draw();
    _rafId = requestAnimationFrame(_loop);
  }

  /* ─── Completion ─── */
  function _finish() {
    _running   = false;
    _completed = true;
    cancelAnimationFrame(_rafId);
    if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    const game     = document.getElementById('tgShimmerGame');
    const complete = document.getElementById('tgShimmerComplete');
    if (game)     game.style.display     = 'none';
    if (complete) complete.style.display = 'flex';
  }

  /* ─── Pointer events ─── */
  function _onPointerDown(e) {
    e.preventDefault();
    const pt = _canvasPoint(e);
    _lastPointer = pt;
    _slashPoints = [pt];
  }
  function _onPointerMove(e) {
    e.preventDefault();
    if (!_lastPointer) return;
    const pt = _canvasPoint(e);
    _lastPointer = pt;
    _slashPoints.push(pt);
    if (_slashPoints.length > 20) _slashPoints.shift();
  }
  function _onPointerUp(e) {
    _lastPointer = null;
    /* keep slash briefly then clear */
    setTimeout(() => { _slashPoints = []; }, 120);
  }
  function _canvasPoint(e) {
    const rect = _canvas.getBoundingClientRect();
    const scaleX = _canvas.width  / rect.width;
    const scaleY = _canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }

  /* ─── DOM builder ─── */
  function _buildUI() {
    const overlay = document.createElement('div');
    overlay.id = 'thulirShimmerOverlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:3000;',
      'background:rgba(44,62,53,.55);',
      'display:flex;align-items:center;justify-content:center;',
      'animation:tgFadeIn .25s ease both;',
      'padding:16px;',
    ].join('');

    overlay.innerHTML = `
      <div style="
        background:#0f1f18;border-radius:20px;overflow:hidden;
        width:min(580px,96vw);
        box-shadow:0 12px 48px rgba(0,0,0,.5);
        font-family:'DM Sans',sans-serif;
        animation:tgSlideUp .3s cubic-bezier(.4,0,.2,1) both;
        position:relative;
      ">
        <!-- header bar -->
        <div style="
          display:flex;align-items:center;justify-content:space-between;
          padding:14px 18px;background:#152614;border-bottom:1px solid rgba(94,158,132,.15);
        ">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:18px;">✨</span>
            <span style="font-size:14px;font-weight:600;color:#c4e2d4;">Cut the Shimmer Ball</span>
          </div>
          <div style="display:flex;align-items:center;gap:14px;">
            <!-- timer ring + countdown -->
            <div style="position:relative;width:40px;height:40px;flex-shrink:0;">
              <svg width="40" height="40" style="transform:rotate(-90deg);display:block;">
                <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(94,158,132,.2)" stroke-width="3"/>
                <circle id="tgShimmerRing" cx="20" cy="20" r="18" fill="none"
                  stroke="#5E9E84" stroke-width="3" stroke-linecap="round"
                  stroke-dasharray="113.1" stroke-dashoffset="0"/>
              </svg>
              <span id="tgShimmerTimer"
                style="position:absolute;inset:0;display:flex;align-items:center;
                       justify-content:center;font-size:11px;font-weight:700;
                       color:#5E9E84;">
                35s
              </span>
            </div>
            <button id="tgShimmerExit"
              style="background:none;border:none;font-size:20px;cursor:pointer;
                     color:#7a9a8a;line-height:1;padding:4px;"
              title="Exit game" aria-label="Exit shimmer game">✕</button>
          </div>
        </div>

        <!-- game area -->
        <div id="tgShimmerGame" style="position:relative;">
          <canvas id="tgShimmerCanvas"
            style="display:block;width:100%;touch-action:none;cursor:crosshair;"
            width="580" height="340">
          </canvas>
          <div style="
            position:absolute;bottom:10px;left:50%;transform:translateX(-50%);
            font-size:11px;color:rgba(255,255,255,.3);
            pointer-events:none;white-space:nowrap;
          ">Swipe across the glowing balls to burst them</div>
        </div>

        <!-- completion state -->
        <div id="tgShimmerComplete" style="
          display:none;min-height:260px;
          flex-direction:column;align-items:center;justify-content:center;
          gap:14px;padding:32px 24px;text-align:center;
        ">
          <div style="font-size:48px;filter:drop-shadow(0 0 16px rgba(94,158,132,.6));">✨</div>
          <div style="font-size:18px;font-weight:600;color:#c4e2d4;">Session complete!</div>
          <div style="font-size:13px;color:#7a9a8a;line-height:1.6;max-width:300px;">
            You took a playful, sparkling break.<br>
            A little light goes a long way.
          </div>
          <button id="tgShimmerDoneBtn"
            style="background:#5E9E84;color:#fff;border:none;border-radius:12px;
                   padding:13px 28px;font-family:'DM Sans',sans-serif;
                   font-size:14px;font-weight:600;cursor:pointer;
                   transition:background .2s;margin-top:4px;">
            Earn my water drop 💧
          </button>
        </div>
      </div>
    `;

    return overlay;
  }

  /* ─── Public API ─── */
  function open(onComplete, onExit) {
    if (_overlay) return;

    _onComplete = typeof onComplete === 'function' ? onComplete : null;
    _onExit     = typeof onExit     === 'function' ? onExit     : null;
    _balls      = [];
    _particles  = [];
    _slashPoints = [];
    _lastPointer = null;
    _completed  = false;
    _running    = false;

    _overlay = _buildUI();
    document.body.appendChild(_overlay);

    _canvas = document.getElementById('tgShimmerCanvas');
    _ctx    = _canvas ? _canvas.getContext('2d') : null;

    /* exit button */
    document.getElementById('tgShimmerExit').addEventListener('click', function () {
      _cleanUp();
      if (_onExit) _onExit();
    });

    /* done button */
    document.getElementById('tgShimmerDoneBtn').addEventListener('click', function () {
      _cleanUp();
      if (_onComplete) _onComplete();
    });

    /* pointer events */
    if (_canvas) {
      _canvas.addEventListener('mousedown',  _onPointerDown, { passive: false });
      _canvas.addEventListener('mousemove',  _onPointerMove, { passive: false });
      _canvas.addEventListener('mouseup',    _onPointerUp);
      _canvas.addEventListener('mouseleave', _onPointerUp);
      _canvas.addEventListener('touchstart', _onPointerDown, { passive: false });
      _canvas.addEventListener('touchmove',  _onPointerMove, { passive: false });
      _canvas.addEventListener('touchend',   _onPointerUp);
    }

    /* start loop */
    _running  = true;
    _timerEnd = performance.now() + SESSION_MS;
    _rafId    = requestAnimationFrame(_loop);
  }

  function _cleanUp() {
    _running = false;
    cancelAnimationFrame(_rafId);
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
    _canvas  = null;
    _ctx     = null;
  }

  function close() { _cleanUp(); }

  window.ThulirShimmer = { open, close };
})();
