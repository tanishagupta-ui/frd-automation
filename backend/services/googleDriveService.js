const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load settings from environment
const SERVICE_ACCOUNT_KEY_PATH = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// OAuth 2.0 settings
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

let drive = null;

/**
 * Initializes the Google Drive API client.
 */
function initDrive() {
    if (drive) return drive;

    try {
        let auth;

        // Try OAuth 2.0 first
        if (CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN) {
            console.log('🔄 Initializing Google Drive with OAuth 2.0...');
            auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
            auth.setCredentials({ refresh_token: REFRESH_TOKEN });
        }
        // Fallback to Service Account
        else if (SERVICE_ACCOUNT_KEY_PATH && fs.existsSync(SERVICE_ACCOUNT_KEY_PATH)) {
            console.log('🔄 Initializing Google Drive with Service Account...');
            auth = new google.auth.GoogleAuth({
                keyFile: SERVICE_ACCOUNT_KEY_PATH,
                scopes: ['https://www.googleapis.com/auth/drive.file'],
            });
        } else {
            console.warn('⚠️ Google Drive credentials (OAuth 2.0 or Service Account) not fully configured.');
            return null;
        }

        drive = google.drive({ version: 'v3', auth });
        return drive;
    } catch (error) {
        console.error('❌ Error initializing Google Drive:', error);
        return null;
    }
}

/**
 * Uploads a file to Google Drive.
 * @param {string} filePath - Local path to the file.
 * @param {string} fileName - Name to give the file in Drive.
 * @param {string} mimeType - MIME type of the file.
 * @returns {Promise<string|null>} - The ID of the uploaded file or null.
 */
async function uploadFile(filePath, fileName, mimeType) {
    const driveClient = initDrive();
    if (!driveClient) return null;

    try {
        const fileMetadata = {
            name: fileName,
            parents: FOLDER_ID ? [FOLDER_ID] : [],
        };

        const media = {
            mimeType: mimeType,
            body: fs.createReadStream(filePath),
        };

        const response = await driveClient.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });

        console.log(`✅ File uploaded to Google Drive: ${fileName} (ID: ${response.data.id})`);
        return response.data.id;
    } catch (error) {
        console.error(`❌ Error uploading to Google Drive (${fileName}):`, error);
        return null;
    }
}

module.exports = {
    uploadFile,
};
