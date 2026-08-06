/* ═══════════════════════════════════════════════════════════
   Chatoffline.js

   Integrated chat handler. There is exactly ONE path that renders an
   assistant reply that came from the backend: handleAssistantResponse()
   -> renderAssistantResponse() (defined in UI.html), called only after
   the voice job has resolved (completed / failed / timed out), or
   immediately when voice was never requested for this message.

   No code path may call renderAssistantResponse() -- or any other
   assistant-bubble renderer -- right after BackendService.sendMessage()
   resolves. The reply is held in a closure variable until voice status
   is final.

   Non-backend paths (crisis detection, offline knowledge-base fallback)
   have no voice component and use the plain appendMsg()/appendMsgHtml()
   bubble helpers, since there's nothing to wait on.

   Depends on:
   - BackendService.js (API + polling)
   - UI.html inline script (appendMsg, appendMsgHtml, showTyping,
     removeTyping, renderAssistantResponse, esc)
   - offlineKnowledgeBase.js (fallback)
   - crisisDetection.js (safety)
   - settings.js (voice/user settings)
   ═══════════════════════════════════════════════════════════ */

// Cancel function for the currently-active voice poll, if any. Only one
// poll is ever allowed to be in flight; starting a new message always
// cancels whatever poll preceded it.
let _activeVoicePollCancel = null;

function _loadChatHistory() {
  try {
    const raw = localStorage.getItem('thunai_chat_history');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Could not load chat history from storage', e);
    return [];
  }
}

function _saveChatHistory(history) {
  localStorage.setItem('thunai_chat_history', JSON.stringify(history));
}

function _syncChatHistoryView() {
  if (typeof window.renderPersistedChatHistory === 'function') {
    window.renderPersistedChatHistory();
  }
}

/**
 * Entry point: called on Send click / Enter key / suggestion chip.
 * Displays the user's message immediately, then hands off to either the
 * crisis-detection path or the backend+voice path. Never renders an
 * assistant bubble itself.
 */
async function chatSendMsgOffline() {
  const tf = document.getElementById('chatTf');
  const txt = tf.value.trim();
  if (!txt) return;

  appendMsg('user', txt);
  saveChatToHistory(txt, null, 'pending');
  tf.value = '';
  tf.style.height = 'auto';

  // Cancel any poll left over from a previous message before starting a new one.
  if (_activeVoicePollCancel) {
    _activeVoicePollCancel();
    _activeVoicePollCancel = null;
  }

  // ── Crisis detection — highest priority, always checked first. ──
  const riskType = window.CrisisDetection ? window.CrisisDetection.classify(txt) : null;
  if (riskType) {
    window.CrisisDetection.showBanner();
    showTyping();
    setTimeout(() => {
      removeTyping();
      appendMsg('ai', window.CrisisDetection.getChatResponse(riskType));
      setTimeout(() => {
        window.CrisisDetection.goToCareContacts();
      }, 3200);
    }, 900);
    return; // backend and KB are never consulted for a crisis message
  }

  await handleAssistantResponse(txt);
}

/**
 * THE single send+wait flow for a backend-generated reply.
 *
 *   1. Show typing indicator.
 *   2. POST /chat -- store the reply text, do NOT render it.
 *   3. If voice was requested and is still pending, keep the typing
 *      indicator up and poll /voice/status until completed/failed/timeout.
 *   4. Exactly once, call renderAssistantResponse() with the final
 *      text + audioUrl (audioUrl is null if voice was disabled, failed,
 *      or timed out -- the text still renders either way).
 *
 * @param {string} txt - the user's message text
 */
