const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { Logger } = require('./logger');

class StorageManager {
  constructor(db, options = {}) {
    this.db = db;
    this.logger = new Logger('StorageManager');
    this.maxStorageBytes = options.maxStorageBytes || 10 * 1024 * 1024 * 1024; // 10 GB
    this.dataDir = options.dataDir || path.join(__dirname, '..', 'data');
    this.videosDir = path.join(this.dataDir, 'videos');
    this.audioDir = path.join(this.dataDir, 'audio');
    this.assetsDir = path.join(this.dataDir, 'assets');
  }

  async getStorageUsage() {
    let totalBytes = 0;
    const dirs = [this.videosDir, this.audioDir, this.assetsDir];

    for (const dir of dirs) {
      if (fsSync.existsSync(dir)) {
        totalBytes += await this.getDirSize(dir);
      }
    }

    const usedGb = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
    const maxGb = (this.maxStorageBytes / (1024 * 1024 * 1024)).toFixed(2);
    const percent = ((totalBytes / this.maxStorageBytes) * 100).toFixed(1);

    return {
      totalBytes,
      usedGb: parseFloat(usedGb),
      maxGb: parseFloat(maxGb),
      percent: parseFloat(percent),
      isNearLimit: totalBytes >= (this.maxStorageBytes * 0.9)
    };
  }

  async getDirSize(dirPath) {
    let size = 0;
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
          size += await this.getDirSize(fullPath);
        } else if (file.isFile()) {
          const stat = await fs.stat(fullPath);
          size += stat.size;
        }
      }
    } catch (_err) {}
    return size;
  }

  async cleanUploadedVideos() {
    this.logger.info('Scanning database for uploaded videos to clean up local storage...');
    let deletedCount = 0;
    let freedBytes = 0;

    try {
      if (!this.db || !this.db.db) {
        return { deletedCount: 0, freedBytes: 0 };
      }

      const uploadedRows = await new Promise((resolve, reject) => {
        this.db.db.all(
          "SELECT id, metadata FROM publish_schedule WHERE status IN ('uploaded', 'published')",
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      for (const row of uploadedRows) {
        let meta;
        try {
          meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        } catch (_e) {
          continue;
        }

        if (!meta) continue;

        const filesToCheck = [
          meta.video?.path,
          meta.audio?.path,
          meta.captions?.path,
          meta.video?.path ? `${meta.video.path}.assembly.json` : null,
          meta.video?.path ? meta.video.path.replace(/\.mp4$/, '_visual.mp4') : null
        ].filter(Boolean);

        for (const filePath of filesToCheck) {
          try {
            if (fsSync.existsSync(filePath)) {
              const stat = await fs.stat(filePath);
              await fs.unlink(filePath);
              freedBytes += stat.size;
              deletedCount++;
            }
          } catch (_e) {}
        }
      }

      this.logger.info(`Cleanup complete: deleted ${deletedCount} files, freed ${(freedBytes / (1024 * 1024)).toFixed(2)} MB`);
      return { deletedCount, freedBytes };
    } catch (err) {
      this.logger.error('Error during cleanUploadedVideos:', err);
      return { deletedCount, freedBytes, error: err.message };
    }
  }
}

module.exports = { StorageManager };
