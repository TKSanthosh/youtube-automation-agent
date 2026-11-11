const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { chromium } = require('playwright');
const { Logger } = require('./logger');

const logger = new Logger('DynamicMemeService');

class DynamicMemeService {
  constructor() {
    this.historyFile = path.join(__dirname, '..', 'data', 'used_gifs.json');
    this.memesDir = path.join(__dirname, '..', 'assets', 'memes');
    this.ensureDirectories();
  }

  ensureDirectories() {
    try {
      if (!fs.existsSync(this.memesDir)) {
        fs.mkdirSync(this.memesDir, { recursive: true });
      }
      const dataDir = path.dirname(this.historyFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch (_e) { /* ignore */ }
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const raw = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        return {
          usedUrls: Array.isArray(raw.usedUrls) ? raw.usedUrls : [],
          history: Array.isArray(raw.history) ? raw.history : []
        };
      }
    } catch (e) {
      logger.warn(`Failed reading GIF history: ${e.message}`);
    }
    return { usedUrls: [], history: [] };
  }

  saveHistory(historyData) {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(historyData, null, 2));
    } catch (e) {
      logger.warn(`Failed saving GIF history: ${e.message}`);
    }
  }

  deriveSearchQuery(topic = '', headline = '') {
    const text = `${topic} ${headline}`.toLowerCase();

    if (text.includes('bug') || text.includes('error') || text.includes('fail') || text.includes('crash')) {
      return 'coding bug';
    }
    if (text.includes('deadlock') || text.includes('concurrency') || text.includes('thread') || text.includes('race')) {
      return 'software engineer stress';
    }
    if (text.includes('database') || text.includes('sql') || text.includes('query') || text.includes('redis')) {
      return 'server burning';
    }
    if (text.includes('cloud') || text.includes('devops') || text.includes('k8s') || text.includes('kubernetes') || text.includes('docker')) {
      return 'server on fire meme';
    }
    if (text.includes('raft') || text.includes('consensus') || text.includes('distributed') || text.includes('cluster')) {
      return 'programmer waiting for build';
    }
    if (text.includes('algo') || text.includes('dsa') || text.includes('tree') || text.includes('graph')) {
      return 'programmer mind blown';
    }
    if (text.includes('git') || text.includes('merge') || text.includes('conflict') || text.includes('pr')) {
      return 'git merge conflict meme';
    }
    if (text.includes('deploy') || text.includes('production') || text.includes('release')) {
      return 'deploying to production meme';
    }
    if (text.includes('senior') || text.includes('junior') || text.includes('interview')) {
      return 'junior vs senior developer';
    }
    if (text.includes('hack') || text.includes('security') || text.includes('auth') || text.includes('jwt')) {
      return 'hackerman typing fast';
    }

    const genericPool = [
      'programmer typing fast',
      'developer coding coffee',
      'programmer computer reaction',
      'programmer works on my machine',
      'coding meme'
    ];
    return genericPool[Math.floor(Math.random() * genericPool.length)];
  }

  async fetchFreshMemeGif({ topic = '', headline = '', fallbackName = 'this_is_fine' } = {}) {
    this.ensureDirectories();
    const history = this.loadHistory();
    const usedSet = new Set(history.usedUrls);

    const primaryQuery = this.deriveSearchQuery(topic, headline);
    const queryList = [
      primaryQuery,
      `${primaryQuery} meme`,
      'developer coding reaction',
      'software engineer meme',
      'programmer humor'
    ];

    let downloadedGifPath = null;
    let chosenUrl = null;
    let successfulQuery = null;

    logger.info(`Fetching fresh, dynamic internet meme GIF for: "${topic || headline}" (Initial Query: "${primaryQuery}")...`);

    let browser = null;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      for (const q of queryList) {
        try {
          const tenorUrl = `https://tenor.com/search/${encodeURIComponent(q)}-gifs`;
          await page.goto(tenorUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
          await page.waitForTimeout(1500);

          const gifUrls = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs
              .map(img => img.src)
              .filter(src => {
                if (!src) return false;
                const lower = src.toLowerCase();
                return (lower.includes('media.tenor.com') || lower.endsWith('.gif')) &&
                       !lower.includes('icon') &&
                       !lower.includes('logo') &&
                       !lower.includes('avatar') &&
                       !lower.includes('.svg');
              });
          });

          // Pick the first one that has NEVER been used before
          for (const u of gifUrls) {
            if (!usedSet.has(u)) {
              // Attempt download & validation
              const timestamp = Date.now();
              const sanitizedName = q.replace(/[^a-z0-9]/gi, '_').slice(0, 20);
              const targetFile = path.join(this.memesDir, `dynamic_${timestamp}_${sanitizedName}.gif`);

              const dlSuccess = await this.downloadFile(u, targetFile);
              if (dlSuccess && this.isValidGif(targetFile)) {
                downloadedGifPath = targetFile;
                chosenUrl = u;
                successfulQuery = q;
                break;
              } else if (fs.existsSync(targetFile)) {
                await fsPromises.unlink(targetFile).catch(() => {});
              }
            }
          }

          if (downloadedGifPath) {
            break;
          }
        } catch (queryErr) {
          logger.warn(`Search attempt for query "${q}" failed: ${queryErr.message}`);
        }
      }
    } catch (browserErr) {
      logger.warn(`Playwright internet GIF scraper notice: ${browserErr.message}`);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }

    if (downloadedGifPath && chosenUrl) {
      history.usedUrls.push(chosenUrl);
      history.history.push({
        url: chosenUrl,
        topic: topic || headline,
        query: successfulQuery,
        downloadedAt: new Date().toISOString(),
        filePath: downloadedGifPath
      });
      this.saveHistory(history);
      logger.info(`Fresh internet meme GIF downloaded: ${path.basename(downloadedGifPath)} (Query: "${successfulQuery}")`);
      return downloadedGifPath;
    }

    // Resilient Fallback: Rotate unused local assets if internet is unavailable
    logger.warn('Internet GIF fetch did not return new unique GIF; rotating local asset pool...');
    return this.getLocalUnusedFallback(fallbackName, history);
  }

  downloadFile(url, destPath) {
    return new Promise((resolve) => {
      const proto = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(destPath);
      const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) {
          file.close(() => {
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            resolve(false);
          });
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(true));
        });
      });
      req.on('error', () => {
        file.close(() => {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          resolve(false);
        });
      });
      req.on('timeout', () => {
        req.destroy();
        file.close(() => {
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          resolve(false);
        });
      });
    });
  }

  isValidGif(filePath) {
    try {
      if (!fs.existsSync(filePath)) return false;
      const stat = fs.statSync(filePath);
      if (stat.size < 15000) return false; // Must be at least 15KB

      const buf = Buffer.alloc(6);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buf, 0, 6, 0);
      fs.closeSync(fd);
      const header = buf.toString('ascii');
      return header.startsWith('GIF8');
    } catch (_e) {
      return false;
    }
  }

  getLocalUnusedFallback(fallbackName = 'this_is_fine', history = null) {
    const localCurated = [
      'this_is_fine.gif',
      'cat_typing.gif',
      'sweating.gif',
      'confused_travolta.gif',
      'typing_fast.gif',
      'mind_blown.gif',
      'head_desk.gif',
      'computer_smash.gif',
      'thumbs_up.gif'
    ];

    const usedLocal = new Set(
      (history?.history || [])
        .map(h => path.basename(h.filePath || ''))
        .filter(Boolean)
    );

    // Pick a local GIF that has been used least recently
    const unused = localCurated.filter(f => !usedLocal.has(f));
    const chosenFile = unused.length > 0 ? unused[0] : (fallbackName.endsWith('.gif') ? fallbackName : `${fallbackName}.gif`);
    const fullPath = path.join(this.memesDir, chosenFile);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return path.join(this.memesDir, 'this_is_fine.gif');
  }
}

module.exports = { DynamicMemeService };
