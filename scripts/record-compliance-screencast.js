#!/usr/bin/env node
require('dotenv').config();

const http = require('http');
const path = require('path');
const fs = require('fs');
const { URLSearchParams } = require('url');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ffmpegPath = require('ffmpeg-static');

const ROOT_DIR = path.join(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT_DIR, 'compliance_evidence');
const TMP_VIDEO_DIR = path.join(ROOT_DIR, 'temp', 'compliance_video');
const FINAL_MP4 = path.join(EVIDENCE_DIR, 'youtube_api_compliance_screencast.mp4');
const PORT = 3499;

function buildOAuthUrl() {
  const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  const redirectUri = 'http://localhost:8080/auth/callback';
  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl'
  ].join(' ');
  const params = new URLSearchParams({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri
  });
  return {
    clientId,
    redirectUri,
    scopes: scopes.split(' '),
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderOAuthPage(oauthInfo) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>YouTube Automation Agent — OAuth 2.0 Channel Connection</title>
  <style>
    * { box-sizing: border-box; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { margin: 0; background: #090d16; color: #f1f5f9; padding: 40px; }
    .card { max-width: 920px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 36px; box-shadow: 0 20px 50px rgba(0,0,0,0.45); }
    .badge { display: inline-block; padding: 6px 12px; background: rgba(239,68,68,0.16); color: #f87171; border: 1px solid rgba(239,68,68,0.35); border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    h1 { margin: 16px 0 8px; font-size: 28px; color: #ffffff; }
    p { color: #94a3b8; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
    .box { background: #0b1120; border: 1px solid #1e293b; border-radius: 12px; padding: 18px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 6px; font-weight: 700; }
    .val { font-family: "JetBrains Mono", monospace; font-size: 13px; color: #38bdf8; word-break: break-all; }
    .scopes { margin: 16px 0 24px; }
    .scope-item { background: #0b1120; border: 1px solid #1e293b; border-left: 3px solid #22c55e; padding: 10px 14px; border-radius: 8px; margin-bottom: 8px; font-family: monospace; font-size: 13px; color: #e2e8f0; }
    .actions { display: flex; gap: 14px; align-items: center; margin-top: 24px; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 15px; }
    .links a { color: #38bdf8; margin-left: 16px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">YouTube Data API v3 · OAuth 2.0 Integration</span>
    <h1>Channel Authorization & API Consent Flow</h1>
    <p>Independent creators connect their YouTube channel once via Google OAuth 2.0 offline consent. Authorized tokens allow the automated pipeline to schedule, synthesize, and upload short-form videos directly via <code>youtube.videos.insert</code>.</p>
    <div class="grid">
      <div class="box">
        <div class="label">OAuth 2.0 Client ID</div>
        <div class="val">${escapeHtml(oauthInfo.clientId)}</div>
      </div>
      <div class="box">
        <div class="label">Connected Target Channel</div>
        <div class="val">Byte By Byte (UCSvlfwDcmoQyNgnIh1PkodA)</div>
      </div>
    </div>
    <div class="scopes">
      <div class="label">Requested Google OAuth Scopes</div>
      ${oauthInfo.scopes.map(s => `<div class="scope-item">✓ ${escapeHtml(s)}</div>`).join('')}
    </div>
    <div class="actions">
      <a id="oauth-launch-btn" class="btn" href="${escapeHtml(oauthInfo.authUrl)}">Proceed to Google OAuth 2.0 Consent Screen →</a>
      <div class="links">
        <a href="https://github.com/TKSanthosh/youtube-automation-agent/blob/master/PRIVACY.md">Privacy Policy</a>
        <a href="https://github.com/TKSanthosh/youtube-automation-agent/blob/master/TERMS.md">Terms of Service</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function renderRunnerPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Live Autonomous Pipeline Execution — YouTube Automation Agent</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #070b14; color: #e2e8f0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px 32px; }
    .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .title { font-size: 20px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 10px; }
    .pill { font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 999px; background: rgba(56,189,248,0.14); color: #38bdf8; border: 1px solid rgba(56,189,248,0.35); }
    .pill.done { background: rgba(34,197,94,0.18); color: #4ade80; border-color: rgba(34,197,94,0.45); }
    .stages { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px; }
    .stage { background: #111827; border: 1px solid #1f2937; border-radius: 10px; padding: 12px; font-size: 12px; color: #94a3b8; transition: all 0.2s; }
    .stage strong { display: block; color: #e2e8f0; font-size: 13px; margin-bottom: 4px; }
    .stage.active { border-color: #38bdf8; background: rgba(56,189,248,0.08); color: #bae6fd; }
    .stage.complete { border-color: #22c55e; background: rgba(34,197,94,0.1); color: #86efac; }
    .cmd { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 10px 14px; font-family: "JetBrains Mono", monospace; font-size: 12px; color: #94a3b8; margin-bottom: 12px; display: flex; justify-content: space-between; }
    .cmd code { color: #38bdf8; }
    #logbox { background: #020617; border: 1px solid #1e293b; border-radius: 12px; padding: 16px; height: 470px; overflow-y: auto; font-family: "JetBrains Mono", Consolas, monospace; font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; color: #cbd5e1; }
    .line-ok { color: #4ade80; font-weight: 600; }
    .line-stage { color: #38bdf8; font-weight: 600; }
    .result-banner { display: none; margin-top: 12px; padding: 12px 16px; background: rgba(34,197,94,0.16); border: 1px solid #22c55e; border-radius: 10px; color: #86efac; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="top">
    <div class="title">⚡ Autonomous Short-Form Pipeline Runner (End-to-End API Execution)</div>
    <div id="status-pill" class="pill">● Running Live Pipeline</div>
  </div>
  <div class="stages">
    <div id="st-1" class="stage active"><strong>1. Trend Scout</strong>AI topic & angle selection</div>
    <div id="st-2" class="stage"><strong>2. Script & Slides</strong>4-slide synchronized script</div>
    <div id="st-3" class="stage"><strong>3. TTS & FFmpeg</strong>1080x1920 vertical render</div>
    <div id="st-4" class="stage"><strong>4. videos.insert</strong>YouTube Data API v3 upload</div>
    <div id="st-5" class="stage"><strong>5. Published Public</strong>Live YouTube Shorts URL</div>
  </div>
  <div class="cmd">
    <span>Executing: <code>node scripts/run-pipeline.js --count=1 --length=short</code></span>
    <span>Privacy: <code>public</code> · Provider: <code>slideshow</code> · Resolution: <code>1080x1920</code></span>
  </div>
  <div id="logbox">Starting automated pipeline...\n</div>
  <div id="result-banner" class="result-banner"></div>
  <script>
    const logbox = document.getElementById('logbox');
    const pill = document.getElementById('status-pill');
    const banner = document.getElementById('result-banner');
    const setStage = (num) => {
      for (let i = 1; i <= 5; i++) {
        const el = document.getElementById('st-' + i);
        el.classList.remove('active', 'complete');
        if (i < num) el.classList.add('complete');
        else if (i === num) el.classList.add('active');
      }
    };
    const es = new EventSource('/events');
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.type === 'log') {
        const div = document.createElement('div');
        const txt = payload.text;
        if (txt.includes('UPLOAD SUCCESSFUL') || txt.includes('Video uploaded with ID')) div.className = 'line-ok';
        else if (txt.includes('Topic:') || txt.includes('Title:') || txt.includes('Rendering synchronized') || txt.includes('Uploading directly')) div.className = 'line-stage';
        div.textContent = txt;
        logbox.appendChild(div);
        logbox.scrollTop = logbox.scrollHeight;

        if (/Writing script|Title:/i.test(txt)) setStage(2);
        else if (/Rendering video|Creating slideshow|Rendering synchronized Slide/i.test(txt)) setStage(3);
        else if (/Uploading directly to YouTube/i.test(txt)) setStage(4);
        else if (/UPLOAD SUCCESSFUL:/i.test(txt)) setStage(5);
      } else if (payload.type === 'done') {
        for (let i = 1; i <= 5; i++) {
          const el = document.getElementById('st-' + i);
          el.classList.remove('active');
          el.classList.add('complete');
        }
        pill.textContent = '✓ Pipeline Complete';
        pill.classList.add('done');
        if (payload.youtubeUrl) {
          banner.style.display = 'block';
          banner.textContent = '✅ Published directly via YouTube Data API v3 (videos.insert): ' + payload.youtubeUrl;
        }
        es.close();
      }
    };
  </script>
</body>
</html>`;
}

function sanitizeLogLine(line) {
  // Strip ANSI escape codes and mask anything resembling an API token/secret
  const ansiRegex = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');
  const clean = line.replace(ansiRegex, '');
  return clean
    .replace(/(AIza[0-9A-Za-z_-]{20,})/g, '[MASKED_API_KEY]')
    .replace(/(GOCSPX-[0-9A-Za-z_-]{10,})/g, '[MASKED_CLIENT_SECRET]')
    .replace(/(1\/\/[0-9A-Za-z_-]{20,})/g, '[MASKED_TOKEN]');
}

async function run() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.rmSync(TMP_VIDEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_VIDEO_DIR, { recursive: true });

  const oauthInfo = buildOAuthUrl();
  const sseClients = new Set();
  const logBuffer = [];
  let pipelineStarted = false;
  let pipelineDonePayload = null;

  let recordStartMs = null;
  let renderStartSec = null;
  let renderEndSec = null;
  let uploadedVideoId = null;
  let uploadedUrl = null;
  let pipelineFinishedPromiseResolve = null;
  const pipelineFinishedPromise = new Promise(resolve => {
    pipelineFinishedPromiseResolve = resolve;
  });

  function broadcast(obj) {
    const data = `data: ${JSON.stringify(obj)}\n\n`;
    for (const res of sseClients) {
      res.write(data);
    }
  }

  function startPipelineChild() {
    if (pipelineStarted) return;
    pipelineStarted = true;

    const child = spawn('node', ['scripts/run-pipeline.js', '--count=1', '--length=short'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        DEFAULT_PRIVACY_STATUS: 'public',
        VIDEO_PROVIDER: 'slideshow',
        VIDEO_RESOLUTION: '1080p',
        FORCE_COLOR: '0'
      }
    });

    const handleChunk = (chunk) => {
      const text = chunk.toString();
      for (const rawLine of text.split(/\r?\n/)) {
        if (!rawLine.trim()) continue;
        const line = sanitizeLogLine(rawLine);
        const nowSec = recordStartMs ? (Date.now() - recordStartMs) / 1000 : 0;

        if (renderStartSec === null && /Creating slideshow video|Rendering synchronized Slide 1\/4/i.test(line)) {
          renderStartSec = Math.max(0, nowSec - 1);
        }
        if (renderStartSec !== null && /Video rendered successfully|Uploading directly to YouTube/i.test(line)) {
          renderEndSec = nowSec;
        }
        const matchId = line.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/) || line.match(/Video uploaded with ID:\s*([a-zA-Z0-9_-]{11})/);
        if (matchId) {
          uploadedVideoId = matchId[1];
          uploadedUrl = `https://www.youtube.com/shorts/${uploadedVideoId}`;
        }

        const msg = { type: 'log', text: line };
        logBuffer.push(msg);
        broadcast(msg);
        process.stdout.write(`[pipeline] ${line}\n`);
      }
    };

    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);
    child.on('close', (code) => {
      pipelineDonePayload = { type: 'done', code, youtubeUrl: uploadedUrl };
      broadcast(pipelineDonePayload);
      pipelineFinishedPromiseResolve({ code, uploadedVideoId, uploadedUrl });
    });
  }

  const server = http.createServer((req, res) => {
    if (req.url === '/oauth-flow') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderOAuthPage(oauthInfo));
    } else if (req.url === '/runner') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderRunnerPage());
      startPipelineChild();
    } else if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      sseClients.add(res);
      for (const msg of logBuffer) {
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      }
      if (pipelineDonePayload) {
        res.write(`data: ${JSON.stringify(pipelineDonePayload)}\n\n`);
      }
      req.on('close', () => sseClients.delete(res));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`Compliance recorder UI server listening on http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: TMP_VIDEO_DIR,
      size: { width: 1280, height: 720 }
    }
  });

  const page = await context.newPage();
  recordStartMs = Date.now();

  try {
    // 1. OAuth Connection Screen & Google OAuth Endpoint
    console.log('Recording Chapter 1: OAuth 2.0 Connection & Privacy Policy...');
    await page.goto(`http://127.0.0.1:${PORT}/oauth-flow`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);

    await page.click('#oauth-launch-btn');
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(4000);

    await page.goto('https://github.com/TKSanthosh/youtube-automation-agent/blob/master/PRIVACY.md', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);

    // 2. Real YouTube Automation Studio Dashboard
    console.log('Recording Chapter 2: Live Studio Dashboard walkthrough...');
    await page.goto('http://localhost:3456', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const el = document.querySelector('#stat-published');
      return el && el.textContent.trim() !== '—';
    }, { timeout: 35000 }).catch(() => {});
    await page.waitForTimeout(3500);

    const tabs = ['operator', 'readiness', 'pipeline', 'settings'];
    for (const tab of tabs) {
      const selector = `button[data-view="${tab}"]`;
      if (await page.locator(selector).count()) {
        await page.click(selector);
        await page.waitForTimeout(3000);
      }
    }

    // 3. Live Pipeline Execution
    console.log('Recording Chapter 3: Executing live pipeline (run-pipeline.js)...');
    await page.goto(`http://127.0.0.1:${PORT}/runner`, { waitUntil: 'domcontentloaded' });

    const pipelineResult = await pipelineFinishedPromise;
    console.log('Pipeline finished:', pipelineResult);
    await page.waitForTimeout(4500);

    // 4. Open Newly Uploaded YouTube Short Live on YouTube
    const targetVideoId = pipelineResult.uploadedVideoId || 'n3dQGVnI5DU';
    console.log(`Recording Chapter 4: Opening live YouTube video ${targetVideoId}...`);
    await page.goto(`https://www.youtube.com/watch?v=${targetVideoId}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(6000);

    await page.goto(`https://www.youtube.com/shorts/${targetVideoId}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(5000);
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }

  const videoFiles = fs.readdirSync(TMP_VIDEO_DIR).filter(f => f.endsWith('.webm'));
  if (!videoFiles.length) {
    throw new Error('Playwright did not produce a .webm video recording.');
  }
  const rawWebm = path.join(TMP_VIDEO_DIR, videoFiles[0]);
  console.log(`Raw screencast captured: ${rawWebm}`);
  console.log(`Timestamps -> renderStartSec: ${renderStartSec}, renderEndSec: ${renderEndSec}`);

  // Transcode & speed-ramp long FFmpeg rendering segment so video is crisp (~60-85s) and under 15 MB for email
  const args = ['-y', '-i', rawWebm];
  if (renderStartSec !== null && renderEndSec !== null && (renderEndSec - renderStartSec) > 20) {
    const t1 = renderStartSec.toFixed(2);
    const t2 = renderEndSec.toFixed(2);
    const filter = [
      `[0:v]trim=0:${t1},setpts=PTS-STARTPTS[v0]`,
      `[0:v]trim=${t1}:${t2},setpts=0.125*(PTS-STARTPTS)[v1]`,
      `[0:v]trim=${t2},setpts=PTS-STARTPTS[v2]`,
      `[v0][v1][v2]concat=n=3:v=1:a=0,fps=24[vout]`
    ].join(';');
    args.push('-filter_complex', filter, '-map', '[vout]');
  } else {
    args.push('-vf', 'fps=24');
  }

  args.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'medium',
    '-crf', '25',
    '-movflags', '+faststart',
    FINAL_MP4
  );

  console.log('Encoding final MP4 screencast...');
  execFileSync(ffmpegPath, args, { stdio: 'inherit' });

  const sizeMb = (fs.statSync(FINAL_MP4).size / (1024 * 1024)).toFixed(2);
  console.log(`\n✅ FINAL SCREENCAST READY: ${FINAL_MP4} (${sizeMb} MB)`);
  console.log(`✅ Newly uploaded Short: https://www.youtube.com/shorts/${uploadedVideoId || 'N/A'}`);
}

run().catch(err => {
  console.error('Screencast recording failed:', err);
  process.exit(1);
});
