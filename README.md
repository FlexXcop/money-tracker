# DuitLog

> A zero-friction expense tracker PWA backed by Google Sheets.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)
![React Router](https://img.shields.io/badge/React_Router-v7-orange.svg)

## Overview

DuitLog is a mobile-first Progressive Web App for logging daily expenses in under 10 seconds. It uses Google Sheets as the single source of truth — the app is purely a fast input surface, while all analysis (pivots, charts, dashboards) lives in Sheets. Designed for couples who want a shared, no-fuss expense tracker they can launch from the phone home screen.

> **Note:** This app was originally built for my wife and me to track our daily expenses together. Because of that, some values are hardcoded to fit our specific needs — things like expense sources (`Danny`, `Dewi`, `Together`), payment methods (`Cash`, `BCA Debit`, `QRIS`), categories, the passcode-based auth, and the Google Sheet ID. That said, the foundation is designed to be extensible. Feel free to fork this repo and adapt these values to your own setup — most of them live in `app/lib/constants.ts` and `.env`.

### How it works

```mermaid
flowchart LR
    A["Phone (PWA)"] -->|Form POST| B["React Router v7\nServer Action"]
    A -->|Offline| E["IndexedDB Queue"]
    E -->|Background Sync\nor online event| F["/api/sync"]
    F -->|Validate with Zod| C
    B -->|Validate with Zod| C["Google Sheets API v4"]
    C --> D["Google Spreadsheet\n(Monthly tabs: YYYY-MM)"]
    D -->|loader read| B
    B -->|JSON response| A
```

## Features

- Sub-10-second expense logging from phone home screen
- Mobile-first UI with numeric keyboard, smart defaults, one-hand operation
- Google Sheets as canonical datastore (no secondary database)
- 9 categories (Food, Transport, Groceries, Utilities, Health, Entertainment, Shopping, Education, Other)
- 3 payment methods (Cash, BCA Debit, QRIS)
- Multi-source tracking (Danny, Dewi, Together) with cookie persistence
- Category and payment method selection via tap-friendly pill buttons
- Expense history with source filtering and month navigation
- Installable PWA (Android + iOS) with SW update notifications
- Simple passcode authentication with 30-day sessions
- Haptic feedback on successful save

### Offline Support

DuitLog works offline with a two-layer sync system:

- **IndexedDB queue** — When offline (or server unreachable), expenses are saved locally to IndexedDB. The submit button changes to "Save Offline" and an amber banner indicates offline status.
- **SW Background Sync** — On supported browsers, the service worker registers a `sync-expenses` event. When connectivity returns, the SW automatically syncs queued expenses to `/api/sync`.
- **Client-side fallback sync** — On browsers without `SyncManager` (e.g. iOS Safari), the app listens for `online` events and syncs pending expenses from the main thread.
- **Web Lock coordination** — Both sync paths acquire a `navigator.locks` Web Lock (`duitlog-sync`) to prevent concurrent sync and double-submission.
- **Offline history** — Previously loaded history entries are cached in `localStorage` and shown when offline.
- **Navigation fallback** — Failed navigation requests fall back to a cached `/offline` page.
- **Static asset caching** — JS, CSS, images, and manifest use a stale-while-revalidate strategy.

## Tech Stack

| Layer      | Technology                             |
| ---------- | -------------------------------------- |
| Framework  | React Router v7 (Framework Mode)       |
| Language   | TypeScript                             |
| Styling    | Tailwind CSS v4                        |
| Data Layer | Google Sheets API v4 (Service Account) |
| Validation | Zod                                    |
| Deployment | Vercel (Serverless)                    |

## Getting Started

### Prerequisites

- Node.js >= 20
- npm
- A Google Cloud project with the Sheets API enabled
- A Service Account with a JSON key (see [Google Sheets Setup](#google-sheets-setup))

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/dannycahyo/duit-log.git
cd duit-log

# 2. Install dependencies
npm install

# 3. Copy the environment template and fill in your values
cp .env.example .env

# 4. Start the dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

## Google Sheets Setup

Follow these steps to configure Google Sheets as your datastore:

1. **Create a GCP project**
   Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new project (or use an existing one).

2. **Enable the Google Sheets API**
   In your project, navigate to **APIs & Services > Library**, search for "Google Sheets API", and enable it.

3. **Create a Service Account**
   Go to **APIs & Services > Credentials > Create Credentials > Service Account**. Give it a name (e.g., `duitlog-sheets`), then click **Done**.

4. **Download the JSON key**
   On the Service Account detail page, go to the **Keys** tab, click **Add Key > Create new key**, and choose **JSON**. Save the downloaded file securely.

5. **Extract credentials from the JSON key**
   Open the JSON file and copy:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY`

6. **Create a Google Spreadsheet**
   Create a new spreadsheet in Google Sheets.

7. **Create monthly sheet tabs**

   The app uses **monthly tabs** with the naming pattern **`YYYY-MM`** (e.g., `2025-01`, `2025-07`, `2026-03`). You must manually create a tab for each month you want to track. The app does **not** auto-create tabs — if a tab is missing, the API returns a 400 error.

   Each tab needs the following header row (row 1, columns A–G):

   | Timestamp | Item | Category | Amount | Method | Date | Source |
   | --------- | ---- | -------- | ------ | ------ | ---- | ------ |

   | Column        | Description                                                                                      | Example             |
   | ------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
   | A - Timestamp | Auto-generated server timestamp (Asia/Jakarta)                                                   | `3/9/2026 14:05:32` |
   | B - Item      | Expense description                                                                              | `Nasi goreng`       |
   | C - Category  | One of: Food, Transport, Groceries, Utilities, Health, Entertainment, Shopping, Education, Other | `Food`              |
   | D - Amount    | Amount in IDR (numeric)                                                                          | `25000`             |
   | E - Method    | One of: Cash, BCA Debit, QRIS                                                                    | `QRIS`              |
   | F - Date      | User-selected date (`M/D/YYYY`)                                                                  | `3/9/2026`          |
   | G - Source    | One of: Danny, Dewi, Together                                                                    | `Danny`             |

   > **Tip:** Create tabs for the next few months in advance so the app is always ready. The app reads all tabs matching the `YYYY-MM` pattern and shows the most recent first.

8. **Share the spreadsheet with the Service Account**
   Click **Share**, paste the `client_email` from step 5, and grant **Editor** access.

9. **Copy the Spreadsheet ID**
   From the spreadsheet URL `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`, copy the `SPREADSHEET_ID` portion.

10. **Fill in the `.env` file**
    Populate all values in your `.env` file using the credentials and IDs from the steps above.

> **Note about `GOOGLE_PRIVATE_KEY`:** The key from the JSON file contains real newlines. In the `.env` file, store it as a single line with literal `\n` characters, wrapped in double quotes (e.g., `"-----BEGIN PRIVATE KEY-----\nMIIEv....\n-----END PRIVATE KEY-----\n"`). The app parses this at runtime with `.replace(/\\n/g, "\n")`.

## Project Structure

```
duit-log/
├── app/
│   ├── root.tsx                 # Root layout, SW registration, bottom nav
│   ├── routes/
│   │   ├── _index.tsx           # "/" — Add Expense form + action
│   │   ├── history.tsx          # "/history" — Expense history with filters
│   │   ├── login.tsx            # "/login" — Passcode entry
│   │   ├── offline.tsx          # "/offline" — Offline fallback page
│   │   └── api.sync.tsx         # "/api/sync" — Offline sync endpoint
│   ├── lib/
│   │   ├── sheets.server.ts     # Google Sheets API client
│   │   ├── auth.server.ts       # Session/cookie helpers
│   │   ├── cookies.server.ts    # Month & source cookie persistence
│   │   ├── month.server.ts      # Month resolution & network error detection
│   │   ├── logger.server.ts     # Structured JSON logging
│   │   ├── constants.ts         # Categories, methods, sources
│   │   ├── validation.ts        # Zod schemas
│   │   ├── offline-queue.ts     # IndexedDB queue for pending expenses
│   │   ├── sync.ts              # Client-side sync logic
│   │   └── types.ts             # Shared types
│   └── components/
│       ├── expense-form.tsx     # Main expense input form
│       └── expense-card.tsx     # Single expense entry card
├── public/
│   ├── manifest.webmanifest     # PWA manifest
│   ├── sw.js                    # Service worker (cache + background sync)
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
├── .env.example                 # Environment variable template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── react-router.config.ts
```

## Available Scripts

| Command             | Description                     |
| ------------------- | ------------------------------- |
| `npm run dev`       | Start development server        |
| `npm run build`     | Production build                |
| `npm run start`     | Start production server locally |
| `npm run typecheck` | Run TypeScript type checking    |

The `@react-router/node` adapter handles the serverless function configuration.

## Roadmap

- **v1.5:** Today's spending total widget
- **v2:** Category/method management, auto sheet tab creation
- **v3:** Receipt photo upload, monthly summaries, Google Sign-In

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
