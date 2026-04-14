# Google Drive Integration — Team Setup Guide

This guide helps each team member on a new machine connect the FRD tool to the shared Google Drive folder so that checklists and FRDs are uploaded automatically.

---

## Prerequisites

- Access to the **Google Cloud Console** project (ask Tanisha for access if needed).
- Node.js installed on your machine.
- The project cloned locally from the GitHub repo.

---

## Step 1: Get Google OAuth Credentials

> **Do this once per Google Cloud project. Skip if Tanisha has already shared the Client ID and Secret.**

1. Go to [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Select the project (e.g., `frd-automation`).
3. Navigate to **APIs & Services → Credentials**.
4. Under **OAuth 2.0 Client IDs**, click the client (or create one):
   - Application type: **Web application**
   - Add `http://localhost:3000/oauth2callback` under **Authorized Redirect URIs**
5. Click **Download JSON** or note down:
   - **Client ID** (ends in `.apps.googleusercontent.com`)
   - **Client Secret** (starts with `GOCSPX-`)

---

## Step 2: Set Up Your `.env` File

In the `backend/` folder, create or edit the `.env` file:

```env
# Gemini API Key
GEMINI_API_KEY=your_gemini_api_key

# Google Drive Configuration
GOOGLE_DRIVE_FOLDER_ID=1zRCiqwzzJisL5F3ScmzlDtZfALzfNG41

# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID= your_google_cloud_cliendID
GOOGLE_CLIENT_SECRET=your_google_cloud_cliendSecret
GOOGLE_REFRESH_TOKEN=    ← Leave blank for now, Step 3 will fill this
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
```

> ⚠️ The `GOOGLE_DRIVE_FOLDER_ID` is the shared folder ID — do not change it. All team members upload to the same folder.

---

## Step 3: Generate Your Personal Refresh Token

Each team member must generate their own refresh token. This token authorizes **your Google account** to upload to the shared Drive.

### 3a. Make sure the frontend is NOT running on port 3000

The token generator needs port 3000 temporarily. If your frontend is running, stop it first:

```bash
# Press Ctrl+C in the frontend terminal, or:
lsof -ti:3000 | xargs kill -9
```

### 3b. Run the token generator

```bash
cd /path/to/frd-automation-main/backend
node generate_token_auto.js
```

This will:

1. Start a local server on port 3000.
2. **Automatically open your browser** to the Google consent screen.
3. Ask you to sign in with your **Razorpay Google account**.
4. Capture the authorization code automatically.
5. **Update your `.env` file** with the new refresh token.

### 3c. You should see in the terminal:

```
✅ Authorization code received!
✅ .env file updated successfully!
🚀 Restart your backend server (node server.js) and uploads will work!
```

---

## Step 4: Start the Servers

```bash
# Terminal 1 — Backend
cd backend
node server.js

# Terminal 2 — Frontend
cd frontend
npm start
```

---

## Step 5: Verify Uploads Are Working

Upload any checklist from the UI. In the backend terminal, you should see:

```
✅ File uploaded to Google Drive: Checklist_MerchantName.xlsx (ID: ...)
✅ File uploaded to Google Drive: FRD_merchantname_....pdf (ID: ...)
```

---

## Troubleshooting

| Error                       | Cause                                  | Fix                                                                                                                  |
| --------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `invalid_client`            | Client ID is truncated in `.env`       | Ensure Client ID ends with `.apps.googleusercontent.com`                                                             |
| `unauthorized_client`       | Refresh token is from another machine  | Run `node generate_token_auto.js` again                                                                              |
| `EADDRINUSE: port 3000`     | Frontend is using port 3000            | Stop frontend first, then run token generator                                                                        |
| `No refresh token received` | App was already authorized before      | Go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions), revoke access, re-run the script |
| `403 Forbidden`             | Your account lacks Drive folder access | Ask the folder owner to add you as Contributor                                                                       |

---

## Important Notes

- **Refresh tokens are personal** — each team member must generate their own using `generate_token_auto.js`.
- **Do NOT commit `.env` to Git** — it contains sensitive credentials. It is already in `.gitignore`.
- **The shared Drive folder ID is fixed**: `1zRCiqwzzJisL5F3ScmzlDtZfALzfNG41` — do not change this.
- The `generate_token_auto.js` script is included in the repo for convenience.
