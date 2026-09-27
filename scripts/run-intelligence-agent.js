#!/usr/bin/env node
/**
 * Standalone AI Trend & Engagement Intelligence Runner
 * Designed for execution inside GitHub Actions, cloud cron runners, or local CLI.
 * 
 * Functions:
 * 1. Analyzes channel content & viewer engagement patterns.
 * 2. Scrapes live trending tech queries (YouTube autocomplete & tech feeds) with 0 quota cost.
 * 3. Uses Gemini AI to synthesize high-priority YouTube Shorts blueprints (strictly 2m 30s - 3m vertical Shorts).
 * 4. Exports structured JSON communication feeds:
 *    - data/ai-content-suggestions.json
 *    - data/trend-insights.json
 *    - data/latest-suggestion.json
 * 5. Optionally pushes results via HTTP webhook or GitHub Actions output.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Database } = require('../database/db');
const { CredentialManager } = require('../utils/credential-manager');
const { TrendEngagementAgent } = require('../utils/trend-engagement-agent');
const { Logger } = require('../utils/logger');

const logger = new Logger('RunIntelligenceAgent');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    webhookUrl: process.env.WEBHOOK_URL || null,
    exportDir: path.join(__dirname, '..', 'data'),
    forceTopic: null
  };

  for (const arg of args) {
    if (arg === '--dry-run') options.dryRun = true;
    if (arg.startsWith('--webhook=')) options.webhookUrl = arg.split('=')[1];
    if (arg.startsWith('--export-dir=')) options.exportDir = arg.split('=')[1];
    if (arg.startsWith('--topic=')) options.forceTopic = arg.split('=')[1];
  }

  return options;
}

async function exportJsonFeeds(exportDir, suggestions, trends, channelEngagement) {
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();

  // 1. All Suggestions Feed
  const suggestionsFile = path.join(exportDir, 'ai-content-suggestions.json');
  const suggestionsPayload = {
    updated_at: timestamp,
    total_suggestions: suggestions.length,
    suggestions: suggestions
  };
  fs.writeFileSync(suggestionsFile, JSON.stringify(suggestionsPayload, null, 2), 'utf-8');
  logger.info(`💾 Exported content suggestions to: ${suggestionsFile}`);

  // 2. Latest Top Recommendation (for instant consumer lookup)
  const topSuggestion = suggestions && suggestions.length > 0 ? suggestions[0] : null;
  const latestFile = path.join(exportDir, 'latest-suggestion.json');
  const latestPayload = {
    updated_at: timestamp,
    has_suggestion: Boolean(topSuggestion),
    suggestion: topSuggestion
  };
  fs.writeFileSync(latestFile, JSON.stringify(latestPayload, null, 2), 'utf-8');
  logger.info(`💾 Exported top recommendation to: ${latestFile}`);

  // 3. Trend Insights Feed
  const trendsFile = path.join(exportDir, 'trend-insights.json');
  const trendsPayload = {
    updated_at: timestamp,
    total_trends: trends.length,
    channel_engagement: channelEngagement || {},
    trends: trends
  };
  fs.writeFileSync(trendsFile, JSON.stringify(trendsPayload, null, 2), 'utf-8');
  logger.info(`💾 Exported trend insights to: ${trendsFile}`);

  return { suggestionsFile, latestFile, trendsFile, topSuggestion };
}

async function sendWebhookNotification(webhookUrl, payload) {
  if (!webhookUrl) return;

  logger.info(`📡 Dispatching results to Webhook: ${webhookUrl}`);
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'YouTube-Automation-Intelligence-Agent/1.0'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    if (resp.ok) {
      logger.info(`✅ Webhook dispatched successfully (Status: ${resp.status})`);
    } else {
      logger.warn(`⚠️ Webhook responded with status: ${resp.status}`);
    }
  } catch (err) {
    logger.warn(`Failed to dispatch webhook (${err.message}). Continuing execution.`);
  }
}

function writeGitHubOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile && fs.existsSync(outputFile)) {
    fs.appendFileSync(outputFile, `${key}=${value}\n`, 'utf-8');
  }
}

async function main() {
  const options = parseArgs();
  logger.info('🚀 Starting AI Trend & Engagement Intelligence Runner...');
  logger.info(`   Dry Run: ${options.dryRun}`);
  logger.info(`   Export Directory: ${options.exportDir}`);
  if (options.webhookUrl) logger.info(`   Webhook URL: ${options.webhookUrl}`);

  // Initialize DB & Credentials
  const db = new Database();
  await db.initialize();

  const credentials = new CredentialManager();
  await credentials.initialize();

  // Create Intelligence Agent
  const agent = new TrendEngagementAgent(db, {
    credentials: credentials.credentials || {}
  });

  // Execute full cycle
  logger.info('🔍 Executing trend discovery & AI recommendation cycle...');
  const cycleResult = await agent.runAnalysisCycle();

  if (!cycleResult || !cycleResult.success) {
    throw new Error(cycleResult?.error || 'Analysis cycle failed or did not return success');
  }

  // Retrieve saved pending Shorts suggestions and trends from database
  const suggestions = await db.listContentSuggestions({ status: 'pending', target_length: 'short', limit: 50 });
  const trends = await db.listTrendInsights({ limit: 50 });
  const nextTop = await db.getNextTopContentSuggestion();

  logger.info(`✅ Intelligence cycle complete:`);
  logger.info(`   - Scored Trends Discovered: ${trends.length}`);
  logger.info(`   - AI Video Blueprints Formulated: ${suggestions.length}`);

  // Export JSON communication files
  const { topSuggestion } = await exportJsonFeeds(
    options.exportDir,
    suggestions,
    trends,
    cycleResult.engagementProfile
  );

  // Send Webhook payload if requested
  if (options.webhookUrl) {
    await sendWebhookNotification(options.webhookUrl, {
      event: 'ai_trend_analysis_complete',
      timestamp: new Date().toISOString(),
      topSuggestion,
      suggestionsCount: suggestions.length,
      suggestions: suggestions.slice(0, 5)
    });
  }

  // Populate GitHub Actions Outputs if running inside GitHub Actions
  if (topSuggestion) {
    logger.info(`🎯 Top Priority Suggestion: "${topSuggestion.topic}" [${topSuggestion.target_length?.toUpperCase()}] (Score: ${topSuggestion.engagement_score_prediction})`);
    writeGitHubOutput('TOPIC', topSuggestion.topic);
    writeGitHubOutput('TARGET_LENGTH', topSuggestion.target_length || 'short');
    writeGitHubOutput('CATEGORY', topSuggestion.category || 'tech');
    writeGitHubOutput('HAS_SUGGESTION', 'true');
  } else {
    writeGitHubOutput('HAS_SUGGESTION', 'false');
  }

  logger.info('🎉 Intelligence run completed successfully.');
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    logger.error(`Intelligence Runner failed: ${err.message}\n${err.stack}`);
    process.exit(1);
  });
}

module.exports = { main, exportJsonFeeds };
