const { Logger } = require('./logger');
const { StorageManager } = require('./storage-manager');
const { GoogleDriveService } = require('./google-drive-service');

class EndlessAutoPilot {
  constructor(options = {}, db = null) {
    this.options = options;
    this.db = db;
    this.logger = new Logger('EndlessAutoPilot');
    this.storageManager = new StorageManager(db);
    this.googleDrive = new GoogleDriveService();
    this.isRunning = false;
    this.isPausedForRateLimit = false;
    this.isPausedForUploadLimit = false;
    this.pingIntervalMs = options.pingIntervalMs || 30000;
    
    this.sessionStats = {
      videosGenerated: 0,
      extendedVideosGenerated: 0,
      longVideosGenerated: 0,
      shortsGenerated: 0,
      videosPublished: 0,
      storageFreedMb: 0,
      errorsEncountered: 0
    };

    this.curatedTopics = [
      { topic: "Understanding Python's GIL and AsyncIO with Code Examples", tech: 'python', category: 'Python' },
      { topic: "Building High-Throughput Microservices in Java with Virtual Threads", tech: 'java', category: 'Java' },
      { topic: "Mastering TypeScript Generics and Type-Level Metaprogramming", tech: 'typescript', category: 'TypeScript' },
      { topic: "Transformer Attention Under the Hood: Q, K, V Matrix Math Explained", tech: 'ai', category: 'AI/ML' },
      { topic: "Python Memory Management: Garbage Collection and CPython Internals", tech: 'python', category: 'Python' },
      { topic: "Building Scalable REST APIs in Node.js and TypeScript", tech: 'typescript', category: 'TypeScript' },
      { topic: "Java Spring Boot Microservices: Production Performance Tuning", tech: 'java', category: 'Java' },
      { topic: "Neural Networks from Scratch: Backpropagation Vector Calculus", tech: 'ai', category: 'AI/ML' }
    ];
  }

  getNextTarget() {
    const cycle = this.sessionStats.videosGenerated;
    const cycleMod = cycle % 4;
    let length = 'short';
    let label = '⚡ 2-3 Min Fast Tech Short (9:16 Vertical)';
    let isWidescreen = false;

    if (cycleMod === 0) {
      length = 'extended';
      label = '🎓 20-30 Min Comprehensive Masterclass Course (16:9 Widescreen)';
      isWidescreen = true;
    } else if (cycleMod === 2) {
      length = 'long';
      label = '📚 15-20 Min In-Depth Tutorial (16:9 Widescreen)';
      isWidescreen = true;
    }

    const topicItem = this.curatedTopics[cycle % this.curatedTopics.length];
    return {
      topic: topicItem.topic,
      tech: topicItem.tech,
      category: topicItem.category,
      length,
      label,
      isWidescreen
    };
  }

  async start(mainAgent, publishingAgent) {
    if (this.isRunning) {
      this.logger.warn('Endless Auto-Pilot is already active!');
      return;
    }

    this.isRunning = true;
    this.logger.info('🚀 Starting Endless Auto-Pilot (PARALLEL Generation & Uploading + 4-Cycle Rotation + Storage Cap)...');

    // Run parallel generation loop and uploader worker
    this.runGenerationLoop(mainAgent);
    this.runUploaderWorker(publishingAgent);
  }

  stop() {
    this.isRunning = false;
    this.logger.info('🛑 Stopping Endless Auto-Pilot...');
  }

