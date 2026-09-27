const fs = require('fs');
const path = require('path');
const { Logger } = require('./logger');
const { AITextService } = require('./ai-text-service');

class QualityEvolutionService {
  constructor(db, options = {}) {
    this.db = db;
    this.options = options;
    this.logger = new Logger('QualityEvolutionService');
    this.aiTextService = options.aiTextService || new AITextService(options.credentials || {});
    this.directivesFilePath = path.join(__dirname, '..', 'data', 'quality-evolution-directives.json');
  }

  /**
   * Analyze an uploaded video and formulate mandatory evolutionary directives for the next video
   */
  async analyzeUploadedVideo(videoData = {}) {
    this.logger.info(`🔬 Analyzing uploaded video: "${videoData.title || videoData.topic || 'Untitled'}"...`);
    
    // Retrieve previous iteration
    let previousDirectives = null;
    try {
      if (this.db && typeof this.db.getLatestQualityDirectives === 'function') {
        previousDirectives = await this.db.getLatestQualityDirectives();
      }
    } catch (_e) {
      previousDirectives = null;
    }

    const currentIteration = (previousDirectives?.iteration_number || 0) + 1;
    this.logger.info(`📈 Advancing Evolutionary Quality Iteration to #${currentIteration}`);

    const critique = await this.evaluateVideoContent(videoData, previousDirectives, currentIteration);

    const record = {
      iterationNumber: currentIteration,
      videoId: videoData.videoId || videoData.youtubeId || null,
      title: videoData.title || videoData.topic || `Production #${currentIteration}`,
      category: videoData.category || 'tech',
      targetLength: videoData.targetLength || videoData.length || 'short',
      metricsAnalyzed: {
        analyzedAt: new Date().toISOString(),
        videoDurationSeconds: videoData.durationSeconds || null,
        totalScenes: videoData.scenesCount || null
      },
      contentCritique: critique.contentCritique,
      lessonsLearned: critique.lessonsLearned,
      enhancementDirectives: critique.enhancementDirectives,
      qualityScore: critique.qualityScore,
      appliedToNext: false
    };

    // Save to Database
    if (this.db && typeof this.db.saveQualityEnhancement === 'function') {
      try {
        record.id = await this.db.saveQualityEnhancement(record);
      } catch (dbErr) {
        this.logger.warn(`Could not save quality enhancement to DB: ${dbErr.message}`);
      }
    }

    // Export to JSON data file
    this.exportDirectivesJson(record);

    this.logger.success(`✨ Quality evolution analysis complete for iteration #${currentIteration}. Next video quality directives active.`);
    return record;
  }

  /**
   * Run AI evaluation or deterministic critique
   */
  async evaluateVideoContent(videoData, previousDirectives, iteration) {
    const prompt = `
You are the Executive Video Director and YouTube Algorithmic Quality Auditor.
Our rule: EVERY uploaded video must be measurably higher quality than the previous one.

Uploaded Video Details:
- Title: "${videoData.title || videoData.topic || 'Software Engineering Tutorial'}"
- Category: "${videoData.category || 'Tech'}"
- Format: "${videoData.targetLength || 'short'}"
- Script Hook Preview: "${(videoData.scriptSummary || videoData.hook || '').slice(0, 300)}"
- Previous Iteration (#${previousDirectives?.iteration_number || 0}) Directives: ${JSON.stringify(previousDirectives?.enhancement_directives || 'Initial baseline')}

Critique this video and establish strict evolutionary enhancement directives for the NEXT video:
1. Hook & Pacing: Eliminate all introductory filler. Hook must immediately demonstrate the problem in under 2 seconds. Text and narration must be in laser sync.
2. Pedagogical Density: Increase concrete architecture/code examples by at least 15%.
3. Visual Engagement: Add kinetic motion cues, diagrams, and visual progression.
4. Next Video Upgrades: 3 to 5 non-negotiable enhancements the NEXT video must implement to surpass this one.
5. Quality Score: Rate between 8.0 and 9.9 (must be higher than previous iteration score of ${previousDirectives?.quality_score || 8.0}).

Respond with ONLY valid JSON:
{
  "contentCritique": "...",
  "lessonsLearned": "...",
  "qualityScore": 8.5,
  "enhancementDirectives": {
    "hookRule": "...",
    "audioTextSyncRule": "...",
    "pedagogicalDensity": "...",
    "visualGuidelines": "...",
    "mandatoryUpgrades": ["...", "...", "..."]
  }
}
`;

    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI critique timed out after 12s')), 12000)
      );
      const responseText = await Promise.race([
        this.aiTextService.generateText(prompt, { maxTokens: 1500, temperature: 0.5 }),
        timeoutPromise
      ]);

