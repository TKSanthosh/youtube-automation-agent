#!/usr/bin/env node
require('dotenv').config();

const http = require('http');
const url = require('url');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { google } = require('googleapis');

async function main() {
  console.log(chalk.cyan.bold('\n🔑 YouTube OAuth Permanent Refresh Token Generator'));
  console.log(chalk.gray('═'.repeat(65)));

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log(chalk.red('\n❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env!'));
    console.log(chalk.yellow('Please ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in your .env file.\n'));
    process.exit(1);
  }

  const redirectUri = 'http://localhost:8080/oauth2callback';
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
    'https://www.googleapis.com/auth/youtube.force-ssl'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Forces Google to issue a permanent refresh token
    scope: scopes
  });

  console.log(chalk.white('1. A local listener is running on: ') + chalk.cyan('http://localhost:8080'));
  console.log(chalk.white('2. Authorize via this Google URL:'));
  console.log(chalk.blue.underline(`\n${authUrl}\n`));

  // Attempt to open browser automatically
  const startCmd = process.platform === 'win32' ? `start "" "${authUrl}"` : process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
  exec(startCmd, () => {});

  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname === '/oauth2callback') {
      const code = parsed.query.code;
      if (code) {
        try {
          const { tokens } = await oauth2Client.getToken(code);
          const refreshToken = tokens.refresh_token;

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #0f172a; color: #f8fafc;">
                <h1 style="color: #22c55e;">✅ Authentication Successful!</h1>
                <p>Your permanent YouTube refresh token has been captured.</p>
                <p>You can close this browser window and return to your terminal.</p>
              </body>
            </html>
          `);

          server.close();

          if (!refreshToken) {
            console.log(chalk.yellow('\n⚠️  Google did not return a new refresh_token because your account is already connected.'));
            console.log(chalk.gray('Make sure you clicked "Allow" and prompted with consent.'));
            process.exit(1);
          }

          console.log(chalk.green.bold('\n🎉 REFRESH TOKEN ACQUIRED SUCCESSFULLY!'));
          console.log(chalk.gray('Token: ') + chalk.white(refreshToken.slice(0, 15) + '...' + refreshToken.slice(-8)));

          // Update local .env
          const envPath = path.join(__dirname, '..', '.env');
          if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');
            if (envContent.includes('YOUTUBE_REFRESH_TOKEN=')) {
              envContent = envContent.replace(/YOUTUBE_REFRESH_TOKEN=.*/g, `YOUTUBE_REFRESH_TOKEN=${refreshToken}`);
            } else {
              envContent += `\nYOUTUBE_REFRESH_TOKEN=${refreshToken}\n`;
            }
            fs.writeFileSync(envPath, envContent, 'utf8');
            console.log(chalk.green('✅ Updated YOUTUBE_REFRESH_TOKEN in local .env'));
          }

          // Sync to GitHub Secrets automatically via gh CLI
          try {
            console.log(chalk.cyan('🔄 Syncing fresh token directly to GitHub Secrets...'));
            execSync(`gh secret set YOUTUBE_REFRESH_TOKEN -b "${refreshToken}" --repo TKSanthosh/youtube-automation-agent`, { stdio: 'inherit' });
            console.log(chalk.green.bold('✅ GitHub Secret YOUTUBE_REFRESH_TOKEN successfully updated!'));
          } catch (ghErr) {
            console.log(chalk.yellow(`\nNotice: Could not automatically run gh secret set: ${ghErr.message}`));
            console.log(chalk.white('Run this command manually:'));
            console.log(chalk.cyan(`gh secret set YOUTUBE_REFRESH_TOKEN -b "${refreshToken}" --repo TKSanthosh/youtube-automation-agent`));
          }

          console.log(chalk.cyan.bold('\n📌 CRITICAL: HOW TO PREVENT EXPIRATION EVER AGAIN (INFINITE UPLOADS):'));
          console.log(chalk.white('1. Go to Google Cloud Console: ') + chalk.blue('https://console.cloud.google.com/apis/credentials/consent'));
          console.log(chalk.white('2. Under ') + chalk.yellow.bold('"Publishing status"') + chalk.white(', click ') + chalk.green.bold('"PUBLISH APP"') + chalk.white(' and confirm.'));
          console.log(chalk.white('3. When status shows ') + chalk.green.bold('"In production"') + chalk.white(', refresh tokens ') + chalk.bold('NEVER EXPIRE (Infinite Duration)') + chalk.white('!'));
          console.log(chalk.gray('═'.repeat(65) + '\n'));

          process.exit(0);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Token Exchange Error: ${err.message}`);
          console.log(chalk.red(`\n❌ Token exchange failed: ${err.message}`));
          server.close();
          process.exit(1);
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing code parameter.');
      }
    }
  });

  server.listen(8080);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