async function handleAssistantResponse(txt) {
  showTyping("✨ ThunAI is preparing your response...");

  const settings = typeof loadUserSettings === 'function' ? loadUserSettings() : {};
  const userId = typeof getCurrentVoiceUserId === 'function'
    ? getCurrentVoiceUserId()
    : String(settings.voiceUserId || settings.username || 'default_user').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'default_user';
  const voiceEnabled = settings.voiceEnabled === true;
  const useClonedVoice = settings.voiceMode === 'cloned' && settings.clonedVoice !== null;
  const defaultVoice = settings.defaultVoice || 'female';

  console.log(`[CHAT_SEND] Sending message to backend:`, {
    txt_len: txt.length,
    userId,
    voiceEnabled,
    useClonedVoice,
    defaultVoice
  });

  let result;
  try {
    result = await BackendService.sendMessage({
      message: txt,
      userId,
      voiceEnabled,
      useClonedVoice,
      defaultVoice
    });
  } catch (err) {
    result = { success: false, data: null, error: err && err.message };
  }

  console.log(`[CHAT_RESPONSE] Backend response received:`, {
    success: result.success,
    has_reply: result.data && !!result.data.reply,
    reply_len: result.data && result.data.reply ? result.data.reply.length : 0,
    voice_job_id: result.data && result.data.voice_job_id,
    audio_url: result.data && result.data.audio_url,
    emotion: result.data && result.data.emotion,
    error: result.error
  });

  if (!result.success || !result.data) {
    removeTyping();
    handleBackendFailure(txt, result.error);
    return;
  }

  const reply = result.data.reply;
  const emotion = result.data.emotion;
  const timestamp = result.data.timestamp || null;
  const voiceJobId = result.data.voice_job_id || null;
  const immediateAudioUrl = result.data.audio_url || null;

  console.log(`[CHAT_EXTRACTED_VALUES] From backend response:`, {
    reply_len: reply ? reply.length : '(empty)',
    emotion,
    timestamp,
    voiceJobId,
    immediateAudioUrl
  });
  
  // Defensive check: ensure voiceJobId is actually a string
  if (voiceJobId && typeof voiceJobId !== 'string') {
    console.warn(`[CHAT_WARNING] voiceJobId is not a string! Type:`, typeof voiceJobId, `Value:`, voiceJobId);
  }

  console.log(`[CHAT_FLOWDECIDE] Deciding flow:`, {
    voiceEnabled,
    has_voiceJobId: !!voiceJobId,
    immediateAudioUrl
  });

  // Case A: voice wasn't requested for this message at all -- render now,
  // there is nothing to wait on.
  if (!voiceEnabled || !voiceJobId) {
    console.log(`[CHAT_CASE_A] Voice not enabled or no job ID, rendering immediately`);
    renderAssistantResponse({ text: reply, audioUrl: null, emotion, timestamp });
    finalizeAssistantTurn(txt, reply, emotion);
    return;
  }

  // Case B: backend already returned audio synchronously (shouldn't happen
  // given the background-job contract, but handled for completeness).
  if (immediateAudioUrl) {
    console.log(`[CHAT_CASE_B] Immediate audioUrl received, rendering immediately`);
    renderAssistantResponse({ text: reply, audioUrl: immediateAudioUrl, emotion, timestamp });
    finalizeAssistantTurn(txt, reply, emotion);
    return;
  }

  // Case C: voice is generating in the background -- keep the loader up
  // and poll until it resolves. renderAssistantResponse() is called from
  // exactly one of the three callbacks below, and only once.
  showTyping("⏳ Generating voice...");

  console.log(`[CHAT_VOICE_POLL] Starting voice poll for voiceJobId=${voiceJobId}`);
  console.log(`  → reply_length=${reply ? reply.length : 0}`);
  console.log(`  → emotion=${emotion}`);

  _activeVoicePollCancel = BackendService.pollVoiceStatus(voiceJobId, {
    intervalMs: 2000,
    timeoutMs: 180000, // 3 minutes
    onCompleted: (statusResult) => {
      console.log(`[CHAT_CALLBACK_COMPLETED] onCompleted fired with statusResult:`, statusResult);
      console.log(`  → Will call renderAssistantResponse with audioUrl=${statusResult.audio_url}`);
      _activeVoicePollCancel = null;
      try {
        renderAssistantResponse({ text: reply, audioUrl: statusResult.audio_url, emotion, timestamp });
        console.log(`[CHAT_RENDER_DONE] renderAssistantResponse completed`);
        finalizeAssistantTurn(txt, reply, emotion);
      } catch (err) {
        console.error(`[CHAT_RENDER_ERROR] renderAssistantResponse threw error:`, err);
        removeTyping();
        appendMsg('ai', '⚠️ There was a technical issue displaying your response, but I heard you and will remember our conversation.');
      }
    },
    onFailed: () => {
      console.warn('[CHAT_CALLBACK_FAILED] Voice generation failed or job not found -- rendering text only.');
      _activeVoicePollCancel = null;
      try {
        renderAssistantResponse({ text: reply, audioUrl: null, emotion, timestamp });
        finalizeAssistantTurn(txt, reply, emotion);
      } catch (err) {
        console.error(`[CHAT_RENDER_ERROR] renderAssistantResponse threw error:`, err);
        removeTyping();
        appendMsg('ai', reply);
      }
    },
    onTimeout: () => {
      console.warn('[CHAT_CALLBACK_TIMEOUT] Voice status polling timed out -- rendering text only.');
      _activeVoicePollCancel = null;
      try {
        renderAssistantResponse({ text: reply, audioUrl: null, emotion, timestamp });
        finalizeAssistantTurn(txt, reply, emotion);
      } catch (err) {
        console.error(`[CHAT_RENDER_ERROR] renderAssistantResponse threw error:`, err);
        removeTyping();
        appendMsg('ai', reply);
      }
    }
    // onProcessing intentionally omitted -- the typing indicator is
    // already visible and needs no per-tick update.
  });
}

