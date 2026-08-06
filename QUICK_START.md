# ThunAI Backend Integration - Quick Start Guide

## Prerequisites

✅ FastAPI backend running on `http://127.0.0.1:8000`
✅ Frontend files (UI/ folder) with all existing features
✅ Modern web browser with localStorage support

## Setup Steps

### 1. Ensure Backend is Running

```bash
cd backend/
uvicorn main:app --reload
```

Expected output:
```
Uvicorn running on http://127.0.0.1:8000
```

Check health endpoint:
```
curl http://127.0.0.1:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "app_name": "ThunAI",
  "version": "2.0.0",
  "environment": "development"
}
```

### 2. Open Frontend in Browser

```
file:///path/to/UI/UI.html
```

Or use a local server (recommended to avoid CORS issues):
```bash
cd UI/
python -m http.server 8080
```

Then navigate to: `http://localhost:8080/UI.html`

### 3. Verify Integration

1. **Check Browser Console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Should see no errors about missing BackendService

2. **Test First Message:**
   - Type: "Hello"
   - Send message
   - Should see:
     - User message appears immediately
     - Typing animation shows
     - AI response appears after ~3-5 seconds
     - Emotion badge updates
     - Audio plays (if voiceEnabled is on)

3. **Check Network:**
   - Open Network tab in DevTools
   - Send a message
   - Should see POST request to `/chat`
   - Response should contain: reply, emotion, confidence, audio_url

## Testing Scenarios

### ✅ Test 1: Backend Success Path

**Setup:**
- Backend is running
- Voice is enabled in settings

**Test:**
1. Open settings, ensure "Voice Responses" is ON
2. Send message: "I'm feeling happy"
3. Expected: AI response with audio playback

**Verify:**
- Response appears quickly
- Emotion badge shows an emotion
- Audio plays (if volume > 0)
- Console shows: `BackendService: Message sent successfully`

---

### ✅ Test 2: Offline Fallback Path

**Setup:**
- Stop the backend server (`Ctrl+C`)
- Frontend still open

**Test:**
1. Send message: "I need help with stress"
2. Expected: Offline KB response, no error shown

**Verify:**
- Message still gets a response
- Response comes from offline database (UI_Knowledge_base.json)
- Console shows: `Backend unavailable, using offline knowledge base`
- No error messages shown to user

**Restore:**
```bash
# Restart backend
uvicorn main:app --reload
```

Then test that backend works again.

---

### ✅ Test 3: Crisis Detection (Highest Priority)

**Setup:**
- Both backend and offline KB available
- Backend is running

**Test:**
1. Send message: "I want to hurt myself"
2. Expected: Immediate crisis response, NO backend call

**Verify:**
- Crisis response appears immediately
- Red "Get Help Now" banner shows
- Auto-navigation to Self Care page
- Network tab shows NO POST request to /chat
- Console shows crisis detection triggered

---

### ✅ Test 4: Voice Settings Respected

**Setup:**
- Voice is disabled in settings

**Test:**
1. Go to Settings → Voice Settings
2. Toggle "Voice Responses" OFF
3. Send message: "Hello"
4. Expected: No audio plays

**Verify:**
- Response appears
- No audio loading/playing
- `voiceEnabled=false` sent in POST request
- Network tab shows `"voice_enabled": false`

---

### ✅ Test 5: Emotion Detection Display

**Setup:**
- Backend is running
- Chat page open

**Test:**
1. Send different messages:
   - "I'm so happy!" → emotion badge shows happy
   - "I'm really sad" → emotion badge shows sad
   - "I feel anxious" → emotion badge shows anxious

**Verify:**
- Emotion pill (blue box showing emotion emoji) updates
- Each response shows correct emotion
- Emotion comes from backend response

---

### ✅ Test 6: Conversation History Saved

**Setup:**
- Send 2-3 messages
- Open DevTools Storage tab

**Test:**
1. Open DevTools → Application → LocalStorage
2. Look for `thunai_chat_history` key
3. View its value

**Verify:**
```json
[
  {
    "timestamp": "...",
    "userMessage": "...",
    "aiReply": "...",
    "emotion": "..."
  },
  // ... more entries
]
```

---

### ✅ Test 7: Request Timeout (Network Slow Simulation)

**Setup:**
- Chrome DevTools open
- Network tab active

**Test:**
1. Throttle network to "Slow 3G" in DevTools
2. Send a message that would normally take >30 seconds
3. Expected: Falls back to offline KB after ~30 seconds

**Verify:**
- No error shown
- Offline KB response appears
- Console shows timeout error
- Network tab shows request took 30+ seconds

---

### ✅ Test 8: Suggestion Chips Work

**Setup:**
- Chat page open
- Backend running

**Test:**
1. Click on a suggestion chip (e.g., "I'd like to talk more")
2. Expected: Message sent and processed normally

**Verify:**
- Selected suggestion appears as user message
- Backend AI response appears
- Flow is same as typing manually

---

## Browser DevTools Debugging

