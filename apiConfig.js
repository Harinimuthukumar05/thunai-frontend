/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRALIZED BACKEND API CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file provides a single point of configuration for all backend API calls.
 * The entire frontend automatically switches environments by changing ONE value.
 *
 * HOW TO SWITCH ENVIRONMENTS:
 * ───────────────────────────────────────────────────────────────────────────
 *
 * LOCAL DEVELOPMENT (default):
 *   const API_BASE_URL = 'http://127.0.0.1:8000';
 *   - FastAPI backend running on your local machine
 *   - Port: 8000
 *
 * CLOUDFLARE TUNNEL (production/remote):
 *   const API_BASE_URL = 'https://your-tunnel-name.trycloudflare.com';
 *   - Replace 'your-tunnel-name' with your actual tunnel subdomain
 *   - Example: 'https://realized-faculty-rights-divine.trycloudflare.com'
 *
 * NGROK (testing):
 *   const API_BASE_URL = 'https://your-ngrok-url.ngrok.io';
 *   - Replace 'your-ngrok-url' with your actual ngrok tunnel URL
 *
 * CUSTOM/OTHER:
 *   const API_BASE_URL = 'https://your-backend-url.com';
 *   - Replace with any other backend URL (no trailing slash)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPORTANT NOTES:
 * - Do NOT include a trailing slash (/) at the end
 * - Change ONLY this value; all other code is automatic
 * - All frontend API requests use window.getApiBase() to fetch this value
 * - No other files need to be modified when switching environments
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ↓ CHANGE THIS VALUE TO SWITCH ENVIRONMENTS ↓
const API_BASE_URL = 'https://outstanding-handling-pleased-subaru.trycloudflare.com';
// ↑ CHANGE THIS VALUE TO SWITCH ENVIRONMENTS ↑

// Expose to global window scope for all frontend modules
window.API_BASE_URL = API_BASE_URL;

/**
 * Central method to retrieve the configured backend API base URL.
 * Used by all frontend services: BackendService, JournalStorage, InsightsAnalytics, settings, etc.
 *
 * @returns {string} Backend API base URL (e.g., 'http://127.0.0.1:8000')
 */
window.getApiBase = function() {
  return window.API_BASE_URL || 'https://outstanding-handling-pleased-subaru.trycloudflare.com';
}