/**
 * Runs once, right after the single renderAssistantResponse() call for a
 * given turn: follow-up message, history save, breathing-exercise nudge.
 * Centralized here so these side effects can never fire more than once,
 * and never fire before the assistant bubble itself is rendered.
 */
function finalizeAssistantTurn(userText, reply, emotion) {
  try {
    const followUp = generateFollowUp(reply, emotion);
    if (followUp) appendMsg('ai', followUp);
  } catch (e) {
    console.warn('Follow-up generation failed', e);
  }

  saveChatToHistory(userText, reply, emotion);

  try {
    if (_shouldRecommendBreathing(userText, emotion)) {
      _renderBreathingRecommendation();
    }
  } catch (e) {
    console.warn('Breathing recommendation error', e);
  }
}

function _shouldRecommendBreathing(text, emotion) {
  const normalized = (text || '').toLowerCase();
  const triggerPattern = /\b(stress|stressed|anxiety|anxious|panic|panic attack|can't breathe|cannot breathe|cannot breath|breathing|overwhelmed|pressure|fear|terrified|nervous|worried|shaking|restless|scared|panic\w*)\b/i;

  if (triggerPattern.test(normalized)) {
    return true;
  }

  const emotionText = String(emotion || '').toLowerCase();
  if (emotionText && /anx|stress|fear|panic/i.test(emotionText)) {
    return true;
  }

  return false;
}

function _renderBreathingRecommendation() {
  const message = '💙 You seem stressed. A breathing exercise may help you relax.';
  appendMsg('ai', message);
  if (typeof appendMsgHtml === 'function') {
    appendMsgHtml('ai', '<div style="margin-top:10px;margin-bottom:10px"><button class="chat-action-btn" onclick="startBreathingFromChat()">Start Breathing Exercise</button></div>');
  }
}

/**
 * Backend request failed outright (network/timeout/500/etc). Falls back
 * to the offline knowledge base, then to a generic apology. Neither path
 * involves voice, so there's nothing to poll or wait on.
 */
function handleBackendFailure(txt, errorMessage) {
  console.log('Chatoffline: Backend failed - falling back to offline KB:', errorMessage);

  const kbResult = window.OfflineKB ? window.OfflineKB.getOfflineResponse(txt) : null;

  if (kbResult && kbResult.response) {
    appendMsg('ai', kbResult.response);

    if (kbResult.matched && kbResult.coping_steps && kbResult.coping_steps.length) {
      appendMsg('ai', '💡 A few things that might help: ' + kbResult.coping_steps.slice(0, 3).join(' · '));
    }

    if (_shouldRecommendBreathing(txt, null) || kbResult.category === 'Anxiety') {
      if (typeof appendMsgHtml === 'function') {
        appendMsgHtml('ai', '<div style="margin-bottom:10px">💙 I hear anxiety in what you shared. A breathing exercise may help calm your body and mind.</div><button class="chat-action-btn" onclick="startBreathingFromChat()">Start Breathing Exercise</button>');
      } else {
        appendMsg('ai', '💙 I hear anxiety in what you shared. A breathing exercise may help calm your body and mind.');
      }
    }

    saveChatToHistory(txt, kbResult.response, 'offline');
  } else {
    const apologyMessage = "I'm sorry, I'm currently unable to answer that. Could you try asking differently?";
    appendMsg('ai', apologyMessage);
    saveChatToHistory(txt, apologyMessage, 'error');
  }
}

/**
 * One-time setup: hooks the Send button and Enter key to the integrated
 * sender. This is the only place sendBtn's click handler is assigned --
 * UI.html no longer has a competing inline onclick.
 */
function initChatOffline() {
  if (window.__thunaiChatOfflineInitialized) return;
  window.__thunaiChatOfflineInitialized = true;

  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) sendBtn.onclick = chatSendMsgOffline;

  const tf = document.getElementById('chatTf');
  if (tf) {
    tf.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatSendMsgOffline();
      }
    });
  }

  // suggestion chips reuse useSug() -> sendMsg(); point that at the same sender.
  window.sendMsg = chatSendMsgOffline;
}

