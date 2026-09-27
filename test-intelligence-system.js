/**
 * Comprehensive Verification & Integration Test for:
 * 1. AI Trend & Engagement Intelligence Agent
 * 2. Multi-Format GitHub Actions Communication (Git commit, Webhook, Raw Feed, DB queue)
 * 3. Continuous Evolutionary Video Quality & Content Enhancer
 * 4. Microservice API & EndlessAutoPilot Dynamic Target Selection
 */

const assert = require('assert');
const { Database } = require('./database/db');
const { QualityEvolutionService } = require('./utils/quality-evolution-service');
const { EndlessAutoPilot } = require('./utils/endless-autopilot');
const { IntelligenceMicroservice } = require('./services/intelligence-service');

async function runTests() {
  console.log('\n===============================================================');
  console.log('🧪 Starting AI Intelligence & Quality Evolution Integration Tests');
  console.log('===============================================================\n');

  // 1. Initialize Test Database
  console.log('── Step 1: Database Schema & Methods Verification ──');
  const db = new Database();
  await db.initialize();

  // Test Trend Insights DB
  const trendId = await db.saveTrendInsight({
    keyword: 'Docker Multi-Stage Build Optimization',
    category: 'Docker',
    searchQuery: 'docker multi-stage build optimization tutorial',
    searchVolumeIndicator: 'high',
    trendSource: 'unit_test',
    metadata: { test: true }
  });
  assert(trendId, 'saveTrendInsight must return an id');
  const trendsList = await db.listTrendInsights(10);
  assert(Array.isArray(trendsList) && trendsList.length > 0, 'listTrendInsights must return array');
  console.log('  ✅ Trend Insights DB methods verified');

  // Test Content Suggestions DB
  const suggId = await db.saveContentSuggestion({
    topic: 'Test Driven Architecture: The Complete Masterclass',
    category: 'System Design',
    targetLength: 'extended',
    rationale: 'High search velocity for architectural testing patterns.',
    searchEvidence: 'system design test driven architecture',
    educationalVisuals: ['Architecture diagrams', 'State transitions'],
    hookAngle: 'Stop testing microservices in production. Here is the architectural blueprint.',
    channelAffinityScore: 92,
    trendScore: 88,
    priorityScore: 95,
    status: 'pending'
  });
  assert(suggId, 'saveContentSuggestion must return an id');
  const topSugg = await db.getNextTopContentSuggestion();
  assert(topSugg && topSugg.topic, 'getNextTopContentSuggestion must return the pending suggestion');
  assert(topSugg.priority_score >= 95, 'Top suggestion priority score must be >= 95');
  console.log(`  ✅ Top suggestion retrieved: "${topSugg.topic}" (Priority: ${topSugg.priority_score})`);
  console.log('  ✅ Content Suggestions DB methods verified');

  // 2. Continuous Evolutionary Video Quality & Content Enhancer
  console.log('\n── Step 2: Continuous Quality Evolution Engine ──');
  const qualityService = new QualityEvolutionService(db);
  
  // Baseline check
  const baseline = await qualityService.getDirectivesForNextVideo();
  console.log(`  Initial quality iteration: #${baseline.iteration_number || 0}`);

  // Simulate analyzing an uploaded video
  const analysisResult = await qualityService.analyzeUploadedVideo({
    videoId: 'mock_yt_123',
    title: 'Docker Networking Deep Dive',
    category: 'Docker',
    targetLength: 'short',
    scriptSummary: 'Today we are covering bridge and host networks...',
    durationSeconds: 165
  });

  assert(analysisResult, 'analyzeUploadedVideo must return analysis record');
  assert(analysisResult.iterationNumber > 0, 'iterationNumber must advance');
  assert(analysisResult.enhancementDirectives, 'enhancementDirectives must be defined');
  assert(analysisResult.enhancementDirectives.hookRule, 'hookRule must be established');

  // Verify next video receives the new directives
  const nextDirectives = await qualityService.getDirectivesForNextVideo();
  assert.strictEqual(nextDirectives.iteration_number, analysisResult.iterationNumber);
  console.log(`  ✅ Advanced to Evolutionary Iteration #${nextDirectives.iteration_number} with Score Target: >${nextDirectives.quality_score}`);
  console.log(`     Next Hook Rule: "${nextDirectives.enhancement_directives?.hookRule}"`);

  // 3. EndlessAutoPilot Dynamic Topic Ingestion
  console.log('\n── Step 3: EndlessAutoPilot Dynamic Target Selection ──');
  const autoPilot = new EndlessAutoPilot({}, db);
  const target = await autoPilot.getNextTarget();
  assert(target, 'getNextTarget must return a target');
  assert(target.topic, 'Target must have a topic');
  console.log(`  ✅ EndlessAutoPilot successfully selected: "${target.topic}" [${target.length.toUpperCase()}]`);
  console.log(`     Label: ${target.label}`);
  console.log(`     Is Widescreen (16:9): ${target.isWidescreen}`);

  // 4. Intelligence Microservice Verification
  console.log('\n── Step 4: Intelligence Microservice & API Endpoints ──');
  const testPort = 3499;
  const intelService = new IntelligenceMicroservice({
    port: testPort,
    db: db,
    autoSchedule: false // Don't run background timer during test
  });

  await intelService.start();

  try {
    // Health Check
    const healthResp = await fetch(`http://localhost:${testPort}/health`);
    const healthData = await healthResp.json();
    assert(healthData.status === 'healthy' || healthData.status === 'ok', 'Health status should be healthy or ok');
    console.log('  ✅ /health endpoint responded with 200 OK');

    // Quality Directives Endpoint
    const dirResp = await fetch(`http://localhost:${testPort}/api/quality/directives`);
    const dirData = await dirResp.json();
    assert(dirData.success, '/api/quality/directives must succeed');
    console.log(`  ✅ /api/quality/directives returned active iteration #${dirData.activeDirectives?.iteration_number}`);

    // Suggestions Endpoint
    const suggResp = await fetch(`http://localhost:${testPort}/api/suggestions`);
    const suggData = await suggResp.json();
    assert(suggData.success, '/api/suggestions must succeed');
    console.log(`  ✅ /api/suggestions returned ${suggData.total} queued suggestions`);

    // GitHub Webhook Ingestion Endpoint
    const webhookResp = await fetch(`http://localhost:${testPort}/api/github/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'test_dispatch',
        topSuggestion: {
          topic: 'Rust vs Go for Microservices: 2026 Production Benchmark',
          category: 'System Design',
          targetLength: 'long',
          rationale: 'Surging interest in memory-safe compiled languages.',
          searchEvidence: 'rust vs go microservices benchmark',
          educationalVisuals: ['Memory graphs', 'Latency comparison'],
          priorityScore: 99
        }
      })
    });
    const webhookData = await webhookResp.json();
    assert(webhookData.success, '/api/github/webhook must successfully ingest payload');
    console.log('  ✅ /api/github/webhook successfully ingested GitHub Actions dispatch');

  } finally {
    await intelService.stop();
    console.log('  ✅ Test microservice stopped cleanly');
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY (100%)');
  console.log('===============================================================\n');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