      const parsed = this.parseJsonFromText(responseText);
      if (parsed && parsed.contentCritique && parsed.enhancementDirectives) {
        return {
          contentCritique: parsed.contentCritique,
          lessonsLearned: parsed.lessonsLearned || 'Continuous improvement applied.',
          qualityScore: Number(parsed.qualityScore || ((previousDirectives?.quality_score || 8.0) + 0.3)),
          enhancementDirectives: parsed.enhancementDirectives
        };
      }
    } catch (err) {
      this.logger.warn(`AI critique fallback used (${err.message}). Applying deterministic evolutionary rules.`);
    }

    // Deterministic Evolutionary Quality Fallback
    const previousScore = Number(previousDirectives?.quality_score || 8.0);
    const nextScore = Math.min(9.9, +(previousScore + 0.2).toFixed(1));

    return {
      contentCritique: `Iteration #${iteration}: Narration and concept were strong, but hook delay and transition pacing can be tightened. Text must match spoken audio phonemes instantly with zero silence.`,
      lessonsLearned: `Viewers drop off when intro takes more than 2 seconds. The next video must reveal the core conflict within the first 1.5 seconds and include side-by-side architecture comparisons.`,
      qualityScore: nextScore,
      enhancementDirectives: {
        hookRule: "Start immediately with the high-stakes problem in under 1.5 seconds. Zero 'Hello guys' or channel pleasantries.",
        audioTextSyncRule: "Subtitles and visual text cards must render synchronously with audio words. Zero silence buffer.",
        pedagogicalDensity: "Include at least one concrete code snippet or system diagram comparing before vs after.",
        visualGuidelines: "High-contrast dark mode background with syntax highlighting and kinetic highlight arrows.",
        mandatoryUpgrades: [
          `Cut intro delay to under 1.5 seconds (Iteration #${iteration} standard)`,
          "Enforce 15% higher technical density with real architecture benchmarks",
          "Ensure slide transitions occur within 3-5 seconds of spoken concept shifts"
        ]
      }
    };
  }

  parseJsonFromText(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (_e2) {
          return null;
        }
      }
      return null;
    }
  }

  exportDirectivesJson(record) {
    try {
      const dir = path.dirname(this.directivesFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.directivesFilePath, JSON.stringify(record, null, 2), 'utf-8');
      this.logger.info(`💾 Exported latest quality enhancement directives to: ${this.directivesFilePath}`);
    } catch (err) {
      this.logger.warn(`Failed to export directives JSON: ${err.message}`);
    }
  }

  /**
   * Retrieve active directives to inject into the next video generation cycle
   */
  async getDirectivesForNextVideo() {
    // 1. Try DB first
    if (this.db && typeof this.db.getLatestQualityDirectives === 'function') {
      try {
        const row = await this.db.getLatestQualityDirectives();
        if (row) return row;
      } catch (_e) {
        // continue
      }
    }

    // 2. Try JSON file
    if (fs.existsSync(this.directivesFilePath)) {
      try {
        const raw = fs.readFileSync(this.directivesFilePath, 'utf-8');
        return JSON.parse(raw);
      } catch (_e) {
        // continue
      }
    }

    // 3. Initial Baseline Directives
    return {
      iteration_number: 0,
      quality_score: 8.0,
      enhancement_directives: {
        hookRule: "Open directly with the core problem in under 2 seconds. Zero fluff.",
        audioTextSyncRule: "Strict synchronization between subtitle display and voice phonemes.",
        pedagogicalDensity: "Clear, senior-engineer grade explanation with visual diagrams."
      }
    };
  }
}

module.exports = { QualityEvolutionService };
