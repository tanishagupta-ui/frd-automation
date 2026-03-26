# FRD Automation

FRD Automation is a full-stack internal tooling app that converts product audit checklists into merchant-specific Functional Requirements Documents (FRDs). It accepts Excel-based implementation checklists, validates them against the selected product, enriches merchant context, generates payment flow diagrams, and exports polished FRDs in Markdown and PDF.

## Overview

This project helps teams standardize FRD creation for supported Razorpay product implementations by automating the repetitive parts of the documentation workflow.

### Core capabilities

- Upload product-specific `.xls` and `.xlsx` audit checklists
- Extract merchant metadata from spreadsheet content and filenames
- Validate checklist content against the selected product
- Enrich merchant context using Gemini
- Generate Mermaid-based sequence diagrams
- Export FRDs as Markdown and PDF
- Optionally upload source files and generated artifacts to Google Drive

### Supported products

- Standard Checkout
- Custom Checkout
- S2S
- Subscriptions
- Charge at Will
- Payment Links
- QR Code
- Route
- Smart Collect
- Affordability

## Architecture

The application is split into two main parts:

- `frontend/`: React-based UI for product selection, file upload, processing state, and FRD download
- `backend/`: Express API for file ingestion, parsing, validation, enrichment, diagram generation, and document export

### Processing pipeline

1. The user selects a product in the frontend and uploads an Excel checklist.
2. The frontend sends a multipart request to `POST /upload`.
3. The backend stores the uploaded file in `backend/uploads/`.
4. Merchant metadata is extracted and optionally enriched.
5. Product-specific validation checks ensure the uploaded checklist matches the selected product.
6. A payment flow diagram is generated from the Mermaid template for that product.
7. The parsed audit data is converted into FRD-ready content.
8. Markdown and PDF outputs are written to `backend/generated_frds/`.
9. The frontend polls `GET /api/latest-frd` and exposes the latest PDF for download.

Note: FRD generation runs asynchronously after the upload request succeeds, so the upload API may return before the final document is ready.

## Repository structure

```text
.
├── backend/
│   ├── data/                  # Cached enrichments, summaries, and parsed checklist data
│   ├── diagrams/              # Generated payment flow images
│   ├── generated_frds/        # Generated Markdown and PDF files
│   ├── mappings/              # Product keys and documentation mappings
│   ├── public/                # Static assets used by generated documents
│   ├── routes/                # Express route modules
│   ├── services/              # Business logic for parsing, enrichment, docs, and export
│   ├── templates/             # Mermaid sequence diagram templates
│   └── server.js              # Backend entry point
├── frontend/
│   ├── public/
│   └── src/                   # React source code
├── MCHI_FRD.md                # Sample FRD output/reference
└── README.md
```

## Tech stack

- Frontend: React, Axios, Create React App
- Backend: Node.js, Express, Multer, XLSX
- AI enrichment: `@google/generative-ai`
- PDF generation: `markdown-pdf`
- Diagram rendering: Mermaid templates via `mermaid.ink`
- Optional storage integration: Google Drive via `googleapis`

## Getting started

### Prerequisites

- Node.js and npm
- Internet access for Gemini and Mermaid rendering
- A Gemini API key if merchant enrichment and summary generation should be enabled

### Installation

Install dependencies for both apps:

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

### Environment variables

Start from the committed example file:

```bash
cp backend/.env.example backend/.env
```

Then update `backend/.env` with the values you need:

```env
GEMINI_API_KEY=
HOST=127.0.0.1

# Optional Google Drive upload using OAuth 2.0
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# Optional Google Drive upload using a service account
GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH=
GOOGLE_DRIVE_FOLDER_ID=

# Optional manual merchant description override
MERCHANT_SERVICES=
```

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Recommended | Enables merchant enrichment and audit summary generation. |
| `HOST` | Optional | Backend bind address. Defaults to `127.0.0.1`. |
| `GOOGLE_CLIENT_ID` | Optional | OAuth 2.0 client ID for Google Drive uploads. |
| `GOOGLE_CLIENT_SECRET` | Optional | OAuth 2.0 client secret for Google Drive uploads. |
| `GOOGLE_REFRESH_TOKEN` | Optional | OAuth 2.0 refresh token for Google Drive uploads. |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_PATH` | Optional | Service account JSON path for Drive uploads if OAuth is not used. |
| `GOOGLE_DRIVE_FOLDER_ID` | Optional | Target Google Drive folder ID. |
| `MERCHANT_SERVICES` | Optional | Manual merchant context override used in specific cases. |

Google Drive upload is optional. The backend tries OAuth first and then falls back to a service account when available.

### Running locally

Start the backend:

```bash
cd backend
npm start
```

The backend runs on `http://127.0.0.1:5001` by default.

Start the frontend in a second terminal:

```bash
cd frontend
npm start
```

The frontend runs on `http://localhost:3000`.

## Usage

1. Open the frontend in the browser.
2. Select the relevant product module.
3. Upload the corresponding audit checklist in Excel format.
4. Wait for processing and FRD generation to finish.
5. Download the latest generated FRD PDF from the UI.

If the checklist content does not match the selected product, the backend returns a validation error and no FRD is generated.

## API reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Backend health/status response |
| `POST` | `/upload` | Upload and process an Excel checklist |
| `POST` | `/api/product-docs` | Resolve documentation links for a selected product |
| `GET` | `/api/latest-frd` | Fetch metadata for the latest generated FRD PDF |
| `GET` | `/generated_frds/:file` | Download generated FRD files |
| `GET` | `/uploads/:file` | Access uploaded checklist files |
| `GET` | `/public/:file` | Access public backend assets |

### Upload request

`POST /upload` expects multipart form data with:

- `product`: selected product name
- `checklist`: uploaded `.xls` or `.xlsx` file

The endpoint responds with upload and parsing details first, then continues summary generation and FRD generation in the background.

## Generated artifacts

| Path | Purpose |
| --- | --- |
| `backend/uploads/` | Raw uploaded checklists |
| `backend/diagrams/` | Generated product flow diagrams |
| `backend/generated_frds/` | Final Markdown and PDF FRDs |
| `backend/data/merchant_enrichment_data.json` | Cached merchant enrichment data |
| `backend/data/audit_summaries.json` | Stored audit summaries |
| `backend/data/*_checklist_data.json` | Product-specific parsed checklist snapshots |

## Implementation notes

- The frontend currently uses a hardcoded backend base URL of `http://localhost:5001` in [`frontend/src/App.js`](frontend/src/App.js).
- Generated checklist links inside the FRD also point to `http://localhost:5001/uploads/...` in [`backend/services/frdGeneratorService.js`](backend/services/frdGeneratorService.js).
- Diagram generation depends on access to `mermaid.ink`.
- The backend does not yet have a proper automated test suite wired to `npm test`.
- Frontend-specific setup and implementation notes now live in [`frontend/README.md`](frontend/README.md).

## Troubleshooting

- If port `5001` is already in use, stop the existing backend process and restart the server.
- If merchant enrichment is missing, verify that `GEMINI_API_KEY` is configured in `backend/.env`.
- If FRDs are not appearing in the UI, inspect `backend/generated_frds/` and review backend logs for generation errors.
- If Google Drive uploads fail, the local FRD generation flow should still continue unless the backend logs show a broader failure.

## Suggested next improvements

- Add a real backend test command and formalize the existing verification scripts
- Move hardcoded service URLs into environment-based configuration
