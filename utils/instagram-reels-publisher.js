const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

class InstagramReelsPublisher {
  constructor(options = {}) {
    this.sessionId = options.sessionId || process.env.INSTAGRAM_SESSION_ID;
    this.userId = options.userId || process.env.INSTAGRAM_USER_ID;
  }

  isConfigured() {
    return Boolean(this.sessionId);
  }

  async publishReel({ videoPath, caption, hashtags = [] }) {
    if (!this.isConfigured()) {
      console.log('ℹ️  Instagram session ID not configured. Skipping Instagram Reel publish.');
      return { skipped: true };
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found at: ${videoPath}`);
    }

    console.log(`\n📸 Starting Instagram Reel Publication...`);
    console.log(`   File: ${path.basename(videoPath)} (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(2)} MB)`);

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 }
      });

      const cookies = [
        {
          name: 'sessionid',
          value: this.sessionId,
          domain: '.instagram.com',
          path: '/'
        }
      ];

      if (this.userId) {
        cookies.push({
          name: 'ds_user_id',
          value: this.userId,
          domain: '.instagram.com',
          path: '/'
        });
      }

      await context.addCookies(cookies);
      const page = await context.newPage();
      page.setDefaultTimeout(60000);

      console.log('   🌐 Connecting to Instagram Web session...');
      await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);

      // Verify login state
      if (page.url().includes('/accounts/login')) {
        throw new Error('Instagram session ID has expired. Please update INSTAGRAM_SESSION_ID secret.');
      }

      // Dismiss any popups ("Turn on Notifications", "Save Login Info")
      try {
        const notNow = await page.$('button:has-text("Not Now"), button:has-text("Cancel")');
        if (notNow) await notNow.click();
      } catch (_) {}

      // Click "Create" or "+"
      console.log('   📤 Opening creation dialog...');
      const createSelector = 'svg[aria-label="New post"], svg[aria-label="Create"], [aria-label="New post"], a:has-text("Create")';
      await page.waitForSelector(createSelector, { timeout: 15000 });
      await page.click(createSelector);
      await page.waitForTimeout(2000);

      // If a dropdown shows ("Post"), click it
      try {
        const postOption = await page.$('span:has-text("Post"), [role="menuitem"]:has-text("Post")');
        if (postOption) await postOption.click();
        await page.waitForTimeout(1500);
      } catch (_) {}

      // File upload
      console.log('   📁 Uploading 9:16 vertical video...');
      const fileInputSelector = 'input[type="file"]';
      await page.waitForSelector(fileInputSelector, { timeout: 15000 });
      await page.setInputFiles(fileInputSelector, videoPath);
      await page.waitForTimeout(4000);

      // If "Video posts are now shared as reels" modal appears, click OK
      try {
        const okBtn = await page.$('button:has-text("OK")');
        if (okBtn) {
          await okBtn.click();
          await page.waitForTimeout(1000);
        }
      } catch (_) {}

      // Ensure 9:16 aspect ratio
      try {
        const cropBtn = await page.$('svg[aria-label="Select crop"], button[aria-label="Select crop"]');
        if (cropBtn) {
          await cropBtn.click();
          await page.waitForTimeout(800);
          const ratio916 = await page.$('button:has-text("9:16"), span:has-text("9:16")');
          if (ratio916) {
            await ratio916.click();
            await page.waitForTimeout(800);
          }
        }
      } catch (_) {}

      // Step 1: Click "Next" (Media -> Filters/Cover)
      console.log('   ⚙️  Configuring Reel specifications...');
      const nextBtnSelector = 'div[role="button"]:has-text("Next"), button:has-text("Next")';
      await page.waitForSelector(nextBtnSelector, { timeout: 15000 });
      await page.click(nextBtnSelector);
      await page.waitForTimeout(2500);

      // Step 2: Click "Next" (Filters/Cover -> Caption)
      const nextBtn2 = await page.$(nextBtnSelector);
      if (nextBtn2) {
        await nextBtn2.click();
        await page.waitForTimeout(2500);
      }

      // Step 3: Write Caption and Hashtags
      console.log('   ✍️  Adding caption and high-reach hashtags...');
      const tagsList = Array.isArray(hashtags) ? hashtags.join(' ') : String(hashtags || '');
      const fullCaption = `${caption || ''}\n\n${tagsList}\n#reels #coding #softwareengineering #developer #tech`.trim();

      const captionSelector = 'div[aria-label="Write a caption..."], div[role="textbox"][contenteditable="true"]';
      await page.waitForSelector(captionSelector, { timeout: 15000 });
      await page.click(captionSelector);
      await page.keyboard.type(fullCaption, { delay: 10 });
      await page.waitForTimeout(2000);

      // Step 4: Click "Share"
      console.log('   🚀 Publishing Reel to Instagram feed...');
      const shareSelector = 'div[role="button"]:has-text("Share"), button:has-text("Share")';
      await page.waitForSelector(shareSelector, { timeout: 15000 });
      await page.click(shareSelector);

      // Step 5: Wait for confirmation modal
      console.log('   ⏳ Waiting for Instagram upload processing...');
      await page.waitForSelector(
        'text=Your reel has been shared, text=Your post has been shared, img[alt="Animated checkmark"]',
        { timeout: 90000 }
      );

      console.log('   ✅ Instagram Reel successfully published!\n');
      return {
        success: true,
        platform: 'instagram_reels',
        publishedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error(`   ❌ Instagram publish notice: ${err.message}`);
      return {
        success: false,
        platform: 'instagram_reels',
        error: err.message
      };
    } finally {
      await browser.close();
    }
  }
}

module.exports = { InstagramReelsPublisher };
