const axios = require('axios');
const { Logger } = require('./logger');
const { AITextService } = require('./ai-text-service');

class TrendEngagementAgent {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = new Logger('TrendEngagementAgent');
    this.options = options;
    this.credentials = options.credentials || null;
    this.aiTextService = options.aiTextService || new AITextService(options.credentials || {});
    // Cadence: 2-4 times per day (default 6 hours = 4 times/day)
    this.intervalHours = options.intervalHours || Number(process.env.OPTIMIZATION_INTERVAL_HOURS || 6);
    this.timer = null;
    this.isRunning = false;
    this.isAnalyzing = false;
    this.lastAnalysisAt = null;
    this.nextAnalysisAt = null;

    this.stats = {
      totalAnalyses: 0,
      totalTrendsDiscovered: 0,
      totalSuggestionsCreated: 0,
      lastStatus: 'idle',
      lastError: null
    };

    // Stems for live search queries across developer tech domains (YouTube autocomplete & search suggest)
    this.searchQueryStems = [
      { stem: 'python asyncio', category: 'Python' },
      { stem: 'python memory optimization', category: 'Python' },
      { stem: 'system design interview', category: 'System Design' },
      { stem: 'distributed systems architecture', category: 'System Design' },
      { stem: 'microservices circuit breaker', category: 'System Design' },
      { stem: 'docker container networking', category: 'Docker' },
      { stem: 'docker multi stage build', category: 'Docker' },
      { stem: 'kubernetes pod lifecycle', category: 'Kubernetes' },
      { stem: 'kubernetes gateway api', category: 'Kubernetes' },
      { stem: 'kubernetes hpa scaling', category: 'Kubernetes' },
      { stem: 'model context protocol mcp', category: 'AI/ML' },
      { stem: 'ai agent framework autonomous', category: 'AI/ML' },
      { stem: 'vector database similarity search', category: 'AI/ML' },
      { stem: 'typescript performance generics', category: 'TypeScript' },
      { stem: 'kafka partition consumer group', category: 'System Design' },
      { stem: 'redis caching strategies', category: 'System Design' },
      { stem: 'database sharding postgresql', category: 'System Design' },
      { stem: 'linux eBPF kernel', category: 'DevOps' },
      { stem: 'github actions cicd pipeline', category: 'DevOps' }
    ];
  }

  /**
   * Start the recurring autonomous optimization schedule (2 to 4 times per day)
   */
  startAutonomousSchedule(immediate = true) {
    if (this.isRunning) {
      this.logger.warn('Autonomous optimization schedule is already running.');
      return;
    }

    this.isRunning = true;
    this.logger.info(`🚀 Starting Trend & Engagement Intelligence Agent (Every ${this.intervalHours} hours / ${Math.round(24 / this.intervalHours)}x daily)...`);

    if (immediate) {
      // Run first cycle shortly after boot
      setTimeout(() => {
        this.runAnalysisCycle().catch(err => {
          this.logger.error(`Initial analysis cycle failed: ${err.message}`);
        });
      }, 3000);
    }

    const intervalMs = this.intervalHours * 60 * 60 * 1000;
    this.nextAnalysisAt = new Date(Date.now() + (immediate ? 3000 : intervalMs)).toISOString();

    this.timer = setInterval(async () => {
      try {
        await this.runAnalysisCycle();
      } catch (err) {
        this.logger.error(`Scheduled analysis cycle failed: ${err.message}`);
      }
    }, intervalMs);
  }

  /**
   * Stop the recurring schedule
   */
  stopAutonomousSchedule() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('🛑 Autonomous optimization schedule stopped.');
  }

  /**
   * Perform one full analysis and optimization cycle
   */
  async runAnalysisCycle() {
    if (this.isAnalyzing) {
      this.logger.warn('Analysis cycle is already in progress, skipping duplicate trigger.');
      return { status: 'already_running' };
    }

    this.isAnalyzing = true;
    this.stats.lastStatus = 'analyzing';
    const startTime = Date.now();
    this.logger.info('🔍 Starting channel engagement & real-time tech trend analysis cycle...');

    try {
      // 1. Analyze Channel Engagement
      const engagementProfile = await this.analyzeChannelEngagement();
      this.logger.info(`📊 Channel engagement analysis completed: ${engagementProfile.topCategories.length} categories evaluated.`);

      // 2. Scout Real-Time Tech Trends & Search Queries
      const trends = await this.scoutTrendingTechAndSearches();
      this.logger.info(`🌐 Tech search scout discovered ${trends.length} active queries & topics.`);
      this.stats.totalTrendsDiscovered += trends.length;

      // 3. Synthesize & Rank Video Recommendations with AI
      const suggestions = await this.synthesizeContentSuggestions(engagementProfile, trends);
      this.logger.info(`💡 AI Synthesizer generated ${suggestions.length} prioritized video recommendations.`);
      this.stats.totalSuggestionsCreated += suggestions.length;

      this.lastAnalysisAt = new Date().toISOString();
      this.nextAnalysisAt = new Date(Date.now() + this.intervalHours * 3600 * 1000).toISOString();
      this.stats.totalAnalyses++;
      this.stats.lastStatus = 'idle';
      this.stats.lastError = null;

      const durationMs = Date.now() - startTime;
      this.logger.info(`✅ Analysis cycle complete in ${(durationMs / 1000).toFixed(1)}s. Next cycle scheduled for: ${this.nextAnalysisAt}`);

      const result = {
        success: true,
        durationMs,
        lastAnalysisAt: this.lastAnalysisAt,
        nextAnalysisAt: this.nextAnalysisAt,
        engagementProfile,
        trendsCount: trends.length,
        suggestionsCount: suggestions.length,
        topSuggestions: suggestions.slice(0, 3)
      };

      if (typeof this.options?.onCycleComplete === 'function') {
        try {
          await this.options.onCycleComplete(result);
        } catch (cbErr) {
          this.logger.warn(`onCycleComplete hook notice: ${cbErr.message}`);
        }
      }

      return result;
    } catch (error) {
      this.stats.lastStatus = 'error';
      this.stats.lastError = error.message;
      this.logger.error(`Analysis cycle failed: ${error.message}`);
      throw error;
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * 1. Analyze Channel Content & Engagement
   */
  /**
   * 1. Analyze Channel Content & Engagement (Live YouTube API + Local Database)
   */
  async analyzeChannelEngagement() {
    const profile = {
      totalVideosAnalyzed: 0,
      liveYouTubeSynced: false,
      topCategories: [],
      formatPreferences: {
        short: { count: 0, avgViews: 0, avgRetention: 0, priority: 'exclusive_shorts' }
      },
      categoryAffinity: {},
      summary: ''
    };

    if (!this.db) return profile;

    try {
      // 1. Fetch published records from database
      const publishedRecords = this.db.getAllRows 
        ? await this.db.getAllRows("SELECT id, title, youtube_id, youtube_url, published_at FROM publish_schedule WHERE status = 'published' AND youtube_id IS NOT NULL ORDER BY published_at DESC LIMIT 50")
        : [];

      // 2. Fetch live YouTube statistics if YouTube API is authenticated
      const liveStatsMap = new Map();
      if (publishedRecords.length > 0) {
        try {
          let youtubeClient = null;
          if (this.credentials?.getYouTubeClient) {
            youtubeClient = this.credentials.getYouTubeClient();
          } else {
            const { CredentialManager } = require('./credential-manager');
            const creds = new CredentialManager();
            if (await creds.initialize().catch(() => false)) {
              youtubeClient = creds.getYouTubeClient();
            }
          }

          if (youtubeClient) {
            const videoIds = publishedRecords.map(r => r.youtube_id).filter(Boolean);
            // Fetch in chunks of 50
            for (let i = 0; i < videoIds.length; i += 50) {
              const chunk = videoIds.slice(i, i + 50);
              const ytRes = await youtubeClient.videos.list({
                part: 'snippet,statistics',
                id: chunk.join(',')
              });

              for (const item of ytRes.data?.items || []) {
                liveStatsMap.set(item.id, {
                  views: parseInt(item.statistics?.viewCount, 10) || 0,
                  likes: parseInt(item.statistics?.likeCount, 10) || 0,
                  comments: parseInt(item.statistics?.commentCount, 10) || 0,
                  title: item.snippet?.title || ''
                });
              }
            }
            if (liveStatsMap.size > 0) {
              profile.liveYouTubeSynced = true;
              this.logger.info(`📡 Synced live metrics from YouTube for ${liveStatsMap.size} channel videos`);
            }
          }
        } catch (ytErr) {
          this.logger.warn(`Live YouTube stats sync note: ${ytErr.message}`);
        }
      }

      // 3. Fallback database analytics
      const [snapshots, strategies] = await Promise.all([
        this.db.getAllRows ? this.db.getAllRows('SELECT * FROM performance_snapshots ORDER BY measured_at DESC LIMIT 50') : [],
        this.db.getAllRows ? this.db.getAllRows('SELECT * FROM content_strategies ORDER BY created_at DESC LIMIT 50') : []
      ]);

      profile.totalVideosAnalyzed = publishedRecords.length || (strategies?.length || 0);

      // 4. Group and score by category
      const categories = ['Python', 'System Design', 'Docker', 'Kubernetes', 'AI/ML', 'TypeScript', 'Java', 'DevOps', 'Databases', 'Networking'];
      const categoryScores = {};

      for (const cat of categories) {
        categoryScores[cat] = {
          name: cat,
          videoCount: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
          avgEngagementRate: 0,
          engagementScore: 50 // baseline score
        };
      }

      for (const rec of publishedRecords) {
        const live = liveStatsMap.get(rec.youtube_id);
        const title = (live?.title || rec.title || '').toLowerCase();
        const views = live ? live.views : 100;
        const likes = live ? live.likes : 5;
        const comments = live ? live.comments : 1;

        for (const cat of categories) {
          const catKey = cat.toLowerCase();
          const match = title.includes(catKey) || 
            (cat === 'AI/ML' && (title.includes('ai') || title.includes('neural') || title.includes('mcp') || title.includes('llm') || title.includes('transformer'))) ||
            (cat === 'Databases' && (title.includes('sql') || title.includes('redis') || title.includes('postgres') || title.includes('sharding'))) ||
            (cat === 'Networking' && (title.includes('tls') || title.includes('dns') || title.includes('http') || title.includes('ingress')));

          if (match) {
            const entry = categoryScores[cat];
            entry.videoCount++;
            entry.totalViews += views;
            entry.totalLikes += likes;
            entry.totalComments += comments;
          }
        }
      }

      // 5. Rank categories by engagement score
      const rankedCategories = Object.values(categoryScores).map(cat => {
        const viewsFactor = Math.min(30, cat.totalViews / 50);
        const likesFactor = Math.min(25, cat.totalLikes * 2);
        const commentsFactor = Math.min(15, cat.totalComments * 5);
        const productionFactor = Math.min(20, cat.videoCount * 4);
        const score = Math.min(100, Math.round(10 + viewsFactor + likesFactor + commentsFactor + productionFactor));

        return {
          category: cat.name,
          videoCount: cat.videoCount,
          totalViews: cat.totalViews,
          totalLikes: cat.totalLikes,
          totalComments: cat.totalComments,
          engagementScore: score
        };
      }).sort((a, b) => b.engagementScore - a.engagementScore);

      profile.topCategories = rankedCategories;
      profile.categoryAffinity = Object.fromEntries(rankedCategories.map(c => [c.category, c.engagementScore]));
      profile.summary = `Analyzed ${profile.totalVideosAnalyzed} videos. Top performing categories: ${rankedCategories.slice(0, 3).map(c => `${c.category} (Score: ${c.engagementScore})`).join(', ')}`;

      return profile;
    } catch (err) {
      this.logger.warn(`Could not load full channel metrics: ${err.message}. Using calibrated baseline.`);
      return profile;
    }
  }

  /**
   * 2. Scout Real-Time Tech Trends & Search Queries
   */
  async scoutTrendingTechAndSearches() {
    const discovered = [];

    // A. Query YouTube search autocomplete for live developer search queries
    for (const target of this.searchQueryStems) {
      try {
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(target.stem)}`;
        const res = await axios.get(url, { timeout: 4000 });
        const suggestions = Array.isArray(res.data?.[1]) ? res.data[1] : [];

        for (const query of suggestions.slice(0, 5)) {
          discovered.push({
            keyword: query,
            category: target.category,
            searchQuery: query,
            searchVolumeIndicator: 'high',
            trendSource: 'youtube_search_suggest',
            metadata: { stem: target.stem }
          });
        }
      } catch (err) {
        // Silently continue to next stem if one request times out
      }
    }

    // B. Query HackerNews Algolia for developer discussions & trending tech
    try {
      const hnUrl = 'https://hn.algolia.com/api/v1/search?tags=story&numericFilters=points>50&hitsPerPage=15';
      const hnRes = await axios.get(hnUrl, { timeout: 5000 });
      const hits = hnRes.data?.hits || [];

      for (const hit of hits) {
        const title = hit.title || '';
        const lower = title.toLowerCase();
        let matchedCategory = 'General Tech';

        if (lower.includes('python')) matchedCategory = 'Python';
        else if (lower.includes('kubernetes') || lower.includes('k8s')) matchedCategory = 'Kubernetes';
        else if (lower.includes('docker') || lower.includes('container')) matchedCategory = 'Docker';
        else if (lower.includes('ai') || lower.includes('llm') || lower.includes('gpt') || lower.includes('model')) matchedCategory = 'AI/ML';
        else if (lower.includes('database') || lower.includes('postgres') || lower.includes('sql') || lower.includes('redis')) matchedCategory = 'System Design';
        else if (lower.includes('architecture') || lower.includes('distributed')) matchedCategory = 'System Design';

        discovered.push({
          keyword: title,
          category: matchedCategory,
          searchQuery: title,
          searchVolumeIndicator: hit.points > 200 ? 'surging' : 'high',
          trendSource: 'hackernews',
          metadata: { points: hit.points, url: hit.url }
        });
      }
    } catch (err) {
      this.logger.warn(`HackerNews trend fetch note: ${err.message}`);
    }

    // Save discovered trends into database
    if (this.db && typeof this.db.saveTrendInsight === 'function') {
      for (const item of discovered) {
        try {
          await this.db.saveTrendInsight(item);
        } catch (_e) {
          // ignore duplicate inserts
        }
      }
    }

    return discovered;
  }

  /**
   * 3. AI Synthesis & Recommendation Engine (Strictly Shorts Format + Anti-Duplication)
   */
  async synthesizeContentSuggestions(engagementProfile, trends) {
    const suggestions = [];

    // 1. Gather all existing topics to enforce strict channel deduplication
    const existingTopics = new Set();
    const existingTitlesLower = [];
    try {
      const [schedRows, stratRows, suggRows] = await Promise.all([
        this.db.getAllRows ? this.db.getAllRows("SELECT title FROM publish_schedule WHERE title IS NOT NULL") : [],
        this.db.getAllRows ? this.db.getAllRows("SELECT topic FROM content_strategies WHERE topic IS NOT NULL") : [],
        this.db.getAllRows ? this.db.getAllRows("SELECT topic FROM content_suggestions WHERE topic IS NOT NULL") : []
      ]);
      for (const r of schedRows || []) {
        if (r.title) {
          const t = r.title.toLowerCase().trim();
          existingTopics.add(t);
          existingTitlesLower.push(t);
        }
      }
      for (const r of stratRows || []) {
        if (r.topic) {
          const t = r.topic.toLowerCase().trim();
          existingTopics.add(t);
          existingTitlesLower.push(t);
        }
      }
      for (const r of suggRows || []) {
        if (r.topic) existingTopics.add(r.topic.toLowerCase().trim());
      }
    } catch (_e) {}

    // Prepare top trends and category weights for prompt
    const sampleTrends = trends.slice(0, 25).map(t => `[${t.category}] "${t.searchQuery}" (Source: ${t.trendSource})`).join('\n');
    const topPillars = engagementProfile.topCategories.slice(0, 4).map(c => `${c.category} (Affinity: ${c.engagementScore}/100)`).join(', ');
    const forbiddenList = [...new Set(existingTitlesLower)].slice(0, 30).map(t => `- ${t}`).join('\n');

    const prompt = `
You are the Lead Tech Content Strategist & Algorithm Engineer for "Giggle Hub", a software engineering YouTube channel.
Analyze the channel's viewer engagement profile and real-time tech search trends below to generate 6-8 high-conviction video production recommendations.

MANDATORY FORMAT: STRICTLY YOUTUBE SHORTS (9:16 VERTICAL, 2m 30s to 2m 55s / 150-175 SECONDS)
- Every video on this channel is published strictly as a YouTube Short in 9:16 vertical resolution.
- Target Length MUST ALWAYS be "short". Never specify "long" or "extended".
- Each topic must be structured for a 4-slide pedagogical progression:
  Slide 1: High-stakes real-world production problem & relatable struggle (no overpromising)
  Slide 2: Under-the-hood architecture topology diagram & visual analogy
  Slide 3: Practical code walkthrough or syntax-highlighted terminal demonstration
  Slide 4: Senior developer rule of thumb & 100% complete pedagogical resolution

CRITICAL ANTI-DUPLICATION RULE:
Do NOT select, repeat, or closely replicate any of these topics already produced or published on the channel:
${forbiddenList || '- None recorded yet'}
Pick entirely fresh, exciting, unaddressed technical concepts that viewers are actively searching for!

Channel Top Pillars (prioritize highest affinity):
${topPillars || 'Python, System Design, Docker, Kubernetes, AI/ML'}

Real-Time Developer Search Trends:
${sampleTrends}

Requirements for each recommendation:
1. Topic: Concrete, punchy educational title under 75 characters (e.g., "Docker Multi-Stage Builds: Slash Container Sizes by 90%", "Understanding Python AsyncIO Event Loop in 3 Minutes").
2. Category: Exactly one of ['Python', 'System Design', 'Docker', 'Kubernetes', 'AI/ML', 'TypeScript', 'Java', 'DevOps', 'Databases', 'Networking'].
3. Target Length: Must be "short" (strictly 2.5 to 3 minute vertical Short).
4. Rationale: Why viewers are seeking this and how it maximizes watch-time.
5. Search Evidence: The exact search query viewers are typing.
6. Educational Visuals: 2 to 4 visual diagram types from: ['Animated system flows', 'Architecture diagrams', 'Data-flow diagrams', 'Trees and graphs', 'State transitions', 'Timelines', 'Code execution visualization'].
7. Hook Angle: First 5 seconds viewer hook.
8. Priority Score: 1-100 based on search momentum and educational depth.

Respond with ONLY valid JSON formatted as an array of objects:
[
  {
    "topic": "...",
    "category": "...",
    "target_length": "short",
    "rationale": "...",
    "search_evidence": "...",
    "educational_visuals": ["...", "..."],
    "hook_angle": "...",
    "channel_affinity_score": 85,
    "trend_score": 90,
    "priority_score": 88
  }
]
`;

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI generation timed out after 15s')), 15000)
      );
      const responseText = await Promise.race([
        this.aiTextService.generateText(prompt, { maxTokens: 2500, temperature: 0.6 }),
        timeoutPromise
      ]);
      const parsed = this.parseJsonFromText(responseText);

      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const item of parsed) {
          const rawTopic = (item.topic || '').trim();
          if (!rawTopic) continue;

          // Deduplication check
          const normalized = rawTopic.toLowerCase().trim();
          if (existingTopics.has(normalized)) {
            this.logger.warn(`Skipping duplicate AI suggestion: "${rawTopic}"`);
            continue;
          }

          const suggestion = {
            topic: rawTopic,
            category: item.category || 'System Design',
            targetLength: 'short', // Strictly Shorts
            rationale: item.rationale || 'High search velocity among senior software engineers.',
            searchEvidence: item.search_evidence || 'YouTube search autocomplete trend',
            educationalVisuals: Array.isArray(item.educational_visuals) ? item.educational_visuals : ['Architecture diagrams', 'Animated system flows'],
            hookAngle: item.hook_angle || 'Here is the fundamental reason why distributed systems fail under high load.',
            channelAffinityScore: Number(item.channel_affinity_score || 80),
            trendScore: Number(item.trend_score || 85),
            priorityScore: Number(item.priority_score || 85),
            status: 'pending'
          };

          if (this.db && typeof this.db.saveContentSuggestion === 'function') {
            suggestion.id = await this.db.saveContentSuggestion(suggestion);
          }
          existingTopics.add(normalized);
          suggestions.push(suggestion);
        }

        if (suggestions.length > 0) {
          return suggestions;
        }
      }
    } catch (aiErr) {
      this.logger.warn(`AI synthesis fallback triggered (${aiErr.message}). Using deterministic trend mapper.`);
    }

    // Deterministic High-Quality Fallback if AI synthesis is unavailable (Strictly Shorts, Deduplicated)
    const fallbackTemplates = [
      {
        topic: "Docker BuildKit Cache Mounts: Cut Image Build Times by 70%",
        category: "Docker",
        targetLength: "short",
        rationale: "BuildKit cache mounts eliminate redundant npm/pip downloads on every build.",
        searchEvidence: "docker buildkit cache mount tutorial",
        educationalVisuals: ["Process animations", "Timelines", "Code execution visualization"],
        hookAngle: "Stop waiting 10 minutes for Docker builds. Here is the BuildKit secret.",
        priorityScore: 92
      },
      {
        topic: "Kubernetes Ingress vs Gateway API Explained in 3 Minutes",
        category: "Kubernetes",
        targetLength: "short",
        rationale: "Gateway API is replacing Ingress as standard in K8s 1.30+; huge search interest.",
        searchEvidence: "kubernetes ingress vs gateway api",
        educationalVisuals: ["Architecture diagrams", "Animated system flows", "Comparisons"],
        hookAngle: "Why Kubernetes officially deprecated standard Ingress in favor of Gateway API.",
        priorityScore: 91
      },
      {
        topic: "Model Context Protocol (MCP) in 3 Minutes: The AI Agent Connector Standard",
        category: "AI/ML",
        targetLength: "short",
        rationale: "Anthropic MCP is becoming the standard protocol for tool-calling AI agents.",
        searchEvidence: "model context protocol mcp tutorial",
        educationalVisuals: ["Architecture diagrams", "Data-flow diagrams"],
        hookAngle: "Every AI agent framework is adopting MCP. Here is how client-server JSON-RPC works.",
        priorityScore: 94
      },
      {
        topic: "Redis Cache Invalidation Patterns: Cache-Aside vs Write-Through",
        category: "System Design",
        targetLength: "short",
        rationale: "Cache invalidation is a classic system design challenge with high search volume.",
        searchEvidence: "redis cache aside vs write through",
        educationalVisuals: ["Architecture diagrams", "Data-flow diagrams"],
        hookAngle: "There are only two hard things in Computer Science: cache invalidation is one of them.",
        priorityScore: 89
      },
      {
        topic: "Python 3.13 Free-Threaded GIL Removal: What Changes for Developers",
        category: "Python",
        targetLength: "short",
        rationale: "Python 3.13 free-threading is the biggest Python architectural shift in 20 years.",
        searchEvidence: "python 3.13 gil removal benchmark",
        educationalVisuals: ["State transitions", "Animated system flows", "Code execution visualization"],
        hookAngle: "Python finally has true multi-threading without the GIL. But how does it work?",
        priorityScore: 95
      },
      {
        topic: "Database Sharding vs Partitioning in 3 Minutes",
        category: "Databases",
        targetLength: "short",
        rationale: "Core system design question with consistently high search volume.",
        searchEvidence: "database sharding vs partitioning system design",
        educationalVisuals: ["Architecture diagrams", "Data-flow diagrams", "Comparisons"],
        hookAngle: "When your database hits 100,000 queries per second, this is how you scale storage.",
        priorityScore: 90
      }
    ];

    for (const tpl of fallbackTemplates) {
      const norm = tpl.topic.toLowerCase().trim();
      if (existingTopics.has(norm)) continue;

      const suggestion = {
        ...tpl,
        channelAffinityScore: 85,
        trendScore: tpl.priorityScore,
        status: 'pending'
      };
      if (this.db && typeof this.db.saveContentSuggestion === 'function') {
        suggestion.id = await this.db.saveContentSuggestion(suggestion);
      }
      existingTopics.add(norm);
      suggestions.push(suggestion);
    }

    return suggestions;
  }

  /**
   * Fetch the next top recommendation ready to be produced
   */
  async getNextTarget() {
    if (this.db && typeof this.db.getNextTopContentSuggestion === 'function') {
      const next = await this.db.getNextTopContentSuggestion();
      if (next) return next;
    }

    // Trigger quick analysis if queue is empty
    const res = await this.runAnalysisCycle().catch(() => null);
    if (res?.topSuggestions?.length) {
      return res.topSuggestions[0];
    }

    return null;
  }

  /**
   * Helper to parse JSON from AI model response safely
   */
  parseJsonFromText(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_e) {}

    const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_e) {}
    }
    return null;
  }
}

module.exports = { TrendEngagementAgent };
