/**
 * Google OAuth 2.0 Refresh Token Generator (Auto Mode)
 * 
 * Run ONCE on each machine to authorize Google Drive uploads.
 * 
 * BEFORE RUNNING:
 *   1. Make sure your .env file has GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_DRIVE_FOLDER_ID set.
 *   2. Stop the frontend (it uses port 3000) before running this script.
 * 
 * Usage:
 *   node generate_token_auto.js
 * 
 * What it does:
 *   - Starts a local server on port 3000
 *   - Opens your browser to the Google consent screen
 *   - Captures the auth code from the redirect
 *   - Updates your .env with a new GOOGLE_REFRESH_TOKEN
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const ENV_PATH = path.join(__dirname, '.env');

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in your .env file.');
    console.error('   See GOOGLE_DRIVE_SETUP.md for instructions.');
    process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive',
];

const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
});

console.log('\n🔐 Google OAuth2 Token Generator (Auto Mode)');
console.log('============================================');
console.log('Starting local server on port 3000 to capture the auth code...\n');

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === '/oauth2callback') {
        const code = parsedUrl.query.code;
        const error = parsedUrl.query.error;

        if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h2>❌ Authorization failed: ${error}</h2><p>Please close this window and try again.</p>`);
            server.close();
            console.error('❌ Authorization was denied or failed:', error);
            process.exit(1);
        }

        if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h2>❌ No code received. Please try again.</h2>');
            server.close();
            process.exit(1);
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <html>
            <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0fdf4;">
                <h2 style="color:#16a34a;">✅ Authorization Successful!</h2>
                <p>You can close this tab and return to your terminal.</p>
            </body>
            </html>
        `);

        server.close();

        console.log('✅ Authorization code received!');
        console.log('🔄 Exchanging code for tokens...\n');

        try {
            const { tokens } = await oAuth2Client.getToken(code);

            if (!tokens.refresh_token) {
                console.warn('⚠️  No refresh token received.');
                console.warn('   This happens if you already authorized this app before.');
                console.warn('   → Go to https://myaccount.google.com/permissions');
                console.warn('   → Find and remove access for this app, then re-run this script.');
                process.exit(1);
            }

            console.log('📝 Updating .env file with new refresh token...');

            let envContent = fs.readFileSync(ENV_PATH, 'utf8');
            if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                envContent = envContent.replace(
                    /GOOGLE_REFRESH_TOKEN=.*/,
                    `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
                );
            } else {
                envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
            }

            fs.writeFileSync(ENV_PATH, envContent, 'utf8');
            console.log('✅ .env file updated successfully!');
            console.log('\n🚀 Now restart the backend server (node server.js) and uploads will work!\n');

        } catch (err) {
            console.error('❌ Error exchanging code for tokens:', err.message);
            process.exit(1);
        }
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(3000, () => {
    console.log('✅ Local server listening on http://localhost:3000');
    console.log('🌐 Opening browser for authorization...\n');

    const command = process.platform === 'darwin'
        ? `open "${authUrl}"`
        : process.platform === 'win32'
            ? `start "${authUrl}"`
            : `xdg-open "${authUrl}"`;

    exec(command, (err) => {
        if (err) {
            console.log('⚠️  Could not open browser automatically. Please open this URL manually:\n');
            console.log(authUrl);
        } else {
            console.log('✅ Browser opened! Sign in with your Razorpay Google account and click Allow.');
            console.log('   Waiting for authorization...\n');
        }
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error('❌ Port 3000 is already in use.');
        console.error('   Please stop the frontend server first:');
        console.error('   → Press Ctrl+C in the frontend terminal, then re-run this script.');
    } else {
        console.error('❌ Server error:', err.message);
    }
    process.exit(1);
});
