/**
 * ═══════════════════════════════════════════════════════════
 * BackendService.js
 *
 * Service layer for FastAPI backend communication.
 *
 * Responsibilities:
 * - Send chat requests to /chat endpoint
 * - Poll /voice/status for background voice generation jobs
 * - Parse responses
 * - Handle errors gracefully
 * - Return structured data to UI layer
 * - Never throw errors; always return {success, data, error}
 *
 * Backend contract (unchanged):
 *   POST /chat        -> { reply, emotion, confidence, audio_url, voice_job_id, timestamp, self_care_suggestion }
 *   GET  /voice/status -> { status: "processing"|"completed"|"failed"|"not_found", audio_url: string|null }
 * ═══════════════════════════════════════════════════════════
 */

const BackendService = {
  // Configuration
  API_BASE: window.getApiBase(),
  CHAT_ENDPOINT: '/chat',
  HEALTH_ENDPOINT: '/health',
  VOICE_STATUS_ENDPOINT: '/voice/status',
  REQUEST_TIMEOUT: 30000,        // 30s per /chat request
  VOICE_STATUS_TIMEOUT: 10000,   // 10s per individual /voice/status poll tick

  /**
   * Sends a message to the backend AI.
   *
   * @param {Object} options
   * @param {string} options.message
   * @param {string} [options.userId]
   * @param {boolean} [options.voiceEnabled]
   * @param {boolean} [options.useClonedVoice]
   * @param {string} [options.defaultVoice]
   *
   * @returns {Promise<{success:boolean, data:Object|null, error:string|null}>}
   */
  async sendMessage(options = {}) {
    const {
      message,
      userId = 'default_user',
      voiceEnabled = false,
      useClonedVoice = false,
      defaultVoice = 'female'
    } = options;

    if (!message || !message.trim()) {
      return { success: false, data: null, error: 'Message cannot be empty' };
    }

    const requestBody = {
      message: message.trim(),
      user_id: userId,
      voice_enabled: Boolean(voiceEnabled),
      use_cloned_voice: Boolean(useClonedVoice),
      default_voice: String(defaultVoice).toLowerCase()
    };

    console.log('BackendService: Sending request to /chat', {
      message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
      userId,
      voiceEnabled
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

      const response = await fetch(`${this.API_BASE}${this.CHAT_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorBody = await response.json();
          if (errorBody.detail) errorDetail = errorBody.detail;
        } catch (_) { /* ignore parse errors, use statusText */ }

        console.error(`BackendService: HTTP error ${response.status}`, errorDetail);
        return { success: false, data: null, error: `Backend returned error: ${errorDetail}` };
      }

      const responseData = await response.json();

      console.log('BackendService: Response received from backend', {
        reply: responseData.reply ? responseData.reply.substring(0, 50) + '...' : '(empty)',
        emotion: responseData.emotion,
        voiceJobId: responseData.voice_job_id || '(none)',
        audioUrl: responseData.audio_url ? 'present' : 'none'
      });

      if (!responseData.reply || typeof responseData.reply !== 'string') {
        console.error('BackendService: Invalid response structure - missing reply field', responseData);
        return { success: false, data: null, error: 'Invalid response from backend: missing reply field' };
      }

      return { success: true, data: responseData, error: null };

    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: false, data: null, error: 'Request timeout: backend did not respond in time' };
      }
      if (err instanceof TypeError && err.message.includes('fetch')) {
        return { success: false, data: null, error: 'Network error: unable to reach backend' };
      }
      console.error('BackendService: Unexpected error', err);
      return { success: false, data: null, error: `Unexpected error: ${err.message}` };
    }
  },

  /**
   * Upload a voice sample to be used as the user's XTTS cloning reference.
   *
   * @param {Object} options
   * @param {string} [options.userId]
   * @param {File} options.file
   * @returns {Promise<{success:boolean, data:Object|null, error:string|null}>}
   */
  async uploadVoice(options = {}) {
    const {
      userId = 'default_user',
      file
    } = options;

    if (!file) {
      return { success: false, data: null, error: 'No file selected for upload' };
    }

    const formData = new FormData();
    formData.append('user_id', String(userId).trim() || 'default_user');
    formData.append('voice_file', file, file.name || 'voice_sample');

    try {
      const response = await fetch(`${this.API_BASE}/upload-voice`, {
        method: 'POST',
        body: formData
      });

      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = responseData && responseData.detail ? responseData.detail : `HTTP ${response.status}`;
        return { success: false, data: null, error: detail };
      }

      return { success: true, data: responseData, error: null };
    } catch (err) {
      console.error('BackendService: uploadVoice error', err);
      return { success: false, data: null, error: err && err.message ? err.message : 'Unknown upload error' };
    }
  },

  /**
   * Health check.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.API_BASE}${this.HEALTH_ENDPOINT}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (err) {
      console.log('BackendService: Health check failed', err.message);
      return false;
    }
  },

  /**
   * Single voice-status check (one HTTP call, no polling).
   * @param {string} jobId
   * @returns {Promise<{status:string, audio_url:string|null}>}
   */
  async getVoiceStatus(jobId) {
    try {
      if (!jobId) return { status: 'not_found', audio_url: null };

      const url = `${this.API_BASE}${this.VOICE_STATUS_ENDPOINT}?job_id=${encodeURIComponent(jobId)}`;
      console.log(`[VOICE_STATUS_REQUEST] Polling for job_id=${jobId} at ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.VOICE_STATUS_TIMEOUT);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.error(`[VOICE_STATUS_ERROR] HTTP ${res.status} for job_id=${jobId}`);
        return { status: 'error', audio_url: null };
      }
      
      const data = await res.json();
      console.log(`[VOICE_STATUS_RESPONSE] job_id=${jobId} status=${data.status} audio_url=${data.audio_url}`);
      
      return { status: data.status, audio_url: data.audio_url || null };
    } catch (err) {
      console.error('BackendService: getVoiceStatus error', err);
      return { status: 'error', audio_url: null };
    }
  },

  /**
   * THE single polling loop for a background voice job. Starts an
   * interval that checks /voice/status every `intervalMs`, and
   * guarantees exactly one of onCompleted / onFailed / onTimeout fires
   * exactly once, after which the interval is always cleared.
   *
   * Returns a `cancel()` function -- call it to stop this specific poll
   * early (e.g. the user sent a new message). Callers should keep track
   * of the returned canceller and call it before starting a new poll,
   * so at most one polling loop is ever active at a time.
   *
   * @param {string} jobId
   * @param {Object} callbacks
   * @param {number} [callbacks.intervalMs=2000]
   * @param {number} [callbacks.timeoutMs=180000] - 3 minutes
   * @param {(status:{status:string, audio_url:string|null}) => void} [callbacks.onProcessing]
   * @param {(status:{status:string, audio_url:string|null}) => void} [callbacks.onCompleted]
   * @param {(status:{status:string, audio_url:string|null}) => void} [callbacks.onFailed]
   * @param {() => void} [callbacks.onTimeout]
   * @returns {() => void} cancel
   */
  pollVoiceStatus(jobId, callbacks = {}) {
    const {
      intervalMs = 2000,
      timeoutMs = 180000,
      onProcessing,
      onCompleted,
      onFailed,
      onTimeout
    } = callbacks;

    console.log(`[VOICE_POLL_START] Starting poll for job_id=${jobId}, intervalMs=${intervalMs}, timeoutMs=${timeoutMs}`);
    console.log(`  → onCompleted=${typeof onCompleted}, onFailed=${typeof onFailed}, onTimeout=${typeof onTimeout}`);

    let stopped = false;
    let intervalHandle = null;
    let timeoutHandle = null;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (intervalHandle) clearInterval(intervalHandle);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      console.log(`[VOICE_POLL_STOP] Stopped polling for job_id=${jobId}`);
    };

    if (!jobId) {
      console.warn(`[VOICE_POLL_WARNING] jobId is empty/falsy: ${jobId}`);
      // Nothing to poll -- report failure on the next tick so callers can
      // treat this uniformly with an async result rather than a thrown error.
      setTimeout(() => {
        if (!stopped && onFailed) onFailed({ status: 'not_found', audio_url: null });
        stop();
      }, 0);
      return stop;
    }

    const tick = async () => {
      try {
        if (stopped) return;
        console.log(`[VOICE_POLL_TICK_START] Polling job_id=${jobId}`);
        
        const result = await this.getVoiceStatus(jobId);
        if (stopped) {
          console.log(`[VOICE_POLL_CANCELLED] Poll was cancelled while fetching status for job_id=${jobId}`);
          return;
        }

        console.log(`[VOICE_POLL_TICK] job_id=${jobId} status=${result.status} audio_url=${result.audio_url} stopped=${stopped}`);
        
        // Log the exact condition checks
        const isCompleted = result.status === 'completed';
        const hasAudioUrl = !!result.audio_url;
        console.log(`  → isCompleted=(${isCompleted}), hasAudioUrl=(${hasAudioUrl}), both=(${isCompleted && hasAudioUrl})`);

        if (result.status === 'completed' && result.audio_url) {
          console.log(`[VOICE_POLL_SUCCESS] Calling onCompleted for job_id=${jobId}, audio_url=${result.audio_url}`);
          stop();
          if (onCompleted) {
            console.log(`[VOICE_POLL_CALLBACK] Invoking onCompleted callback`);
            onCompleted(result);
          } else {
            console.warn(`[VOICE_POLL_WARNING] onCompleted callback not provided!`);
          }
        } else if (result.status === 'failed' || result.status === 'not_found' || result.status === 'error') {
          console.log(`[VOICE_POLL_FAILED] job_id=${jobId} status=${result.status}, calling onFailed`);
          stop();
          if (onFailed) {
            console.log(`[VOICE_POLL_CALLBACK] Invoking onFailed callback`);
            onFailed(result);
          } else {
            console.warn(`[VOICE_POLL_WARNING] onFailed callback not provided!`);
          }
        } else {
          console.log(`[VOICE_POLL_PROCESSING] Still processing, status=${result.status}`);
          if (onProcessing) onProcessing(result);
        }
      } catch (tickErr) {
        console.error(`[VOICE_POLL_TICK_ERROR] Exception in tick for job_id=${jobId}:`, tickErr);
        stop();
        if (onFailed) {
          console.log(`[VOICE_POLL_ERROR_CALLBACK] Invoking onFailed due to tick error`);
          onFailed({ status: 'error', audio_url: null });
        }
      }
    };

    intervalHandle = setInterval(tick, intervalMs);
    console.log(`[VOICE_POLL_INTERVAL] Interval started for job_id=${jobId} every ${intervalMs}ms, intervalHandle=${intervalHandle}`);
    
    timeoutHandle = setTimeout(() => {
      if (stopped) return;
      console.log(`[VOICE_POLL_TIMEOUT_FIRED] Timeout fired after ${timeoutMs}ms for job_id=${jobId}`);
      stop();
      if (onTimeout) {
        console.log(`[VOICE_POLL_TIMEOUT_CALLBACK] Calling onTimeout for job_id=${jobId}`);
        onTimeout();
      } else {
        console.warn(`[VOICE_POLL_WARNING] onTimeout callback not provided!`);
      }
    }, timeoutMs);
    console.log(`[VOICE_POLL_TIMEOUT] Timeout handler set for job_id=${jobId} in ${timeoutMs}ms, timeoutHandle=${timeoutHandle}`);

    // Fire an immediate first check instead of waiting a full interval.
    console.log(`[VOICE_POLL_IMMEDIATE] Calling tick immediately for job_id=${jobId}`);
    tick();

    return stop;
  },

  /**
   * Plays audio from a URL. Kept mainly as an explicit-trigger fallback
   * for browsers that block the <audio autoplay> attribute; the primary
   * playback path is the autoplay attribute set in renderAssistantResponse.
   *
   * @param {string} audioUrl
   * @param {number} [volume=0.8]
   * @returns {Promise<boolean>}
   */
  async playAudio(audioUrl, volume = 0.8) {
    if (!audioUrl) return false;

    try {
      const fullUrl = audioUrl.startsWith('http')
        ? audioUrl
        : `${this.API_BASE}${audioUrl.startsWith('/') ? '' : '/'}${audioUrl}`;
      const audio = new Audio(fullUrl);
      audio.volume = Math.max(0, Math.min(1, volume));

      try {
        await audio.play();
        return true;
      } catch (err) {
        console.error('BackendService: Audio playback failed (autoplay restrictions or load error)', err);
        return false;
      }
    } catch (err) {
      console.error('BackendService: Error playing audio', err);
      return false;
    }
  }
};

window.BackendService = BackendService;