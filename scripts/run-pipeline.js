#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const chalk = require('chalk');
const { Database } = require('../database/db');
const { CredentialManager } = require('../utils/credential-manager');
const { ContentStrategyAgent } = require('../agents/content-strategy-agent');
const { ScriptWriterAgent } = require('../agents/script-writer-agent');
const { ThumbnailDesignerAgent } = require('../agents/thumbnail-designer-agent');
const { SEOOptimizerAgent } = require('../agents/seo-optimizer-agent');
const { ProductionManagementAgent } = require('../agents/production-management-agent');
const { PublishingSchedulingAgent } = require('../agents/publishing-scheduling-agent');
const { Logger } = require('../utils/logger');

const logger = new Logger('DirectPipeline');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    count: 1,
    topic: null,
    length: 'short',
    style: 'tutorial'
  };

  for (const arg of args) {
    if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1], 10) || 1;
    } else if (arg.startsWith('--topic=')) {
      options.topic = arg.split('=')[1];
    } else if (arg.startsWith('--length=')) {
      options.length = arg.split('=')[1];
    } else if (arg.startsWith('--style=')) {
      options.style = arg.split('=')[1];
    }
  }

  return options;
}

function isQuotaExceededError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const errors = err.errors || err.response?.data?.error?.errors || [];
  const reasons = errors.map(e => (e.reason || '').toLowerCase());
  return (
    reasons.includes('quotaexceeded') ||
    reasons.includes('dailylimitexceeded') ||
    reasons.includes('uploadlimitexceeded') ||
    msg.includes('quotaexceeded') ||
    msg.includes('quota') ||
    msg.includes('upload limit') ||
    (err.status === 403 && (msg.includes('exceeded') || msg.includes('limit')))
  );
}

// Immediate purge of all generated media files
async function deleteMediaAssets(productionData) {
  try {
    const videoPath = productionData?.assets?.finalVideo?.path;
    const audioPath = productionData?.assets?.audio?.path;
    const thumbnailPath = productionData?.assets?.thumbnail?.path;
    const captionsPath = productionData?.assets?.captions?.path;

    const filesToDelete = [
      videoPath,
      audioPath,
      thumbnailPath,
      captionsPath,
      videoPath ? `${videoPath}.assembly.json` : null,
      videoPath ? videoPath.replace(/\.mp4$/, '_visual.mp4') : null,
      videoPath ? videoPath.replace(/\.mp4$/, '.wav') : null
    ].filter(Boolean);

    for (const f of filesToDelete) {
      if (fsSync.existsSync(f)) {
        await fs.unlink(f);
        logger.info(`Deleted temporary asset: ${path.basename(f)}`);
      }
    }
  } catch (err) {
    logger.warn(`Asset deletion cleanup warning: ${err.message}`);
  }
}

// Also purge any temp folders to ensure zero persistence
async function purgeTempFolders() {
  const dirs = [
    path.join(__dirname, '..', 'temp'),
    path.join(__dirname, '..', 'data', 'videos'),
    path.join(__dirname, '..', 'data', 'audio')
  ];

  for (const dir of dirs) {
    try {
      if (fsSync.existsSync(dir)) {
        const files = await fs.readdir(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            await fs.unlink(filePath);
          }
        }
      }
    } catch (err) {
      // Ignore directory cleanup errors
    }
  }
}