### Console Logging

All major events are logged:

```javascript
// Open console and filter by "BackendService:"
BackendService: Message sent successfully                    // ✅ Success
BackendService: Request timeout (30000ms)                    // ⏱️  Timeout
BackendService: Network error                                // ❌ Network down
BackendService: Invalid response structure                   // ❌ Bad response
BackendService: Health check failed                          // ⚠️  Backend down
BackendService: Audio playback started                       // 🔊 Audio playing
BackendService: Audio playback failed                        // 🔇 Audio failed
Backend unavailable, using offline knowledge base            // ⚠️  Using fallback
```

### Network Tab Analysis

**Successful request:**
```
POST /chat
Status: 200
Size: 1.2 KB
Time: 2.3s

Response Preview:
{
  "reply": "I hear you're feeling...",
  "emotion": "anxious",
  "confidence": 0.92,
  "audio_url": "http://...",
  "self_care_suggestion": "..."
}
```

**Failed request (will fallback gracefully):**
```
POST /chat
Status: 500 or Network Error
Time: 30s (timeout) or variable

⚠️ User sees offline KB response (no error shown)
```

### Storage Tab Analysis

**User Settings:**
```
LocalStorage → thunai_user_settings
{
  "username": "User",
  "voiceEnabled": true,
  "voiceMode": "default",
  "defaultVoice": "female",
  "volume": 0.8,
  ...
}
```

**Chat History:**
```
LocalStorage → thunai_chat_history
[
  {
    "timestamp": "2026-08-03T10:30:00Z",
    "userMessage": "Hello",
    "aiReply": "Hi! How can I help?",
    "emotion": "neutral"
  },
  ...
]
```

## Common Issues & Solutions

### Issue 1: "Blocked by CORS Policy"

**Symptom:**
```
Access to XMLHttpRequest at 'http://127.0.0.1:8000/chat' 
from origin 'file://...' has been blocked by CORS policy
```

**Solution:**
- Setup frontend on a proper web server:
  ```bash
  python -m http.server 8080
  ```
  Then access at `http://localhost:8080/UI.html`

- OR check if backend has CORS enabled:
  ```python
  # In main.py
  app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development only
    allow_methods=["*"],
    allow_headers=["*"],
  )
  ```

### Issue 2: "Failed to fetch - Network unreachable"

**Symptom:**
```
BackendService: Network error: Failed to fetch
```

**Solution:**
1. Verify backend is running:
   ```bash
   curl http://127.0.0.1:8000/health
   ```

2. Check if port 8000 is correct in BackendService.js:
   ```javascript
   API_BASE: 'http://127.0.0.1:8000'
   ```

3. Firewall may be blocking - try stopping it temporarily

### Issue 3: "No audio playing"

**Symptom:**
- Message shows but no sound
- Settings shows voiceEnabled = true

**Solution:**
1. Check volume in settings (must be > 0)
2. Check browser volume (unmute)
3. Check browser autoplay policy:
   - Chrome: Click URL bar → Site settings → Sound → Allow
   - Firefox: Privacy & Security → Permissions → Autoplay → Allow Audio

4. Verify audio_url is returned:
   ```javascript
   // In console after sending message
   localStorage['thunai_chat_history']
   // Last entry should have audio_url in the backend response
   ```

### Issue 4: "Offline KB not working"

**Symptom:**
- Backend fails but gets apology message instead of KB response

**Solution:**
1. Verify offlineKnowledgeBase.js is loaded:
   ```javascript
   // In console
   typeof window.OfflineKB  // Should be 'object'
   ```

2. Check if UI_Knowledge_base.json is in UI/ folder

3. Verify KB is properly initialized:
   ```javascript
   window.OfflineKB.getOfflineResponse("hello")
   ```

## Performance Baseline

On a normal connection, expected timings:

| Action | Time | Notes |
|--------|------|-------|
| User types & sends | Instant | UI updates immediately |
| Show typing animation | 1.2s-1.7s | Random delay for realism |
| Backend processes | 2-5s | LLM inference time |
| Audio plays | Auto | Starts after response |
| **Total user perception** | ~4-6s | Feels responsive |

If taking longer than 10s, backend might be slow or timing out.

## Production Checklist

Before deploying to production:

- [ ] Update `API_BASE` in BackendService.js to production URL
- [ ] Configure CORS properly in backend (allow frontend origin only)
- [ ] Set `REQUEST_TIMEOUT` appropriately for your LLM
- [ ] Disable console.log statements in BackendService.js (optional)
- [ ] Test on target devices (mobile, browsers)
- [ ] Verify offline KB works as fallback
- [ ] Monitor localStorage usage (chat history grows)
- [ ] Setup error logging/monitoring

## Support

For detailed architecture and implementation details, see: [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)

For backend API documentation, visit: `http://127.0.0.1:8000/docs` (Swagger UI)

---

**Status:** ✅ Ready for testing and deployment

Start with **Test 1** to verify everything works, then run through the other scenarios.
