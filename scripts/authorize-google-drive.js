#!/usr/bin/env node
require('dotenv').config();

const { google } = require('googleapis');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
  process.exit(1);
}
const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const scopes = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive'
];

async function main() {
  const codeArg = process.argv.find(arg => arg.startsWith('--code='));
  let code = codeArg ? codeArg.split('=')[1] : null;

  if (!code) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes
    });

    console.log(chalk.cyan.bold('\n🔐 Authorize Google Drive for Personal 15GB Storage'));
    console.log(chalk.gray('═'.repeat(65)));
    console.log(chalk.white('1. Open this URL in your browser:'));
    console.log(chalk.blue.underline(`\n${authUrl}\n`));
    console.log(chalk.white('2. Sign in with the Google Account that owns your Drive folder.'));
    console.log(chalk.white('3. Copy the authorization code Google provides.'));
    console.log(chalk.gray('═'.repeat(65)));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    code = await new Promise(resolve => {
      rl.question(chalk.yellow.bold('\n👉 Paste the authorization code here: '), answer => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  if (!code) {
    console.log(chalk.red('No code provided. Aborted.'));
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log(chalk.green('\n✅ Google Drive authorization token received!'));

    if (tokens.refresh_token) {
      console.log(chalk.white('Updating .env with GOOGLE_DRIVE_REFRESH_TOKEN...'));
      const envPath = path.join(__dirname, '..', '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

      if (envContent.includes('GOOGLE_DRIVE_REFRESH_TOKEN=')) {
        envContent = envContent.replace(/GOOGLE_DRIVE_REFRESH_TOKEN=.*/g, `GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
      } else {
        envContent += `\nGOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      }

      fs.writeFileSync(envPath, envContent);
      console.log(chalk.green('✅ Saved GOOGLE_DRIVE_REFRESH_TOKEN in .env!'));
      console.log(chalk.cyan(`\n🔑 Your Refresh Token for GitHub Secrets:`));
      console.log(chalk.yellow(tokens.refresh_token));
    } else {
      console.log(chalk.yellow('Note: No new refresh token returned (already authorized). Existing token is active.'));
    }

    // Now test uploading a file into folder 17Q87WZCQEYnC0-atuWOd90c8Qsso4KF7
    console.log(chalk.cyan('\nTesting upload to your Google Drive folder...'));
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    fs.writeFileSync('test_drive.txt', `YouTube Automation Agent connected successfully! ${new Date().toISOString()}`);

    const res = await drive.files.create({
      requestBody: {
        name: 'drive_connection_success.txt',
        parents: ['17Q87WZCQEYnC0-atuWOd90c8Qsso4KF7']
      },
      media: {
        mimeType: 'text/plain',
        body: fs.createReadStream('test_drive.txt')
      },
      fields: 'id, name, webViewLink'
    });

    console.log(chalk.green.bold('\n🎉 SUCCESS! File uploaded to your Google Drive folder:'));
    console.log(chalk.white(`   File Name: ${res.data.name}`));
    console.log(chalk.white(`   View Link: `) + chalk.cyan(res.data.webViewLink));

    fs.unlinkSync('test_drive.txt');
  } catch (err) {
    console.error(chalk.red('\n❌ Authorization or upload failed:'), err.message);
    if (fs.existsSync('test_drive.txt')) fs.unlinkSync('test_drive.txt');
    process.exit(1);
  }
}

main();