async function run() {
  const options = parseArgs();
  console.log(chalk.cyan.bold(`\n🎬 GitHub Direct Pipeline: Create ➔ Upload to YouTube ➔ Delete`));
  console.log(chalk.gray(`Target Count: ${options.count} video(s)`));
  console.log(chalk.gray('Rule: No permanent storage. Videos are immediately purged after upload.'));
  console.log(chalk.gray('Rule: If YouTube upload limit hits, stop immediately and do not generate more.'));
  console.log(chalk.gray('═'.repeat(65)));

  const db = new Database();
  await db.initialize();

  const credentials = new CredentialManager();
  await credentials.initialize();

  const strategyAgent = new ContentStrategyAgent(db, credentials);
  const scriptAgent = new ScriptWriterAgent(db, credentials);
  const thumbnailAgent = new ThumbnailDesignerAgent(db, credentials);
  const seoAgent = new SEOOptimizerAgent(db, credentials);
  const productionAgent = new ProductionManagementAgent(db, credentials);
  const publishingAgent = new PublishingSchedulingAgent(db, credentials);

  await strategyAgent.initialize();
  await scriptAgent.initialize();
  await thumbnailAgent.initialize();
  await seoAgent.initialize();
  await productionAgent.initialize();
  await publishingAgent.initialize();

  const results = [];

  for (let i = 1; i <= options.count; i++) {
    console.log(chalk.blue.bold(`\n🎥 [Video ${i}/${options.count}] Starting Production Cycle...`));
    const cycleStart = Date.now();
    let productionData = null;

    try {
      // 1. Generate Strategy & Topic
      logger.info('Brainstorming topic & strategy...');
      const strategy = await strategyAgent.generateContentStrategy(options.topic);
      console.log(chalk.white(`   📌 Topic: ${strategy.topic}`));

      // 2. Generate Script
      logger.info('Writing script & narration...');
      const script = await scriptAgent.generateScript(strategy);
      console.log(chalk.white(`   📝 Title: ${script.title}`));

      // 3. Generate Thumbnail
      logger.info('Designing thumbnail...');
      const thumbnail = await thumbnailAgent.generateThumbnail(script);

      // 4. Generate SEO Metadata
      logger.info('Generating SEO tags & description...');
      const seo = await seoAgent.optimize(script, strategy);

      // 5. Produce Video (FFmpeg + TTS + Visuals)
      logger.info('Rendering video and audio locally...');
      productionData = await productionAgent.processContent({
        strategy,
        script,
        thumbnail,
        seo,
        jobId: `job_${Date.now()}`
      });

      const videoPath = productionData?.assets?.finalVideo?.path;
      const thumbnailPath = productionData?.assets?.thumbnail?.path;

      if (!videoPath || !fsSync.existsSync(videoPath)) {
        logger.warn(`No valid video rendered for "${script.title}". Skipping cycle.`);
        await deleteMediaAssets(productionData);
        continue;
      }

      console.log(chalk.green(`   🎬 Video rendered successfully (${(fsSync.statSync(videoPath).size / 1024 / 1024).toFixed(2)} MB)`));

      // 6. Direct Upload to YouTube
      logger.info('Uploading directly to YouTube...');
      const scheduleEntry = {
        productionId: productionData.id,
        publishTime: new Date().toISOString(),
        metadata: {
          seo,
          thumbnail: { path: thumbnailPath },
          video: { path: videoPath },
          privacyStatus: process.env.DEFAULT_PRIVACY_STATUS || 'public',
          containsSyntheticMedia: true
        }
      };

      let youtubeUrl = null;
      try {
        const uploadRes = await publishingAgent.uploadToYouTube(scheduleEntry);
        youtubeUrl = `https://www.youtube.com/watch?v=${uploadRes.id}`;
        console.log(chalk.green.bold(`   ✅ UPLOAD SUCCESSFUL: ${youtubeUrl}`));

        results.push({
          title: script.title,
          status: 'PUBLISHED',
          url: youtubeUrl,
          durationSec: Math.round((Date.now() - cycleStart) / 1000)
        });
      } catch (uploadError) {
        if (isQuotaExceededError(uploadError)) {
          console.log(chalk.yellow.bold(`\n⚠️  GOOGLE YOUTUBE UPLOAD LIMIT REACHED (Daily quota exhausted).`));
          console.log(chalk.yellow(`🛑 Stopping pipeline immediately. No more videos will be generated today.`));
          console.log(chalk.yellow(`   The next scheduled run will resume after quota resets at midnight Pacific Time.\n`));

          // Delete current video assets immediately
          await deleteMediaAssets(productionData);
          await purgeTempFolders();

          results.push({
            title: script.title,
            status: 'STOPPED_QUOTA_REACHED',
            url: 'None',
            durationSec: Math.round((Date.now() - cycleStart) / 1000)
          });

          // BREAK THE LOOP IMMEDIATELY - DO NOT GENERATE ANY MORE VIDEOS
          break;
        } else {
          console.log(chalk.red(`   ❌ Upload failed: ${uploadError.message}`));
          results.push({
            title: script.title,
            status: `ERROR: ${uploadError.message}`,
            url: 'None',
            durationSec: Math.round((Date.now() - cycleStart) / 1000)
          });
        }
      }

    } catch (cycleError) {
      logger.error(`Cycle error: ${cycleError.message}`);
    } finally {
      // 7. ALWAYS DELETE VIDEO FILES IMMEDIATELY POST-CYCLE
      if (productionData) {
        await deleteMediaAssets(productionData);
      }
      await purgeTempFolders();
      console.log(chalk.gray(`   🗑️  Temporary media files deleted. Zero storage retained.`));
    }
  }

  // Summary
  console.log(chalk.cyan.bold('\n📊 Pipeline Run Summary'));
  console.log(chalk.gray('═'.repeat(65)));
  for (const r of results) {
    console.log(chalk.white(`• "${r.title}"`));
    console.log(chalk.gray(`  Result: `) + (r.status === 'PUBLISHED' ? chalk.green(r.url) : chalk.yellow(r.status)));
  }
  console.log(chalk.gray('═'.repeat(65)));

  process.exit(0);
}

run().catch(err => {
  logger.error('Fatal error in pipeline:', err);
  process.exit(1);
});
