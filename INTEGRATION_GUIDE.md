# ThunAI Frontend-Backend Integration Guide

## Overview

The frontend has been integrated with the FastAPI backend to enable:
- Real AI responses via the `/chat` endpoint
- Emotion detection from user messages
- Voice synthesis and audio playback
- Graceful fallback to offline knowledge base if backend is unavailable
- Seamless user experience with zero error messages

## Architecture

### Communication Flow

```
User Types Message
        ↓
  Frontend (UI.html)
        ↓
  chatSendMsgOffline() [Chatoffline.js]
        ↓
  Crisis Detection Check
        ├─ YES → Crisis Response → End
        └─ NO → Continue
        ↓
  BackendService.sendMessage()
        ↓
  POST /chat to FastAPI
        ↓
  Backend Response?
        ├─ SUCCESS → Display AI Reply + Play Audio (if enabled)
        │          → Save to History
        │          → End
        └─ FAILURE → Offline Knowledge Base Lookup
                    → Display Offline Response
                    → End
```

### New Files Created

#### 1. **BackendService.js**
Location: `UI/BackendService.js`

A service layer that encapsulates all backend communication logic.

**Key Methods:**

- `sendMessage(options)` - Sends a message to the backend
  - Parameters:
    - `message` (string) - The user's message
    - `userId` (string, optional) - User identifier (default: 'default_user')
    - `voiceEnabled` (boolean) - Enable audio synthesis
    - `useClonedVoice` (boolean) - Use cloned voice if available
    - `defaultVoice` (string) - 'female' or 'male'
  - Returns: `{success: boolean, data: object|null, error: string|null}`

- `playAudio(audioUrl, volume)` - Plays audio from a URL
  - Respects volume settings
  - Handles browser autoplay policies

- `isHealthy()` - Health check endpoint
  - Quick verification that backend is reachable

**Features:**
- 30-second request timeout
- Graceful error handling (never throws)
- Detailed error logging
- Network error detection
- JSON parsing validation

```javascript
// Example usage
const result = await BackendService.sendMessage({
  message: "I'm feeling stressed",
  userId: "user123",
  voiceEnabled: true,
  useClonedVoice: false,
  defaultVoice: "female"
});

if (result.success) {
  console.log("AI Reply:", result.data.reply);
  console.log("Emotion:", result.data.emotion);
}
```

## Modified Files

### 1. **Chatoffline.js** (MODIFIED)
Location: `UI/Chatoffline.js`

**Changes:**
- Converted `chatSendMsgOffline()` to async function
- Added backend integration before offline fallback
- Maintains crisis detection at highest priority
- Integrated audio playback from backend
- Added emotion display update
- Added conversation history saving

**New Processing Order:**
1. Crisis Detection (highest priority - always checked first)
2. Backend AI (attempted for all non-crisis messages)
3. Offline Knowledge Base (fallback if backend fails)
4. Apology message (last resort if KB has no answer)

**New Features:**
- `saveChatToHistory(userMessage, aiReply, emotion)` - Saves conversations to localStorage
  - Keeps last 100 exchanges
  - Tracks emotion/source of response

```javascript
// The new integrated sender
async function chatSendMsgOffline() {
  // 1. Get message and show immediately
  // 2. Check crisis detection
  // 3. Try backend API
  // 4. If backend fails, try offline KB
  // 5. Display response and play audio if enabled
}
```

### 2. **UI.html** (MODIFIED)
Location: `UI/UI.html`

**Changes:**
- Added script tag for BackendService.js before chatOffline.js
- Load order is now critical:
  ```
  dateUtils.js
  storage.js
  settings.js
  avatars.js
  emojiAnimation.js
  offlineKnowledgeBase.js
  crisisDetection.js
  journal.js
  BackendService.js         ← NEW (must be before chatOffline.js)
  chatOffline.js            ← Modified to use BackendService
  ```

### 3. **settings.js** (NO CHANGES NEEDED)
Location: `UI/settings.js`

The existing settings system already supports:
- `voiceEnabled` - Enable/disable voice responses
- `voiceMode` - 'default' or 'cloned'
- `defaultVoice` - 'female' or 'male'
- `volume` - Volume level (0-1)
- `clonedVoice` - Cloned voice metadata

These settings are automatically passed to the backend API.

## API Integration Details

### Backend Endpoint

**POST** `http://127.0.0.1:8000/chat`

**Request Body:**
```json
{
  "message": "I'm feeling stressed",
  "user_id": "user123",
  "voice_enabled": true,
  "use_cloned_voice": false,
  "default_voice": "female"
}
```

**Response Body:**
```json
{
  "reply": "I hear that you're feeling stressed...",
  "emotion": "anxious",
  "confidence": 0.92,
  "audio_url": "http://127.0.0.1:8000/audio/response_xyz.wav",
  "timestamp": "2026-08-03T10:30:00Z",
  "self_care_suggestion": "Take a few deep breaths to calm your nervous system."
}
```

### Error Handling

The integration handles these error scenarios gracefully:

| Scenario | Behavior |
|----------|----------|
| Network timeout | Falls back to offline KB |
| Backend HTTP error (4xx, 5xx) | Falls back to offline KB |
| Invalid response JSON | Falls back to offline KB |
| Missing `reply` field | Falls back to offline KB |
| Audio playback fails | Displays reply without audio |
| Offline KB has no match | Shows apology message |

**User Experience:**
- No error messages or alerts shown
- Seamless transition to offline mode
- Conversation flows naturally

## Audio Playback Flow

### When Audio is Played

1. **Check Prerequisites:**
   - Backend returns `audio_url` (not null)
   - `settings.voiceEnabled === true`
   - Browser allows autoplay

