/* ═══════════════════════════════════════════════════════════
   emojiAnimation.js
   Brings the mood emojis to life (FEATURE 1) using lightweight,
   dependency-free CSS keyframe animations instead of heavy GIF /
   Lottie assets (no extra network requests, nothing to fail to
   load offline). Each mood gets its own subtle motion, loops
   forever, and never changes the card's footprint. If, for any
   reason, the animation CSS fails to apply, the emoji simply sits
   still and fully visible — an automatic, layout-safe fallback.
   ═══════════════════════════════════════════════════════════ */

/**
 * Per-mood animation class + small decorative extra (sparkle,
 * tear, Zzz, steam, sweat) rendered as a ::after pseudo-element
 * so it never affects layout height.
 */
const EMOJI_ANIM_MAP = {
  Happy:      { cls: 'emo-anim-happy',      extra: 'emo-extra-sparkle' },
  Calm:       { cls: 'emo-anim-calm',       extra: '' },
  Anxious:    { cls: 'emo-anim-anxious',    extra: 'emo-extra-sweat' },
  Sad:        { cls: 'emo-anim-sad',        extra: 'emo-extra-tear' },
  Tired:      { cls: 'emo-anim-tired',      extra: 'emo-extra-zzz' },
  Frustrated: { cls: 'emo-anim-frustrated', extra: 'emo-extra-steam' }
};

/**
 * Injects the keyframes + helper classes once per page load.
 * Kept in JS (rather than the main stylesheet) so this whole
 * feature is self-contained and easy to remove/extend later.
 */
function injectEmojiAnimationStyles() {
  if (document.getElementById('emoji-anim-styles')) return;
  const style = document.createElement('style');
  style.id = 'emoji-anim-styles';
  style.textContent = `
    .mood-mini .mme{position:relative;display:inline-block;will-change:transform}
    .mood-mini:hover .mme{transform:scale(1.15)}
    @media (prefers-reduced-motion: reduce){
      .mood-mini .mme{animation:none !important}
    }

    @keyframes emoBounce{0%,100%{transform:translateY(0) scale(1)}30%{transform:translateY(-3px) scale(1.04)}50%{transform:translateY(0) scale(1)}70%{transform:translateY(-1px)}}
    .emo-anim-happy{animation:emoBounce 1.8s ease-in-out infinite}

    @keyframes emoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
    .emo-anim-calm{animation:emoFloat 3.2s ease-in-out infinite}

    @keyframes emoShake{0%,100%{transform:translateX(0) rotate(0)}20%{transform:translateX(-1.5px) rotate(-4deg)}40%{transform:translateX(1.5px) rotate(4deg)}60%{transform:translateX(-1px) rotate(-3deg)}80%{transform:translateX(1px) rotate(3deg)}}
    .emo-anim-anxious{animation:emoShake 0.7s ease-in-out infinite}

    @keyframes emoNod{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(2px) rotate(-3deg)}}
    .emo-anim-sad{animation:emoNod 2.6s ease-in-out infinite}

    @keyframes emoDoze{0%,100%{transform:rotate(0)}50%{transform:rotate(6deg)}}
    .emo-anim-tired{animation:emoDoze 2.4s ease-in-out infinite}

    @keyframes emoFume{0%,100%{transform:scale(1)}25%{transform:scale(1.05)}50%{transform:scale(0.98)}75%{transform:scale(1.03)}}
    .emo-anim-frustrated{animation:emoFume 1s ease-in-out infinite}

    /* decorative extras — absolutely positioned so they never grow the card */
    .emo-extra-sparkle::after{content:'✨';position:absolute;top:-6px;right:-8px;font-size:10px;animation:emoSparkle 1.8s ease-in-out infinite}
    @keyframes emoSparkle{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}

    .emo-extra-sweat::after{content:'💧';position:absolute;top:-2px;right:-9px;font-size:9px;animation:emoSweat 1.4s ease-in infinite}
    @keyframes emoSweat{0%{opacity:0;transform:translateY(-2px)}30%{opacity:1}100%{opacity:0;transform:translateY(6px)}}

    .emo-extra-tear::after{content:'💧';position:absolute;bottom:-2px;left:8px;font-size:8px;animation:emoTear 2.2s ease-in infinite}
    @keyframes emoTear{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(7px)}}

    .emo-extra-zzz::after{content:'Zzz';position:absolute;top:-10px;right:-12px;font-size:9px;font-weight:700;color:var(--text-muted);animation:emoZzz 2.6s ease-in-out infinite}
    @keyframes emoZzz{0%,100%{opacity:0;transform:translateY(2px) scale(.8)}50%{opacity:1;transform:translateY(-4px) scale(1)}}

    .emo-extra-steam::after{content:'💨';position:absolute;top:-8px;left:50%;transform:translateX(-50%);font-size:9px;animation:emoSteam 1.3s ease-out infinite}
    @keyframes emoSteam{0%{opacity:0;transform:translate(-50%,2px)}40%{opacity:1}100%{opacity:0;transform:translate(-50%,-8px)}}
  `;
  document.head.appendChild(style);
}

/**
 * Applies the mood-specific animation + extra classes to every
 * `.mme` emoji inside mood cards on the page. Safe to call more
 * than once (idempotent — clears old classes first).
 * @param {string} [containerSelector] optional scope, defaults to whole document
 */
function applyEmojiAnimations(containerSelector) {
  try {
    injectEmojiAnimationStyles();
    const root = containerSelector ? document.querySelector(containerSelector) : document;
    if (!root) return;
    root.querySelectorAll('.mood-mini[data-m]').forEach(card => {
      const mood = card.getAttribute('data-m');
      const emo = card.querySelector('.mme');
      if (!emo) return;
      const cfg = EMOJI_ANIM_MAP[mood];
      // clear any previously-applied animation classes (idempotent)
      Object.values(EMOJI_ANIM_MAP).forEach(c => {
        emo.classList.remove(c.cls);
        if (c.extra) emo.classList.remove(c.extra);
      });
      if (cfg) {
        emo.classList.add(cfg.cls);
        if (cfg.extra) emo.classList.add(cfg.extra);
      }
    });
  } catch (e) {
    // Fallback: if anything goes wrong, emojis simply stay static — no crash, no broken layout.
    console.warn('emojiAnimation: falling back to static emojis', e);
  }
}

window.EmojiAnimation = { apply: applyEmojiAnimations };