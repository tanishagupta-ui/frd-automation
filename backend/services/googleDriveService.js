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

        if (CLIENT_ID) {
            console.log(`✅ Google Drive diagnostic: Authenticated via OAuth 2.0 (Client ID: ${CLIENT_ID.substring(0, 10)}...)`);
        } else if (SERVICE_ACCOUNT_KEY_PATH) {
            try {
                const key = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
                console.log(`✅ Google Drive diagnostic: Authenticated via Service Account (${key.client_email})`);
            } catch (e) {
                console.log(`✅ Google Drive diagnostic: Authenticated via Service Account`);
            }
        }

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
            supportsAllDrives: true,
        });

        console.log(`✅ File uploaded to Google Drive: ${fileName} (ID: ${response.data.id})`);
        return response.data.id;
    } catch (error) {
        let errorMsg = error.message;
        if (error.errors && error.errors.length > 0) {
            errorMsg = error.errors.map(e => e.message).join('; ');
        }
        console.error(`❌ Error uploading to Google Drive (${fileName}):`, errorMsg);
        if (error.code === 403) {
            console.error(`💡 Suggestion: Ensure the authenticated account has 'Contributor' or 'Content Manager' permissions on the Shared Drive folder (ID: ${FOLDER_ID})`);
        }
        return null;
    }
}

module.exports = {
    uploadFile,
};
