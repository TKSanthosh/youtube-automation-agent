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

    let browser;
    try {
      browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      console.log('   🚀 Launched Chrome browser engine for full H.264 video codec support.');
    } catch (launchErr) {
      console.log(`   Notice: system chrome channel unavailable (${launchErr.message}), falling back to default chromium...`);
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 960 }
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

      const pageUrl = page.url();
      const pageTitle = await page.title().catch(() => 'Instagram');
      console.log(`   🌐 Connected: ${pageUrl} ("${pageTitle}")`);

      // Verify login state
      if (pageUrl.includes('/accounts/login')) {
        throw new Error('Instagram session ID has expired. Please update INSTAGRAM_SESSION_ID secret.');
      }

      // Dismiss Cookie Consent & Interstitial banners common on cloud runners
      try {
        const consentBtn = await page.$('button:has-text("Allow all cookies"), button:has-text("Allow essential and optional cookies"), button:has-text("Decline optional cookies"), button:has-text("Accept All"), button:has-text("Only allow essential cookies")');
        if (consentBtn) {
          console.log('   🍪 Dismissing Instagram cookie consent banner...');
          await consentBtn.click();
          await page.waitForTimeout(2000);
        }
      } catch (_) {}

      // Dismiss any popups ("Turn on Notifications", "Save Login Info")
      try {
        const notNow = await page.$('button:has-text("Not Now"), button:has-text("Cancel")');
        if (notNow) await notNow.click();
      } catch (_) {}

      // Click "Create" or "+"
      console.log('   📤 Opening creation dialog...');
      let menuOpened = false;
      try {
        const clickedCreate = await page.evaluate(() => {
          const createBtn = document.querySelector('a[role="link"]:has(svg[aria-label="New post"])') 
            || document.querySelector('svg[aria-label="New post"]')?.closest('a')
            || document.querySelector('svg[aria-label="Create"]')?.closest('a')
            || Array.from(document.querySelectorAll('a, button, div[role="button"]')).find(el => el.innerText.trim() === 'Create');
          if (createBtn) {
            createBtn.focus();
            createBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            createBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            createBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return true;
          }
          return false;
        });
        await page.waitForTimeout(2500);

        // In modern Instagram Web, clicking Create opens a menu popup with "Post"
        const clickedPost = await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll('*'));
          const postEl = all.find(el => el.innerText === 'Post' && el.children.length === 0);
          if (postEl) {
            const target = postEl.closest('a') || postEl.closest('div[role="button"]') || postEl;
            target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return true;
          }
          return false;
        });
        if (clickedPost) menuOpened = true;
        await page.waitForTimeout(2500);
      } catch (_) {}

      // If menu was not opened by dispatch, try direct Playwright click
      if (!menuOpened) {
        try {
          const createLocator = page.locator('a[role="link"]:has(svg[aria-label="New post"]), a:has-text("Create"), svg[aria-label="New post"]').first();
          if (await createLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
            await createLocator.click();
            await page.waitForTimeout(2000);
            const postLocator = page.locator('span:has-text("Post"), a:has-text("Post")').first();
            if (await postLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
              await postLocator.click();
              await page.waitForTimeout(2000);
            }
          }
        } catch (_) {}
      }

      // File upload
      console.log('   📁 Uploading 9:16 vertical video...');
      let uploaded = false;

      // 1. Direct file input (Instagram attaches a hidden input[type="file"] in the modal)
      try {
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.waitFor({ state: 'attached', timeout: 12000 });
        await fileInput.setInputFiles(videoPath);
        uploaded = true;
      } catch (uploadErr) {
        const debugText = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n+/g, ' ')).catch(() => '');
        console.log(`   Notice: direct file input wait: ${uploadErr.message}. URL: ${page.url()} | Page preview: "${debugText}". Trying 'Select from computer'...`);
      }

      // 2. Fallback: "Select from computer" button with filechooser event
      if (!uploaded) {
        try {
          const selectBtn = page.locator('button:has-text("Select from computer"), [role="button"]:has-text("Select from computer"), button:has-text("Select from device")').first();
          if (await selectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null),
              selectBtn.click()
            ]);
            if (fileChooser) {
              await fileChooser.setFiles(videoPath);
              uploaded = true;
            }
          }
        } catch (selErr) {
          console.log(`   Notice: select button filechooser failed: ${selErr.message}`);
        }
      }

      if (!uploaded) {
        throw new Error('Failed to attach video to Instagram creation dialog');
      }
      await page.waitForTimeout(5000);

      // Check for upload error modal
      const modalText = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        return modal ? modal.innerText : '';
      });
      if (modalText.includes("couldn't be uploaded") || modalText.includes("could not be read")) {
        throw new Error(`Instagram rejected video format or codec: ${modalText.substring(0, 150)}`);
      }

      // If "Video posts are now shared as reels" modal appears, click OK
      try {
        const okBtn = await page.$('button:has-text("OK"), button:has-text("Dismiss")');
        if (okBtn) {
          await okBtn.click();
          await page.waitForTimeout(1000);
        }
      } catch (_) {}

      // Ensure 9:16 / Original vertical aspect ratio
      try {
        const cropBtn = await page.$('button[aria-label="Select crop"], svg[aria-label="Select crop"], [aria-label="Select Crop"]');
        if (cropBtn) {
          await cropBtn.click();
          await page.waitForTimeout(1000);
          const ratioBtn = await page.$('button:has-text("9:16"), span:has-text("9:16"), button:has-text("Original"), span:has-text("Original")');
          if (ratioBtn) {
            await ratioBtn.click();
            await page.waitForTimeout(1000);
          }
        }
      } catch (_) {}

      // Step 1: Click "Next" (Media -> Filters/Cover)
      console.log('   ⚙️  Configuring Reel specifications...');
      const nextBtnSelector = 'div[role="button"]:has-text("Next"), button:has-text("Next"), [aria-label="Next"]';
      await page.waitForSelector(nextBtnSelector, { state: 'visible', timeout: 25000 });
      await page.click(nextBtnSelector);
      await page.waitForTimeout(3000);

      // Step 2: Click "Next" (Filters/Cover -> Caption)
      try {
        const nextBtn2 = await page.waitForSelector(nextBtnSelector, { state: 'visible', timeout: 10000 });
        if (nextBtn2) {
          await nextBtn2.click();
          await page.waitForTimeout(3000);
        }
      } catch (_) {}

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
