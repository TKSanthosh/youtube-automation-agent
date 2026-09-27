require('dotenv').config();

const express = require('express');
const axios = require('axios');
const chalk = require('chalk');
const { Database } = require('../database/db');
const { Logger } = require('../utils/logger');
const { TrendEngagementAgent } = require('../utils/trend-engagement-agent');

class IntelligenceMicroservice {
  constructor(options = {}) {
    this.port = options.port || Number(process.env.INTELLIGENCE_PORT || 3457);
    this.mainAgentUrl = options.mainAgentUrl || process.env.MAIN_AGENT_URL || 'http://localhost:3456';
    this.autoDispatch = options.autoDispatch ?? (process.env.INTELLIGENCE_AUTO_DISPATCH === 'true');
    this.logger = new Logger('IntelligenceService');
    this.app = express();
    this.db = null;
    this.agent = null;
    this.server = null;
  }

  async initialize() {
    this.logger.info('Initializing Intelligence Microservice...');

    // 1. Connect to Shared Database
    this.db = new Database();
    await this.db.initialize();

    // 2. Initialize Trend & Engagement AI Agent
    this.agent = new TrendEngagementAgent(this.db, {
      intervalHours: Number(process.env.OPTIMIZATION_INTERVAL_HOURS || 6),
      onCycleComplete: async (_result) => {
        if (this.autoDispatch) {
          this.logger.info('🔄 Auto-dispatch enabled: Submitting top recommendation to Video Generator...');
          await this.dispatchTopSuggestion().catch(err => {
            this.logger.warn(`Auto-dispatch notice: ${err.message}`);
          });
        }
      }
    });

    // 3. Setup Express REST API
    this.setupRoutes();

    // 4. Start Autonomous Schedule (2 to 4 times per day)
    this.agent.startAutonomousSchedule(true);

    return true;
  }

