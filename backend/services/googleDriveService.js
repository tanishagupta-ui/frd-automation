const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load settings from environment
const SERVICE_ACCOUNT_KEY_PATH = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

let drive = null;

/**
 * Initializes the Google Drive API client.
 */
function initDrive() {
    if (drive) return drive;

    if (!SERVICE_ACCOUNT_KEY_PATH || !fs.existsSync(SERVICE_ACCOUNT_KEY_PATH)) {
        console.warn('⚠️ Google Drive Service Account key path not configured or file not found.');
        return null;
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_KEY_PATH,
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });
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
