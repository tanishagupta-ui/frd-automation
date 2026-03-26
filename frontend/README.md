# Frontend

This frontend powers the FRD Automation user interface. It lets users select a product module, upload an audit checklist, monitor document generation, and download the latest generated FRD PDF.

## Overview

The frontend is a React application created with Create React App and styled as a compact dashboard workflow. It talks to the backend API running on `http://localhost:5001`.

### Current user flow

1. Select a product module from the left navigation panel.
2. Upload a matching Excel checklist using drag-and-drop or the file picker.
3. Wait while the backend parses the checklist and generates the FRD.
4. Poll for the latest generated FRD.
5. Download the resulting PDF once it is available.

## Key features

- Product-based audit workflow
- Drag-and-drop Excel upload
- Upload validation for `.xls` and `.xlsx`
- Live processing and status messaging
- Polling-based FRD readiness check
- Direct PDF download from the generated artifact endpoint
- Light and dark theme toggle persisted in local storage

## Tech stack

- React 19
- Axios
- Create React App (`react-scripts`)
- Plain CSS via `src/App.css` and `src/index.css`

## Project structure

```text
frontend/
├── public/
├── src/
│   ├── App.js          # Main application UI and workflow logic
│   ├── App.css         # Main dashboard styling
│   ├── App.test.js     # Default CRA test scaffold
│   ├── index.js        # React entry point
│   ├── index.css       # Global styles
│   ├── reportWebVitals.js
│   └── setupTests.js
├── package.json
└── README.md
```

## Getting started

### Prerequisites

- Node.js and npm
- The backend service running locally on port `5001`

### Install dependencies

```bash
npm install
```

### Start the development server

```bash
npm start
```

The app will run on [http://localhost:3000](http://localhost:3000).

## Available scripts

### `npm start`

Starts the development server.

### `npm test`

Runs the React test runner in watch mode.

### `npm run build`

Builds the app for production into the `build/` directory.

### `npm run eject`

Ejects the Create React App configuration.

## Backend dependency

The UI currently uses a hardcoded backend base URL:

```js
const BASE_URL = "http://localhost:5001";
```

This is used for:

- `POST /upload`
- `GET /api/latest-frd`
- downloading generated FRD files

If the backend is not running on port `5001`, uploads and downloads will fail until the frontend is updated or the backend is exposed on that address.

## UI behavior

### Product modules

The current product list rendered in the UI includes:

- Standard Checkout
- Subscriptions
- QR Code
- Affordability
- Smart Collect
- Route
- Payment Links
- Charge at Will

### Theme persistence

The selected theme is stored in browser local storage under the key `fra-theme`.

### Polling behavior

After a successful upload, the UI polls the backend up to 15 times at roughly 2.5-second intervals to check whether a PDF has been generated.

## Development notes

- Most frontend logic currently lives in [`src/App.js`](src/App.js).
- Most styling currently lives in [`src/App.css`](src/App.css).
- The "Audit History" navigation item is present in the UI shell but does not yet have a connected workflow.
- The current test file is still the default CRA scaffold and does not meaningfully cover the upload workflow.

## Suggested improvements

- Move the backend base URL into environment-based configuration
- Split `App.js` into smaller UI and workflow components
- Add tests for upload, polling, error states, and download behavior
- Add a real audit history view if that sidebar action is intended to be active
