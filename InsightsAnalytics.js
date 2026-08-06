/* ═══════════════════════════════════════════════════════════
   InsightsAnalytics.js
   Dynamic analytics visualization engine for ThunAI.
   Fetches analytics combining journal history and ChromaDB chat
   emotions, renders Chart.js charts, and manages cache invalidation.
   ═══════════════════════════════════════════════════════════ */

const InsightsAnalytics = {
  _cache: {},
  _cacheExpiryMs: 15000, // 15s cache unless invalidated

  getApiBase() {
    return window.getApiBase();
  },

  /**
   * Invalidates the analytics cache for a specific user or all users.
   * Call when a new journal is saved/edited, a chat turn finishes, or profile changes.
   * @param {string} [userId]
   */
  invalidateCache(userId) {
    if (userId) {
      delete this._cache[userId];
    } else {
      this._cache = {};
    }
    console.log('InsightsAnalytics: Cache invalidated', userId || 'all');
  },

  /**
   * Fetches dynamic analytics from the backend API for a given User ID.
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async loadAnalytics(userId) {
    if (!userId || !userId.trim()) userId = 'User';
    userId = userId.trim();

    const cached = this._cache[userId];
    const now = Date.now();
    if (cached && (now - cached.timestamp < this._cacheExpiryMs)) {
      return cached.data;
    }

    try {
      const url = `${this.getApiBase()}/api/analytics/${encodeURIComponent(userId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this._cache[userId] = { data, timestamp: now };
        return data;
      }
    } catch (e) {
      console.warn('InsightsAnalytics: API request failed, generating client fallback', e);
    }

    // Fallback if backend API is unreachable
    return this._generateClientFallback(userId);
  },

  /**
   * Renders the Insights page with dynamic data (Hero, Wellness Score, AI Insight, 4 Charts).
   * @param {string} [userId]
   */
  async render(userId) {
    if (!userId) {
      try {
        if (typeof loadUserSettings === 'function') {
          const settings = loadUserSettings();
          userId = settings.username || 'User';
        }
      } catch (e) {}
    }
    if (!userId) userId = 'User';

    const analytics = await this.loadAnalytics(userId);
    if (!analytics) return;

    // 1. Update Hero Description & Wellness Score
    const scoreValEl = document.getElementById('wellnessScoreVal');
    if (scoreValEl) {
      scoreValEl.innerHTML = `${analytics.wellnessScore || 75}<span>/100</span>`;
    }

    const heroDescEl = document.getElementById('insightHeroDesc');
    if (heroDescEl && analytics.heroDescription) {
      heroDescEl.textContent = analytics.heroDescription;
    }

    const heroTitleEl = document.getElementById('insightHeroTitle');
    if (heroTitleEl && analytics.heroTitle) {
      heroTitleEl.textContent = analytics.heroTitle;
    }

    // 2. Update Dynamic AI Insight Text
    const aiInsightEl = document.getElementById('aiInsightText');
    if (aiInsightEl && analytics.aiInsightText) {
      aiInsightEl.textContent = analytics.aiInsightText;
    }

    // 3. Render Charts using mkChart (defined in UI.html)
    if (typeof window.mkChart !== 'function') {
      console.warn('InsightsAnalytics: mkChart function not found in window scope');
      return;
    }

    const tickColor = '#8FA49E';
    const gFont = { family: 'DM Sans', size: 11 };

    // Chart 1: Chat Emotion Analysis (Donut) — now derived entirely from journal emotions.
    if (analytics.chatEmotions) {
      const ce = analytics.chatEmotions;
      window.mkChart('chatEmoChart', 'doughnut', {
        labels: ce.labels || ['Positive', 'Neutral', 'Negative'],
        datasets: [{
          data: ce.data || [52, 30, 18],
          backgroundColor: ['#5E9E84', '#C6D9C8', '#E8A87C'],
          borderWidth: 0
        }]
      }, {
        plugins: { legend: { position: 'bottom', labels: { color: tickColor, font: gFont, boxWidth: 10 } } },
        cutout: '62%',
        scales: { x: { display: false }, y: { display: false } }
      });
    }

    // Chart 2: Weekly Mood Trend (Line)
    if (analytics.weeklyTrend) {
      const wt = analytics.weeklyTrend;
      window.mkChart('insWeekChart', 'line', {
        labels: wt.labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            label: 'This Week',
            data: wt.thisWeek || [65, 68, 72, 70, 80, 78, 79],
            borderColor: '#5E9E84',
            backgroundColor: 'rgba(94,158,132,.1)',
            fill: true,
            tension: .4,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#5E9E84'
          },
          {
            label: 'Last Week',
            data: wt.lastWeek || [60, 62, 65, 63, 68, 66, 70],
            borderColor: '#C6D9C8',
            backgroundColor: 'transparent',
            fill: false,
            tension: .4,
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 2
          }
        ]
      }, {});
    }

    // Chart 3: Journal Emotion Analysis (Bar)
    if (analytics.journalEmotions) {
      const je = analytics.journalEmotions;
      const barColors = ['#5E9E84', '#A9C7B7', '#F4E8B2', '#9b8ee8', '#88B79A', '#E8A87C', '#DDA0DD'];
      window.mkChart('jEmoChart', 'bar', {
        labels: je.labels || ['Calm', 'Happy', 'Anxious', 'Sad', 'Tired'],
        datasets: [{
          label: 'Frequency',
          data: je.data || [0, 0, 0, 0, 0],
          backgroundColor: barColors.slice(0, (je.labels || []).length),
          borderRadius: 8
        }]
      }, { plugins: { legend: { display: false } } });
    }

    // Chart 4: Monthly Emotional Summary (Line)
    if (analytics.monthlySummary) {
      const ms = analytics.monthlySummary;
      window.mkChart('monSumChart', 'line', {
        labels: ms.labels || ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        datasets: [{
          label: 'Wellness Score',
          data: ms.data || [65, 70, 72, 78],
          fill: true,
          backgroundColor: 'rgba(94,158,132,.12)',
          borderColor: '#5E9E84',
          borderWidth: 2,
          tension: .4,
          pointBackgroundColor: '#5E9E84',
          pointRadius: 4
        }]
      }, {});
    }
  },

  _generateClientFallback(userId) {
    return {
      userId,
      wellnessScore: 75,
      heroTitle: 'Your Weekly Emotional Summary',
      heroDescription: 'Your emotional wellness score is currently 75/100. Keep journaling to keep your insights fresh.',
      aiInsightText: 'Based on your recent journal activity, your emotional state appears stable. Add more entries to unlock richer trends.',
      chatEmotions: { labels: ['Positive', 'Neutral', 'Negative'], data: [50, 30, 20] },
      journalEmotions: { labels: ['Calm', 'Happy', 'Anxious', 'Sad', 'Tired'], data: [0, 0, 0, 0, 0] },
      weeklyTrend: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], thisWeek: [0, 0, 0, 0, 0, 0, 0], lastWeek: [0, 0, 0, 0, 0, 0, 0] },
      monthlySummary: { labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], data: [0, 0, 0, 0] }
    };
  }
};

window.InsightsAnalytics = InsightsAnalytics;
