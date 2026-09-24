const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { Logger } = require('./logger');

class GoogleDriveService {
  constructor(options = {}) {
    this.logger = new Logger('GoogleDriveService');
    this.folderName = options.folderName || process.env.GOOGLE_DRIVE_FOLDER || 'YouTube Automation Vault';
    this.folderId = options.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || null;
    this.enabled = process.env.ENABLE_GOOGLE_DRIVE === 'true' || options.enabled === true;
    this.driveClient = null;
  }

  isConfigured() {
    return Boolean(process.env.GOOGLE_DRIVE_REFRESH_TOKEN) ||
           Boolean(process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_PRIVATE_KEY) ||
           Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  isEnabled() {
    return this.enabled;
  }

  async initialize() {
    if (!this.isConfigured()) {
      this.logger.info('Google Drive credentials not configured. Running in fallback/simulation mode.');
      return false;
    }
    try {
      if (process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET,
          'urn:ietf:wg:oauth:2.0:oob'
        );
        oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
        this.driveClient = google.drive({ version: 'v3', auth: oauth2Client });
        return true;
      }

      if (process.env.GOOGLE_DRIVE_CLIENT_EMAIL && process.env.GOOGLE_DRIVE_PRIVATE_KEY) {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n')
          },
          scopes: ['https://www.googleapis.com/auth/drive']
        });
        this.driveClient = google.drive({ version: 'v3', auth });
      }
      return true;
    } catch (err) {
      this.logger.warn(`Google Drive initialization failed: ${err.message}`);
      return false;
    }
  }

  async uploadFile({ filePath, fileName, mimeType }) {
    this.logger.info(`Uploading file to Google Drive: ${fileName || path.basename(filePath)}`);
    if (!this.driveClient) {
      const mockId = `gdrive_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return {
        id: mockId,
        name: fileName || path.basename(filePath),
        webViewLink: `https://drive.google.com/file/d/${mockId}/view?usp=sharing`,
        simulated: true
      };
    }

    try {
      const response = await this.driveClient.files.create({
        requestBody: {
          name: fileName || path.basename(filePath),
          parents: this.folderId ? [this.folderId] : []
        },
        media: {
          mimeType: mimeType || 'application/octet-stream',
          body: fsSync.createReadStream(filePath)
        },
        fields: 'id, name, webViewLink'
      });
      return response.data;
    } catch (err) {
      this.logger.error(`Google Drive upload failed: ${err.message}`);
      throw err;
    }
  }

  async syncProductionBundle({ title, videoPath, script, thumbnailPath, metadata }) {
    this.logger.info(`Syncing production bundle to Google Drive: "${title}"`);
    try {
      const safeTitle = (title || 'untitled').replace(/[^a-z0-9]/gi, '_');
      let videoResult = null;
      let thumbnailResult = null;

      if (videoPath && fsSync.existsSync(videoPath)) {
        videoResult = await this.uploadFile({
          filePath: videoPath,
          fileName: `${safeTitle}.mp4`,
          mimeType: 'video/mp4'
        });
      }

      if (thumbnailPath && fsSync.existsSync(thumbnailPath)) {
        thumbnailResult = await this.uploadFile({
          filePath: thumbnailPath,
          fileName: `${safeTitle}_thumbnail.jpg`,
          mimeType: 'image/jpeg'
        });
      }

      return {
        status: 'synced',
        title,
        videoLink: videoResult?.webViewLink || null,
        thumbnailLink: thumbnailResult?.webViewLink || null,
        syncedAt: new Date().toISOString()
      };
    } catch (err) {
      this.logger.warn(`Failed to sync bundle to Google Drive: ${err.message}`);
      return { status: 'failed', error: err.message };
    }
  }
}

module.exports = { GoogleDriveService };
