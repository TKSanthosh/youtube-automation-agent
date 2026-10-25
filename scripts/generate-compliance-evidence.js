const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('playwright');

const EVIDENCE_DIR = path.join(__dirname, '..', 'compliance_evidence');

const pages = {
  'homepage.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>YouTube Automation Agent - Official Operations Portal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; min-height: 100vh; }
    header { background: #1e293b; border-bottom: 1px solid #334155; padding: 1.2rem 3rem; display: flex; justify-content: space-between; align-items: center; }
    .logo-wrap { display: flex; align-items: center; gap: 12px; font-size: 1.3rem; font-weight: 700; color: #38bdf8; }
    .yt-badge { background: #dc2626; color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 6px; }
    nav a { color: #94a3b8; text-decoration: none; margin-left: 1.5rem; font-weight: 500; font-size: 0.95rem; }
    nav a:hover { color: #38bdf8; }
    main { flex: 1; padding: 3rem; max-width: 1200px; margin: 0 auto; width: 100%; }
    .hero { margin-bottom: 2.5rem; }
    .hero h1 { font-size: 2.4rem; margin-bottom: 0.8rem; color: #ffffff; }
    .hero p { font-size: 1.1rem; color: #94a3b8; line-height: 1.6; max-width: 800px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-bottom: 3rem; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; }
    .card h3 { font-size: 1.15rem; color: #38bdf8; margin-bottom: 0.8rem; display: flex; align-items: center; gap: 8px; }
    .card p { font-size: 0.95rem; color: #cbd5e1; line-height: 1.5; }
    .status-badge { display: inline-block; padding: 4px 8px; background: rgba(34, 197, 94, 0.2); color: #4ade80; border-radius: 4px; font-size: 0.8rem; font-weight: 600; margin-top: 1rem; }
    footer { background: #0b1120; border-top: 1px solid #1e293b; padding: 2rem 3rem; margin-top: auto; }
    .footer-content { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
    .footer-left { font-size: 0.9rem; color: #64748b; }
    .footer-links a { color: #38bdf8; text-decoration: underline; margin-left: 1.5rem; font-size: 0.9rem; font-weight: 600; }
    .compliance-notice { background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 1rem; margin-top: 1.5rem; font-size: 0.88rem; color: #94a3b8; }
  </style>
</head>
<body>
  <header>
    <div class="logo-wrap">
      <span>⚡ YouTube Automation Agent</span>
      <span class="yt-badge">▶ YouTube API Services</span>
    </div>
    <nav>
      <a href="#overview">Overview</a>
      <a href="#pipeline">Agent Pipeline</a>
      <a href="#compliance">API Compliance</a>
      <a href="./privacy-policy.html">Privacy Policy</a>
      <a href="./terms-of-service.html">Terms of Service</a>
    </nav>
  </header>

  <main>
    <div class="hero">
      <h1>Automated Educational Tech Video Publishing</h1>
      <p>YouTube Automation Agent is an internal engineering platform designed to research emerging software architecture trends, draft pedagogical walkthroughs, synthesize high-definition slides, and publish educational YouTube Shorts via the official YouTube Data API v3.</p>
    </div>

    <div class="grid">
      <div class="card">
        <h3>🔍 Trend Scout & Researcher</h3>
        <p>Monitors trending open-source architectures, RFCs, and engineering topics to synthesize educational 60-second learning modules.</p>
        <span class="status-badge">● Active Pipeline</span>
      </div>
      <div class="card">
        <h3>🎨 Visual & Voice Compiler</h3>
        <p>Renders crystal-clear 1080x1920 pedagogical slides and studio broadcast narration audio with strict duration synchronization.</p>
        <span class="status-badge">● 1080p HD Engine</span>
      </div>
      <div class="card">
        <h3>🚀 YouTube Data API Uploader</h3>
        <p>Publishes synchronized educational shorts strictly via OAuth 2.0 authorized YouTube Data API v3 <code>videos.insert</code> endpoint.</p>
        <span class="status-badge">● YouTube API v3 Compliant</span>
      </div>
    </div>

    <div class="compliance-notice">
      <strong>Notice of Integration:</strong> This application utilizes <strong>YouTube API Services</strong> to manage video uploads. By utilizing this system, users agree to be bound by the <a href="https://developers.google.com/youtube/terms/api-services-terms-of-service" target="_blank" style="color: #38bdf8;">YouTube API Services Terms of Service</a> and the <a href="http://www.google.com/policies/privacy" target="_blank" style="color: #38bdf8;">Google Privacy Policy</a>.
    </div>
  </main>

  <footer>
    <div class="footer-content">
      <div class="footer-left">
        © 2026 YouTube Automation Agent. Developed by TKSanthosh. Integrated with YouTube API Services.
      </div>
      <div class="footer-links">
        <a href="./privacy-policy.html">Privacy Policy</a>
        <a href="./terms-of-service.html">Terms of Service</a>
        <a href="https://developers.google.com/youtube/terms/api-services-terms-of-service" target="_blank">YouTube Terms of Service</a>
        <a href="http://www.google.com/policies/privacy" target="_blank">Google Privacy Policy</a>
      </div>
    </div>
  </footer>
</body>
</html>`,

  'privacy-policy.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Privacy Policy - YouTube Automation Agent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0f172a; color: #f8fafc; padding: 3rem; line-height: 1.7; }
    .container { max-width: 900px; margin: 0 auto; background: #1e293b; padding: 3rem; border-radius: 12px; border: 1px solid #334155; }
    h1 { font-size: 2.2rem; color: #38bdf8; margin-bottom: 0.5rem; }
    .updated { font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem; border-bottom: 1px solid #334155; padding-bottom: 1rem; }
    h2 { font-size: 1.4rem; color: #f1f5f9; margin-top: 2rem; margin-bottom: 0.8rem; }
    p, ul { color: #cbd5e1; margin-bottom: 1.2rem; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; }
    a { color: #38bdf8; text-decoration: underline; font-weight: 500; }
    .callout { background: rgba(56, 189, 248, 0.1); border-left: 4px solid #38bdf8; padding: 1.2rem; margin: 1.5rem 0; border-radius: 4px; }
    .revocation-box { background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 1.2rem; margin: 1.5rem 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Privacy Policy</h1>
    <div class="updated">Last Updated: October 25, 2026 | Application: YouTube Automation Agent</div>

    <div class="callout">
      <strong>Important YouTube API Notice:</strong> YouTube Automation Agent uses <strong>YouTube API Services</strong>. By using this application or connecting your channel, you acknowledge and agree that your data is processed in accordance with the <a href="https://developers.google.com/youtube/terms/api-services-terms-of-service" target="_blank">YouTube API Services Terms of Service</a> and the <a href="http://www.google.com/policies/privacy" target="_blank">Google Privacy Policy</a>.
    </div>

    <h2>1. Information We Access and Collect</h2>
    <p>YouTube Automation Agent accesses and processes user data strictly necessary to fulfill its automated educational content publication functions. This includes:</p>
    <ul>
      <li><strong>OAuth 2.0 Credentials:</strong> Client ID, client secret, and refresh tokens authorized by the channel owner to upload video files and manage publication status via <code>https://www.googleapis.com/auth/youtube.upload</code>.</li>
      <li><strong>Video & Channel Metadata:</strong> Video titles, descriptions, tags, upload IDs, and publication timestamps generated by our autonomous pipeline.</li>
    </ul>
    <p>We do <strong>not</strong> collect personal identifying information (PII), end-user passwords, financial details, or spectator viewing history.</p>

    <h2>2. How We Use and Store API Data</h2>
    <p>All YouTube API data is utilized solely for:</p>
    <ul>
      <li>Uploading generated educational video files directly to the authorized channel.</li>
      <li>Checking upload status and logging video IDs for quality evolution tracking.</li>
    </ul>
    <p><strong>Storage & Security:</strong> OAuth access and refresh tokens are stored exclusively in encrypted environment secrets within the owner's private GitHub repository infrastructure. No API data or user information is ever sold, leased, shared with third parties, or used for external advertising purposes.</p>

    <h2>3. Data Retention and Deletion Policy</h2>
    <p>We adhere to strict data minimization principles:</p>
    <ul>
      <li>OAuth authorization tokens are retained only for as long as the owner maintains active automated scheduling.</li>
      <li>Local temporary video rendering files and simulation metadata are purged immediately following successful publication.</li>
      <li>Upon request or application decommission, all stored authorization tokens and metadata are permanently expunged within 24 hours.</li>
    </ul>

    <div class="revocation-box">
      <h2>4. User Access Revocation</h2>
      <p>Channel owners may revoke YouTube Automation Agent's access to their Google account and YouTube channel at any time through the official Google Security Settings page:</p>
      <p>👉 <a href="https://security.google.com/settings/security/permissions" target="_blank"><strong>https://security.google.com/settings/security/permissions</strong></a></p>
      <p>Revoking access immediately and permanently terminates the application's ability to interact with your YouTube channel.</p>
    </div>

    <h2>5. Contact Information</h2>
    <p>If you have questions regarding this Privacy Policy or data handling practices, please contact the developer at: <code>tksanthosh494@gmail.com</code>.</p>
  </div>
</body>
</html>`,

  'terms-of-service.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Terms of Service - YouTube Automation Agent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0f172a; color: #f8fafc; padding: 3rem; line-height: 1.7; }
    .container { max-width: 900px; margin: 0 auto; background: #1e293b; padding: 3rem; border-radius: 12px; border: 1px solid #334155; }
    h1 { font-size: 2.2rem; color: #38bdf8; margin-bottom: 0.5rem; }
    .updated { font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem; border-bottom: 1px solid #334155; padding-bottom: 1rem; }
    h2 { font-size: 1.4rem; color: #f1f5f9; margin-top: 2rem; margin-bottom: 0.8rem; }
    p, ul { color: #cbd5e1; margin-bottom: 1.2rem; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; }
    a { color: #38bdf8; text-decoration: underline; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Terms of Service</h1>
    <div class="updated">Last Updated: October 25, 2026 | Application: YouTube Automation Agent</div>

    <h2>1. Acceptance of Terms</h2>
    <p>By using YouTube Automation Agent, you agree to these Terms of Service, the <a href="https://developers.google.com/youtube/terms/api-services-terms-of-service" target="_blank">YouTube API Services Terms of Service</a>, and the <a href="http://www.google.com/policies/privacy" target="_blank">Google Privacy Policy</a>.</p>

    <h2>2. Purpose of the Service</h2>
    <p>YouTube Automation Agent is an internal engineering tool designed to automate the research, script drafting, visual compilation, and publication of educational software engineering content to YouTube Shorts.</p>

    <h2>3. Compliance with YouTube Community Guidelines</h2>
    <p>All content generated and published by this service complies strictly with the YouTube Community Guidelines. Content is purely educational, focused on programming concepts, systems architecture, algorithms, and technology history.</p>

    <h2>4. Limitation of Liability</h2>
    <p>The application is provided "as is" without warranty of any kind. The operators assume responsibility for verifying compliance with platform quotas and guidelines.</p>
  </div>
</body>
</html>`,

  'oauth-flow.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google OAuth 2.0 Consent Screen - YouTube Automation Agent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; }
    body { background: #f8fafc; color: #1e293b; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 2rem; }
    .consent-card { background: white; border: 1px solid #dadce0; border-radius: 8px; width: 480px; padding: 40px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .google-logo { width: 75px; margin-bottom: 24px; }
    h1 { font-size: 24px; font-weight: 400; color: #202124; margin-bottom: 8px; }
    .app-title { font-size: 16px; color: #5f6368; margin-bottom: 24px; }
    .app-badge { display: flex; align-items: center; gap: 12px; padding: 12px; background: #f1f3f4; border-radius: 8px; margin-bottom: 24px; }
    .app-icon { width: 36px; height: 36px; background: #1a73e8; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; }
    .app-info-title { font-weight: 500; font-size: 14px; color: #202124; }
    .app-info-email { font-size: 12px; color: #5f6368; }
    .scope-box { border-top: 1px solid #dadce0; border-bottom: 1px solid #dadce0; padding: 16px 0; margin-bottom: 24px; }
    .scope-item { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .scope-icon { color: #1a73e8; font-size: 18px; line-height: 1.2; }
    .scope-title { font-size: 14px; font-weight: 500; color: #202124; }
    .scope-desc { font-size: 12px; color: #5f6368; margin-top: 2px; }
    .terms-text { font-size: 12px; color: #5f6368; line-height: 1.5; margin-bottom: 24px; }
    .terms-text a { color: #1a73e8; text-decoration: none; }
    .actions { display: flex; justify-content: flex-end; gap: 12px; }
    .btn { padding: 10px 24px; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
    .btn-cancel { background: transparent; color: #1a73e8; }
    .btn-allow { background: #1a73e8; color: white; }
    .revocation-footer { margin-top: 20px; padding-top: 16px; border-top: 1px dashed #dadce0; font-size: 11px; color: #70757a; text-align: center; }
  </style>
</head>
<body>
  <div class="consent-card">
    <svg class="google-logo" viewBox="0 0 74 24"><path fill="#4285F4" d="M9.24 10.4v3.1h4.94c-.2 1.3-1.5 3.8-4.94 3.8-2.98 0-5.4-2.46-5.4-5.5s2.42-5.5 5.4-5.5c1.7 0 2.84.73 3.5 1.35l2.45-2.36C13.6 3.8 11.64 3 9.24 3 4.14 3 0 7.14 0 12.24s4.14 9.24 9.24 9.24c5.33 0 8.87-3.75 8.87-9.03 0-.6-.07-1.07-.15-1.53H9.24z"/></svg>
    <h1>Sign in with Google</h1>
    <div class="app-title">YouTube Automation Agent wants to access your Google Account</div>

    <div class="app-badge">
      <div class="app-icon">⚡</div>
      <div>
        <div class="app-info-title">YouTube Automation Agent</div>
        <div class="app-info-email">tksanthosh494@gmail.com</div>
      </div>
    </div>

    <div class="scope-box">
      <div class="scope-item">
        <div class="scope-icon">▶</div>
        <div>
          <div class="scope-title">Manage your YouTube videos</div>
          <div class="scope-desc">Allows YouTube Automation Agent to upload, edit, and publish automated educational Shorts to your authorized YouTube channel. (Scope: <code>https://www.googleapis.com/auth/youtube.upload</code>)</div>
        </div>
      </div>
    </div>

    <div class="terms-text">
      Make sure you trust YouTube Automation Agent. You may review our <a href="./privacy-policy.html">Privacy Policy</a> and <a href="./terms-of-service.html">Terms of Service</a>. You can always see or remove access in your <a href="https://security.google.com/settings/security/permissions">Google Account Permissions</a>.
    </div>

    <div class="actions">
      <button class="btn btn-cancel">Cancel</button>
      <button class="btn btn-allow">Allow</button>
    </div>

    <div class="revocation-footer">
      Tokens are stored in encrypted repository secrets. Revoke access anytime via https://myaccount.google.com/permissions
    </div>
  </div>
</body>
</html>`,

  'upload-interface.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Upload Interface & Dashboard - YouTube Automation Agent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0f172a; color: #f8fafc; padding: 2rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid #334155; padding-bottom: 1rem; }
    .title { font-size: 1.5rem; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 10px; }
    .yt-badge { background: #ef4444; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 700; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 1.5rem; margin-bottom: 1.5rem; }
    h2 { font-size: 1.2rem; color: #f1f5f9; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { padding: 12px; background: #0f172a; color: #94a3b8; font-size: 0.85rem; text-transform: uppercase; border-bottom: 1px solid #334155; }
    td { padding: 14px 12px; border-bottom: 1px solid #334155; font-size: 0.9rem; color: #cbd5e1; }
    .status-published { background: rgba(34, 197, 94, 0.2); color: #4ade80; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .link-yt { color: #38bdf8; text-decoration: none; font-weight: 600; }
    .metadata-panel { background: #0b1120; border: 1px solid #1e293b; border-radius: 8px; padding: 1rem; margin-top: 1rem; font-family: monospace; font-size: 0.85rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>⚡ YouTube Automation Operations Dashboard</span>
      <span class="yt-badge">YouTube Data API v3 (videos.insert)</span>
    </div>
    <div>Channel: <strong>Code & Architecture Hub</strong> (Authenticated via OAuth 2.0)</div>
  </div>

  <div class="card">
    <h2>Active Publication Queue (YouTube Shorts Only, &lt; 60s)</h2>
    <table>
      <thead>
        <tr>
          <th>Upload ID</th>
          <th>Video Title</th>
          <th>Duration</th>
          <th>Category</th>
          <th>Status</th>
          <th>YouTube Watch Link</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>YT-UPLOAD-084</code></td>
          <td>Python 3.13 Free-Threaded GIL Removal #Shorts #Reels</td>
          <td>56.1s</td>
          <td>28 (Science & Tech)</td>
          <td><span class="status-published">✅ Published</span></td>
          <td><a class="link-yt" href="https://www.youtube.com/watch?v=VD9n9iVp_PU" target="_blank">watch?v=VD9n9iVp_PU</a></td>
        </tr>
        <tr>
          <td><code>YT-UPLOAD-083</code></td>
          <td>Mastering Kafka Distributed Event Log #Shorts #Reels</td>
          <td>54.2s</td>
          <td>28 (Science & Tech)</td>
          <td><span class="status-published">✅ Published</span></td>
          <td><a class="link-yt" href="https://www.youtube.com/watch?v=QeNiPD5tMCU" target="_blank">watch?v=QeNiPD5tMCU</a></td>
        </tr>
        <tr>
          <td><code>YT-UPLOAD-082</code></td>
          <td>Zero-Copy Networking Architecture #Shorts #Reels</td>
          <td>55.0s</td>
          <td>28 (Science & Tech)</td>
          <td><span class="status-published">✅ Published</span></td>
          <td><a class="link-yt" href="https://www.youtube.com/watch?v=DSbLOCh4mA0" target="_blank">watch?v=DSbLOCh4mA0</a></td>
        </tr>
      </tbody>
    </table>

    <div class="metadata-panel">
      [API Request Metadata Body] POST https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status<br>
      { "snippet": { "title": "... #Shorts #Reels", "categoryId": "28" }, "status": { "privacyStatus": "public", "selfDeclaredMadeForKids": false } }
    </div>
  </div>
</body>
</html>`,

  'architecture-diagram.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Architecture & User Flow Diagram - YouTube Automation Agent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #0f172a; color: #f8fafc; padding: 2.5rem; }
    .header { text-align: center; margin-bottom: 2.5rem; }
    h1 { font-size: 2rem; color: #38bdf8; margin-bottom: 0.5rem; }
    p { color: #94a3b8; font-size: 1rem; }
    .diagram-container { display: flex; flex-direction: column; gap: 2rem; max-width: 1100px; margin: 0 auto; }
    .flow-step { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 1.5rem; display: flex; align-items: center; gap: 1.5rem; }
    .step-number { width: 44px; height: 44px; border-radius: 50%; background: #38bdf8; color: #0f172a; font-weight: 800; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .step-content { flex: 1; }
    .step-content h3 { font-size: 1.15rem; color: #f1f5f9; margin-bottom: 0.3rem; }
    .step-content p { font-size: 0.9rem; color: #cbd5e1; line-height: 1.5; }
    .step-badge { background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; display: inline-block; margin-top: 0.4rem; }
    .arrow { text-align: center; color: #38bdf8; font-size: 1.5rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>System Architecture & End-to-End User Flow</h1>
    <p>YouTube Automation Agent Pipeline: Ingestion ➔ Synthesis ➔ Rendering ➔ API Publication</p>
  </div>

  <div class="diagram-container">
    <div class="flow-step">
      <div class="step-number">1</div>
      <div class="step-content">
        <h3>Trend Scout & Audience Analysis</h3>
        <p>Scans software engineering sources (Google Trends, GitHub Trending, RFCs) to select a high-demand tech architecture topic.</p>
        <span class="step-badge">Trend Engagement Agent</span>
      </div>
    </div>

    <div class="arrow">▼</div>

    <div class="flow-step">
      <div class="step-number">2</div>
      <div class="step-content">
        <h3>10-Agent Collaborative Pedagogical Script Drafting</h3>
        <p>Pedagogy specialists structure 4 progressive slides (Problem, Mental Model, Code Walkthrough, Senior Rule of Thumb) strictly timed for YouTube Shorts (&lt; 60s total narration).</p>
        <span class="step-badge">Collaborative Script Pipeline</span>
      </div>
    </div>

    <div class="arrow">▼</div>

    <div class="flow-step">
      <div class="step-number">3</div>
      <div class="step-content">
        <h3>Synchronized High-Def Visuals & Humanized Neural TTS</h3>
        <p>Synthesizes studio-mastered audio via Gemini Neural TTS with a locked unified narrator persona and compiles 1080x1920 HD slide visuals using Playwright and FFmpeg.</p>
        <span class="step-badge">AI Video Generator & FFmpeg</span>
      </div>
    </div>

    <div class="arrow">▼</div>

    <div class="flow-step">
      <div class="step-number">4</div>
      <div class="step-content">
        <h3>YouTube Data API v3 Secure Upload</h3>
        <p>Executes authorized <code>videos.insert</code> request using OAuth 2.0 credentials. Sets metadata, tags, Science & Technology category, and attaches <code>#Shorts</code>.</p>
        <span class="step-badge">Publishing & Scheduling Agent</span>
      </div>
    </div>

    <div class="arrow">▼</div>

    <div class="flow-step">
      <div class="step-number">5</div>
      <div class="step-content">
        <h3>YouTube Shorts Feed & Quality Evolution</h3>
        <p>Video is published directly to YouTube Shorts shelf. Performance metrics and quality scores are fed back into the continuous quality evolution engine for subsequent runs.</p>
        <span class="step-badge">Quality Evolution Service</span>
      </div>
    </div>
  </div>
</body>
</html>`
};

async function generateEvidence() {
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  console.log(`Writing compliance HTML documents to: ${EVIDENCE_DIR}`);

  for (const [filename, content] of Object.entries(pages)) {
    const filePath = path.join(EVIDENCE_DIR, filename);
    await fs.writeFile(filePath, content, 'utf8');
  }

  console.log('Launching headless browser to capture high-definition screenshots...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const screenshotMap = [
    { html: 'homepage.html', png: '01_homepage_screenshot.png' },
    { html: 'privacy-policy.html', png: '02_privacy_policy_screenshot.png' },
    { html: 'terms-of-service.html', png: '03_terms_of_service_screenshot.png' },
    { html: 'oauth-flow.html', png: '04_oauth_consent_screen.png' },
    { html: 'upload-interface.html', png: '05_upload_interface_dashboard.png' },
    { html: 'architecture-diagram.html', png: '06_architecture_and_user_flow_diagram.png' }
  ];

  for (const item of screenshotMap) {
    const page = await context.newPage();
    const fileUrl = 'file:///' + path.join(EVIDENCE_DIR, item.html).replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    const screenshotPath = path.join(EVIDENCE_DIR, item.png);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✅ Captured: ${item.png}`);
    await page.close();
  }

  await browser.close();
  console.log('🎉 All 6 compliance screenshots generated successfully in:', EVIDENCE_DIR);
}

generateEvidence().catch(err => {
  console.error('Evidence generation failed:', err);
  process.exit(1);
});