  setupRoutes() {
    this.app.use(express.json());

    // CORS & Logging
    this.app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    // Root info
    this.app.get('/', (req, res) => {
      res.json({
        service: 'YouTube Content & Tech Trend Intelligence Microservice',
        version: '1.0.0',
        port: this.port,
        endpoints: [
          '/health',
          '/api/trends',
          '/api/engagement',
          '/api/suggestions',
          '/api/suggestions/next',
          '/api/analyze-now',
          '/api/dispatch-next'
        ]
      });
    });

    // Health & Status
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'trend-engagement-intelligence',
        port: this.port,
        cadence: `${Math.round(24 / this.agent.intervalHours)}x daily (every ${this.agent.intervalHours} hours)`,
        isAnalyzing: this.agent.isAnalyzing,
        lastAnalysisAt: this.agent.lastAnalysisAt,
        nextAnalysisAt: this.agent.nextAnalysisAt,
        stats: this.agent.stats,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Real-Time Tech Trends & Search Queries
    this.app.get('/api/trends', async (req, res) => {
      try {
        const limit = Number(req.query.limit || 50);
        const category = req.query.category || null;
        const trends = await this.db.listTrendInsights(limit, category);
        return res.json({ success: true, count: trends.length, trends });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // Channel Content & Engagement Breakdown
    this.app.get('/api/engagement', async (req, res) => {
      try {
        const profile = await this.agent.analyzeChannelEngagement();
        return res.json({ success: true, profile });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // All AI Content Suggestions
    this.app.get('/api/suggestions', async (req, res) => {
      try {
        const status = req.query.status || 'pending';
        const limit = Number(req.query.limit || 20);
        const suggestions = await this.db.listContentSuggestions({ status, limit });
        return res.json({ success: true, count: suggestions.length, suggestions });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // Next Top Priority Suggestion for Video Generator
    this.app.get('/api/suggestions/next', async (req, res) => {
      try {
        let suggestion = await this.db.getNextTopContentSuggestion();
        if (!suggestion) {
          // If queue empty, synthesize fresh suggestions
          this.logger.info('Queue empty, triggering on-demand cycle for next suggestion...');
          await this.agent.runAnalysisCycle();
          suggestion = await this.db.getNextTopContentSuggestion();
        }

        if (suggestion && req.query.markUsed === 'true') {
          await this.db.markSuggestionStatus(suggestion.id, 'in_progress');
        }

        return res.json({ success: Boolean(suggestion), suggestion });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // Force an immediate analysis cycle on demand
    this.app.post('/api/analyze-now', async (req, res) => {
      try {
        this.logger.info('Manual analysis cycle triggered via API...');
        const result = await this.agent.runAnalysisCycle();
        return res.json({ success: true, result });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    // Dispatch the top suggestion directly to the video generation service on port 3456
    this.app.post('/api/dispatch-next', async (req, res) => {
      try {
        const result = await this.dispatchTopSuggestion();
        if (!result.success && result.error?.includes('No pending')) {
          return res.status(404).json(result);
        }
        return res.json(result);
      } catch (err) {
        this.logger.error(`Failed to dispatch suggestion to video generator: ${err.message}`);
        return res.status(502).json({
          success: false,
          error: `Could not reach video generator at ${this.mainAgentUrl}: ${err.message}`
        });
      }
    });

    /**
     * POST /api/github/webhook - Ingest suggestions from GitHub Actions webhook dispatch
     */
    this.app.post('/api/github/webhook', async (req, res) => {
      try {
        const payload = req.body || {};
        this.logger.info(`📥 Received GitHub Actions Webhook Dispatch (Event: ${payload.event || 'custom'})`);
        
        let ingested = 0;
        if (Array.isArray(payload.suggestions)) {
          for (const s of payload.suggestions) {
            try {
              await this.db.saveContentSuggestion(s);
              ingested++;
            } catch (_e) {}
          }
        } else if (payload.topSuggestion) {
          await this.db.saveContentSuggestion(payload.topSuggestion);
          ingested++;
        }

        return res.json({
          success: true,
          message: `Ingested ${ingested} suggestions from GitHub Actions webhook`,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });

    /**
     * POST /api/github/sync - Real-time sync from GitHub Raw JSON feed
     */
    this.app.post('/api/github/sync', async (_req, res) => {
      try {
        const githubRawUrl = 'https://raw.githubusercontent.com/TKSanthosh/youtube-automation-agent/main/data/ai-content-suggestions.json';
        this.logger.info(`🌐 Pulling latest AI suggestions from GitHub: ${githubRawUrl}`);
        const resp = await axios.get(githubRawUrl, { timeout: 6000 });
        const data = resp.data;

        let added = 0;
        if (data && Array.isArray(data.suggestions)) {
          for (const s of data.suggestions) {
            try {
              await this.db.saveContentSuggestion(s);
              added++;
            } catch (_e) {}
          }
        }

        return res.json({
          success: true,
          source: githubRawUrl,
          totalRemote: data?.suggestions?.length || 0,
          ingested: added,
          syncedAt: new Date().toISOString()
        });
      } catch (err) {
        return res.status(502).json({ success: false, error: `GitHub sync error: ${err.message}` });
      }
    });

    /**
     * GET /api/quality/directives - Retrieve active evolutionary quality directives
     */
    this.app.get('/api/quality/directives', async (_req, res) => {
      try {
        const { QualityEvolutionService } = require('../utils/quality-evolution-service');
        const qualityEvolution = new QualityEvolutionService(this.db);
        const directives = await qualityEvolution.getDirectivesForNextVideo();
        const history = await this.db.listQualityEnhancements(10);
        return res.json({
          success: true,
          activeDirectives: directives,
          evolutionHistory: history
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    });
  }

  /**
   * Dispatch the top-ranked recommendation directly to the main video generator (Strictly Shorts)
   */
  async dispatchTopSuggestion() {
    const suggestion = await this.db.getNextTopContentSuggestion();
    if (!suggestion) {
      this.logger.warn('No pending content suggestions available to dispatch.');
      return { success: false, error: 'No pending content suggestions available.' };
    }

    this.logger.info(`Dispatching top recommendation to Video Generator on ${this.mainAgentUrl}: "${suggestion.topic}" (Format: SHORTS)`);

    // Strictly YouTube Shorts (9:16 vertical, 150-175s duration)
    const payload = {
      topic: suggestion.topic,
      style: 'tutorial',
      length: 'short',
      strategyContext: {
        angle: suggestion.hook_angle,
        rationale: suggestion.rationale,
        pillar: suggestion.category,
        audience: 'Software engineers, DevOps engineers, and developers'
      }
    };

    const headers = { 'Content-Type': 'application/json' };
    if (process.env.API_KEY) {
      headers['x-api-key'] = process.env.API_KEY;
    }

    const postRes = await axios.post(`${this.mainAgentUrl}/generate`, payload, {
      timeout: 30000,
      headers
    });

    // Mark suggestion as generating
    await this.db.markSuggestionStatus(suggestion.id, 'generating');

    return {
      success: true,
      dispatchedTopic: suggestion.topic,
      targetLength: 'short',
      generatorResponse: postRes.data
    };
  }

  async start() {
    await this.initialize();

    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(chalk.cyan.bold(`\n🧠 AI Content & Trend Intelligence Microservice Online`));
        console.log(chalk.gray('─'.repeat(55)));
        console.log(chalk.white('📡 Service Port:       ') + chalk.cyan(`http://localhost:${this.port}`));
        console.log(chalk.white('🔧 Health & Cadence:   ') + chalk.cyan(`http://localhost:${this.port}/health`));
        console.log(chalk.white('🌐 Search Trends:      ') + chalk.cyan(`http://localhost:${this.port}/api/trends`));
        console.log(chalk.white('📊 Channel Engagement: ') + chalk.cyan(`http://localhost:${this.port}/api/engagement`));
        console.log(chalk.white('💡 AI Suggestions:     ') + chalk.cyan(`http://localhost:${this.port}/api/suggestions`));
        console.log(chalk.gray('─'.repeat(55)));
        console.log(chalk.green('🚀 Autonomous cycle scheduled: 2-4x daily (every 6 hours)'));
        resolve(this.server);
      });
    });
  }

  async stop() {
    if (this.agent) {
      this.agent.stopAutonomousSchedule();
    }
    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
      this.server = null;
    }
  }
}

// Start standalone microservice process if executed directly
if (require.main === module) {
  const service = new IntelligenceMicroservice();
  service.start().catch(err => {
    console.error(chalk.red('Fatal microservice startup error:'), err);
    process.exit(1);
  });
}

module.exports = { IntelligenceMicroservice };