/**
 * Generates a short conversational follow-up based on the reply text and
 * detected emotion. Returns null when no follow-up is appropriate.
 */
function generateFollowUp(replyText, emotion) {
  if (!replyText || replyText.length < 10) return null;

  const safeFollowUps = [
    "Would you like to tell me more about what's on your mind?",
    "Would you like some suggestions that might help?",
    "Would you like to talk more about what's making you feel this way?",
    "I'm here with you. Would you like to share more?",
    "That sounds difficult. Would you like some ideas that might help?"
  ];

  const anxiousFollowUps = [
    "Would you like to try a short breathing exercise to help calm your body?",
    "A quick grounding exercise might help — would you like to try it?",
    "Would you like some steps to help manage this feeling right now?"
  ];

  if (/[?！?]$/.test(replyText.trim())) return null;

  if (emotion && /anx|fear|panic/i.test(emotion)) {
    return anxiousFollowUps[Math.floor(Math.random() * anxiousFollowUps.length)];
  }

  if (Math.random() < 0.35) return null;

  return safeFollowUps[Math.floor(Math.random() * safeFollowUps.length)];
}

/**
 * Saves a conversation turn to localStorage (history/analytics). Keeps
 * at most 100 exchanges.
 */
function saveChatToHistory(userMessage, aiReply, emotion = 'neutral') {
  try {
    const nowIso = new Date().toISOString();
    let history = _loadChatHistory();
    const lastTurn = history.length > 0 ? history[history.length - 1] : null;

    if (lastTurn && lastTurn.status === 'pending' && lastTurn.userMessage === userMessage) {
      lastTurn.aiReply = aiReply || '';
      lastTurn.emotion = emotion || lastTurn.emotion || 'neutral';
      lastTurn.status = aiReply ? 'complete' : 'pending';
      lastTurn.updatedAt = nowIso;
      if (!lastTurn.timestamp) lastTurn.timestamp = nowIso;
    } else {
      history.push({
        id: `${nowIso}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: nowIso,
        updatedAt: nowIso,
        userMessage,
        aiReply: aiReply || '',
        emotion: emotion || 'neutral',
        status: aiReply ? 'complete' : 'pending'
      });
    }

    if (history.length > 100) {
      history = history.slice(-100);
    }

    _saveChatHistory(history);
    _syncChatHistoryView();

    if (window.InsightsAnalytics) {
      const settings = typeof loadUserSettings === 'function' ? loadUserSettings() : {};
      const uId = settings.username || 'default_user';
      window.InsightsAnalytics.invalidateCache(uId);
    }
  } catch (e) {
    console.warn('Could not save chat to history', e);
  }
}

document.addEventListener('DOMContentLoaded', initChatOffline);