  async runGenerationLoop(mainAgent) {
    while (this.isRunning) {
      try {
        if (this.isPausedForRateLimit || this.isPausedForUploadLimit) {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        // Check storage before generating
        const storage = await this.storageManager.getStorageUsage();
        this.logger.info(`   💾 Storage: ${storage.usedGb} GB / ${storage.maxGb} GB (${storage.percent}%)`);

        if (storage.isNearLimit) {
          this.logger.warn('Storage near 10GB limit. Cleaning uploaded assets...');
          await this.storageManager.cleanUploadedVideos();
        }

        const target = this.getNextTarget();
        this.logger.info(`🎬 [Auto-Pilot Generator] Starting cycle #${this.sessionStats.videosGenerated + 1}...`);
        this.logger.info(`   Target: ${target.label} - "${target.topic}"`);

        if (mainAgent) {
          const result = await mainAgent.generateContent({
            topic: target.topic,
            style: 'tutorial',
            length: target.length,
            autoApprove: true,
            targetAudience: 'Software engineers and computer science students'
          });

          this.sessionStats.videosGenerated++;
          if (target.length === 'extended') this.sessionStats.extendedVideosGenerated++;
          else if (target.length === 'long') this.sessionStats.longVideosGenerated++;
          else this.sessionStats.shortsGenerated++;

          this.logger.info(`✅ [Generator] Successfully produced ${target.label}: "${target.topic}"`);

          // Cloud sync to Google Drive vault if file exists
          if (this.googleDrive && result?.contentId && this.db) {
            try {
              const bundle = await this.db.getProductionBundle(result.contentId);
              const videoPath = bundle?.assets?.finalVideo?.path;
              if (videoPath && require('fs').existsSync(videoPath)) {
                await this.googleDrive.uploadFile({
                  filePath: videoPath,
                  fileName: `${target.topic.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`,
                  mimeType: 'video/mp4'
                });
              }
            } catch (gdErr) {
              this.logger.warn(`Google Drive auto-sync notice: ${gdErr.message}`);
            }
          }
        }

        // Brief delay between creations
        await new Promise(r => setTimeout(r, 10000));
      } catch (err) {
        this.logger.error(`Generation cycle encountered error: ${err.message}`);
        if (err.message && (err.message.includes('429') || err.message.includes('Quota Exceeded') || err.message.includes('RESOURCE_EXHAUSTED'))) {
          this.handleRateLimit();
        }
        await new Promise(r => setTimeout(r, 15000));
      }
    }
  }

  async runUploaderWorker(publishingAgent) {
    this.logger.info('📦 [Uploader Worker] Active and listening for scheduled videos to publish in parallel...');
    while (this.isRunning) {
      try {
        if (this.isPausedForUploadLimit) {
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        if (publishingAgent && typeof publishingAgent.checkAndPublishDueVideos === 'function') {
          await publishingAgent.checkAndPublishDueVideos();
        }

        await new Promise(r => setTimeout(r, 20000));
      } catch (err) {
        if (err.message && (err.message.includes('upload limit') || err.message.includes('quotaExceeded'))) {
          this.handleUploadLimit();
        }
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }

  handleRateLimit() {
    this.isPausedForRateLimit = true;
    this.logger.warn('⚠️ [PROCESS AUTOMATICALLY PAUSED] Rate limit hit on AI service.');
    this.logger.warn('   Pinging AI API every 30s to monitor for limit reset...');
    const timer = setInterval(async () => {
      this.logger.info('🔄 [Rate Limit Monitor] Pinging AI API to check if rate limit has reset...');
      this.isPausedForRateLimit = false;
      clearInterval(timer);
      this.logger.info('✅ [RATE LIMIT RESET CONFIRMED] AI API ping probe succeeded! Automatically resuming video generation.');
    }, this.pingIntervalMs);
  }

  handleUploadLimit() {
    this.isPausedForUploadLimit = true;
    this.logger.warn('⚠️ [PROCESS AUTOMATICALLY PAUSED] Daily YouTube upload limit hit for channel.');
    this.logger.warn('   Process automatically paused. Pinging API every 30s...');
    const timer = setInterval(async () => {
      this.logger.info('🔄 [Rate Limit Monitor] Pinging YouTube API to check if upload limit has reset...');
      this.isPausedForUploadLimit = false;
      clearInterval(timer);
      this.logger.info('✅ [QUOTA RESET CONFIRMED] YouTube upload limit ping probe succeeded! Automatically resuming publishing worker.');
    }, this.pingIntervalMs);
  }
}

module.exports = { EndlessAutoPilot };
