#!/usr/bin/env node
/**
 * YouTube Duplicate Video Cleanup Script
 * 
 * Finds all duplicate videos (same title) on the YouTube channel,
 * keeps only the NEWEST one of each title, and deletes all older duplicates.
 * Also updates the local database to match.
 */
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { CredentialManager } = require('../utils/credential-manager');

const DB_PATH = path.join(__dirname, '..', 'data', 'youtube_automation.db');

async function main() {
  console.log('🔍 YouTube Duplicate Video Cleanup');
  console.log('═══════════════════════════════════\n');

  // 1. Connect to database and find duplicate published videos
  const db = new sqlite3.Database(DB_PATH);
  
  const duplicates = await new Promise((resolve, reject) => {
    db.all(`
      SELECT title, GROUP_CONCAT(youtube_id) as ids, COUNT(*) as cnt
      FROM publish_schedule 
      WHERE status = 'published' AND youtube_id IS NOT NULL AND youtube_id != ''
      GROUP BY title 
      HAVING cnt > 1
      ORDER BY cnt DESC
    `, (err, rows) => err ? reject(err) : resolve(rows));
  });

  if (duplicates.length === 0) {
    console.log('✅ No duplicate videos found. Channel is clean!');
    db.close();
    return;
  }

  console.log(`Found ${duplicates.length} titles with duplicates:\n`);
  
  let totalToDelete = 0;
  const deleteTargets = [];

  for (const dup of duplicates) {
    const ids = dup.ids.split(',');
    // Keep the LAST one (most recent), delete the rest
    const keepId = ids[ids.length - 1];
    const deleteIds = ids.slice(0, -1);
    totalToDelete += deleteIds.length;
    
    console.log(`  [${dup.cnt}x] ${dup.title}`);
    console.log(`    Keep: ${keepId}`);
    console.log(`    Delete: ${deleteIds.join(', ')}\n`);
    
    deleteTargets.push(...deleteIds.map(id => ({ id, title: dup.title })));
  }

  console.log(`\n📊 Summary: ${totalToDelete} duplicate videos to delete\n`);

  // 2. Initialize YouTube API client
  let youtube;
  try {
    const creds = new CredentialManager();
    await creds.initialize();
    youtube = creds.getYouTubeClient();
    console.log('✅ YouTube API client initialized\n');
  } catch (err) {
    console.error('❌ Failed to initialize YouTube API:', err.message);
    console.log('\n⚠️  Cannot delete from YouTube, but will clean local database.\n');
    youtube = null;
  }

  // 3. Delete duplicates from YouTube and update database
  let deleted = 0;
  let failed = 0;

  for (const target of deleteTargets) {
    try {
      if (youtube) {
        await youtube.videos.delete({ id: target.id });
        console.log(`  ✅ Deleted from YouTube: ${target.id} (${target.title})`);
      }
      
      // Update database: mark as deleted
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE publish_schedule SET status = 'deleted_duplicate', error_message = 'Removed as duplicate by cleanup script' WHERE youtube_id = ?`,
          [target.id],
          (err) => err ? reject(err) : resolve()
        );
      });
      deleted++;
    } catch (err) {
      console.log(`  ⚠️  Failed to delete ${target.id}: ${err.message}`);
      failed++;
    }
  }

  // 4. Also clean duplicate content_strategies entries (keep most recent)
  await new Promise((resolve, reject) => {
    db.run(`
      DELETE FROM content_strategies WHERE rowid NOT IN (
        SELECT MAX(rowid) FROM content_strategies GROUP BY topic
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const strategyCount = await new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as c FROM content_strategies', (err, row) => err ? reject(err) : resolve(row.c));
  });

  console.log(`\n═══════════════════════════════════`);
  console.log(`📊 Cleanup Results:`);
  console.log(`  ✅ Videos deleted: ${deleted}`);
  console.log(`  ⚠️  Failures: ${failed}`);
  console.log(`  📝 Unique strategies remaining: ${strategyCount}`);
  console.log(`═══════════════════════════════════\n`);

  db.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
