#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const chalk = require('chalk');
const { Database } = require('../database/db');
const { CredentialManager } = require('../utils/credential-manager');
const { MasterclassGeneratorAgent } = require('../agents/masterclass-generator-agent');
const { AIVideoGenerator } = require('../utils/ai-video-generator');
const { PublishingSchedulingAgent } = require('../agents/publishing-scheduling-agent');
const { Logger } = require('../utils/logger');

const logger = new Logger('MasterclassPipeline');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    topic: null
  };

  for (const arg of args) {
    if (arg.startsWith('--topic=')) {
      options.topic = arg.split('=')[1];
    }
  }

  return options;
}

async function deleteMasterclassAssets(videoPath) {
  try {
    if (videoPath && fsSync.existsSync(videoPath)) {
      await fs.unlink(videoPath);
      logger.info(`Deleted temporary masterclass video asset: ${path.basename(videoPath)}`);
    }
  } catch (err) {
    logger.warn(`Asset deletion warning: ${err.message}`);
  }
}

async function run() {
  const options = parseArgs();
  console.log(chalk.cyan.bold(`\n🎓 Weekly YouTube Masterclass Pipeline: Create ➔ Upload ➔ Delete`));
  console.log(chalk.gray(`Format: 16:9 Full HD Landscape (1080p) • Comprehensive Multi-Chapter Curriculum`));
  console.log(chalk.gray(`Pedagogy: Natural conversational instructor narration with slide references & code examples`));
  console.log(chalk.gray(`Rule: Zero persistent storage. Media files are purged immediately after publishing.`));
  console.log(chalk.gray('═'.repeat(70)));

  const db = new Database();
  await db.initialize();

  const credentials = new CredentialManager();
  await credentials.initialize();

  const masterclassAgent = new MasterclassGeneratorAgent(db, credentials);
  const videoGenerator = new AIVideoGenerator(credentials, { db });
  const publishingAgent = new PublishingSchedulingAgent(db, credentials);

  await masterclassAgent.initialize();
  await publishingAgent.initialize();

  // 1. Generate full curriculum & teacher lecture scripts
  logger.info('Designing course curriculum & writing instructor lecture...');
  const course = await masterclassAgent.generateMasterclass(options.topic);

  console.log(chalk.green.bold(`\n📚 Course: ${course.title}`));
  console.log(chalk.white(`   Chapters: ${course.chapters.length}`));
  console.log(chalk.white(`   Estimated Duration: ~${course.formattedDuration}`));
  console.log(chalk.gray(`\nTimestamps Preview:`));
  for (const ts of course.timestamps) {
    console.log(chalk.gray(`   ${ts.timestamp} - ${ts.title}`));
  }

  // 2. Render 16:9 Masterclass Video
  const videoDir = path.join(__dirname, '..', 'data', 'videos');
  await fs.mkdir(videoDir, { recursive: true });
  const videoPath = path.join(videoDir, `masterclass_${Date.now()}.mp4`);

  let youtubeUrl = null;
  try {
    console.log(chalk.blue.bold(`\n🎥 Rendering 16:9 Multi-Chapter Masterclass Video (Playwright + FFmpeg)...`));
    await videoGenerator.generateMasterclassVideo(course, videoPath);

    const stats = fsSync.statSync(videoPath);
    console.log(chalk.green(`   🎬 Video rendered successfully (${(stats.size / 1024 / 1024).toFixed(2)} MB)`));

    // 3. Prepare SEO Metadata & Timestamps
    const description = masterclassAgent.formatYouTubeDescription(course);
    const tags = [
      course.shortTopic,
      'Masterclass',
      'FullCourse',
      'Programming',
      'DevOps',
      'SoftwareEngineering',
      'SystemDesign',
      'ComputerScience',
      'Tutorial'
    ];

    const scheduleEntry = {
      productionId: `masterclass_${Date.now()}`,
      publishTime: null,
      metadata: {
        seo: {
          title: course.title.slice(0, 95),
          description,
          tags,
          categoryId: '27' // Education
        },
        video: { path: videoPath },
        privacyStatus: process.env.DEFAULT_PRIVACY_STATUS || 'public',
        containsSyntheticMedia: true
      }
    };

    // 4. Upload to YouTube
    logger.info('Uploading Masterclass to YouTube channel...');
    const uploadRes = await publishingAgent.uploadToYouTube(scheduleEntry);
    youtubeUrl = `https://www.youtube.com/watch?v=${uploadRes.id}`;
    console.log(chalk.green.bold(`\n✅ MASTERCLASS UPLOAD SUCCESSFUL: ${youtubeUrl}`));
  } catch (err) {
    logger.error(`Masterclass execution failed: ${err.message}`, err);
    throw err;
  } finally {
    // 5. Purge temporary video file immediately
    await deleteMasterclassAssets(videoPath);
    console.log(chalk.gray(`   🗑️  Temporary masterclass files purged. Zero storage retained.\n`));
  }

  process.exit(0);
}

run().catch(err => {
  logger.error('Fatal error in Masterclass pipeline:', err);
  process.exit(1);
});