2. **Playback Process:**
   - Create native HTML5 `<audio>` element
   - Set volume from `settings.volume` (0-1)
   - Start playback asynchronously
   - Don't wait for completion (UI remains responsive)

3. **Voice Priority:**
   - If `settings.voiceMode === 'cloned'` AND user uploaded voice:
     - Backend clones with uploaded sample
     - Backend returns audio_url with cloned voice
   - Otherwise:
     - Backend uses `settings.defaultVoice` ('female' or 'male')
     - Backend returns audio_url with default voice

### Silent Failure
- If audio fails to load/play, the reply is still displayed
- No error is shown to user
- Voice playback issues never break the chat

## Conversation History

Conversations are automatically saved to localStorage at:
```
localStorage['thunai_chat_history']
```

**Storage Structure:**
```javascript
[
  {
    timestamp: "2026-08-03T10:30:00Z",
    userMessage: "I'm feeling stressed",
    aiReply: "I hear that you're feeling stressed...",
    emotion: "anxious"  // or 'offline' or 'error' if backend failed
  },
  // ... (up to 100 most recent exchanges)
]
```

**Retention:** Last 100 exchanges (auto-cleanup when limit exceeded)

## Configuration

### Backend URL
Edit the `API_BASE` in `BackendService.js` if backend runs on different host/port:

```javascript
const BackendService = {
  API_BASE: 'http://127.0.0.1:8000',  // ← Change here
  CHAT_ENDPOINT: '/chat',
  REQUEST_TIMEOUT: 30000,
  // ...
}
```

### Request Timeout
Change `REQUEST_TIMEOUT` if network is slow:
```javascript
REQUEST_TIMEOUT: 30000,  // milliseconds (30 seconds)
```

## Fallback Mechanism

### Offline Knowledge Base Lookup

When backend is unavailable, the system automatically uses `offlineKnowledgeBase.js`:

```javascript
// Inside chatSendMsgOffline(), when backend fails:
const kbResult = window.OfflineKB.getOfflineResponse(txt);
```

This returns responses from `UI_Knowledge_base.json` with:
- Semantic matching against user message
- Category classification
- Relevant coping steps when matched

### Last Resort Message

```
"I'm sorry, I'm currently unable to answer that. Could you try asking differently?"
```

This is shown only if:
1. Backend is unavailable
2. Offline KB has no match for the query

## Testing

### Test Backend Connection

Open browser console and run:
```javascript
const health = await BackendService.isHealthy();
console.log("Backend healthy:", health);
```

### Test API Call

```javascript
const result = await BackendService.sendMessage({
  message: "Hello",
  userId: "test_user",
  voiceEnabled: true,
  defaultVoice: "female"
});
console.log("Result:", result);
```

### Test Offline Fallback

Stop the backend server and send a message. The app should:
1. Show typing animation
2. Attempt backend (fail silently)
3. Retrieve response from offline KB
4. Display response as if it came from AI

## Browser DevTools Debugging

### Console Logs

BackendService logs all major events:
```
BackendService: Message sent successfully
BackendService: Request timeout (30000ms)
BackendService: Network error
BackendService: Invalid response structure
BackendService: Health check failed
BackendService: Audio playback started
BackendService: Audio playback failed
```

### Network Tab
- All requests to `POST /chat` appear under Network → Fetch/XHR
- Response preview shows the JSON structure

### Storage Tab
- Chat history saved at `localStorage['thunai_chat_history']`
- User settings saved at `localStorage['thunai_user_settings']`

## Troubleshooting

### "Backend is not responding"
1. Check if FastAPI server is running: `uvicorn main:app --reload`
2. Check if port 8000 is correct
3. Check browser console for CORS errors

### "Audio not playing"
1. Check if voiceEnabled is true in settings
2. Check browser autoplay policy (Chrome requires user interaction first)
3. Check if volume > 0 in settings

### "Offline KB not working"
1. Check if `offlineKnowledgeBase.js` is loaded
2. Check if `UI_Knowledge_base.json` exists
3. Check browser console for errors

## Performance Notes

### Request Timeout
- Default 30 seconds is reasonable for LLM inference
- If backend takes longer, user sees offline KB
- Adjust timeout in BackendService.js if needed

### Concurrent Requests
- Don't send multiple messages simultaneously
- Each `sendMessage()` call waits for completion
- System is designed for sequential chat flow (as UI enforces)

### Storage Limits
- Chat history limited to 100 entries
- Auto-cleanup older entries when limit exceeded
- Should use ~100-200KB localStorage max

## Future Enhancements

Possible improvements while maintaining current structure:

1. **Session Persistence**
   - Save session ID to backend
   - Retrieve conversation history from backend

2. **Production Deployment**
   - Update API_BASE to production server URL
   - Configure CORS properly in FastAPI
   - Add authentication headers if needed

3. **Offline Metrics**
   - Track when backend fails
   - Log fallback usage for diagnostics

4. **Enhanced Error Reporting**
   - Optional error reporting to backend
   - Privacy-preserving diagnostic logs

## Summary of Integration Points

| Component | Purpose | Location |
|-----------|---------|----------|
| BackendService.js | API communication layer | UI/BackendService.js |
| chatSendMsgOffline() | Message handler with fallback | UI/Chatoffline.js |
| saveChatToHistory() | Conversation storage | UI/Chatoffline.js |
| loadUserSettings() | Get voice/user settings | UI/settings.js (existing) |
| Emotion detection | Update emotion pill | UI/Chatoffline.js |
| Audio playback | Web Audio API | BackendService.js |
| Offline KB fallback | Local knowledge base | UI/offlineKnowledgeBase.js |
| Crisis detection | Safety layer | UI/crisisDetection.js |

---

**Integration Status:** ✅ Complete

All features integrated and tested. The frontend now communicates with the backend while maintaining a seamless offline experience.
