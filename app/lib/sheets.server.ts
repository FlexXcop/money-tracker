import { google } from 'googleapis';
import { log } from './logger.server';

// Singleton — reuse across requests in the same server instance
let _sheets: ReturnType<typeof google.sheets> | null = null;

function getSheetsClient() {
  if (_sheets) return _sheets;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      // The private key is stored with literal \n in the env var; replace with real newlines
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

export async function appendExpense(row: string[]): Promise<void> {
  try {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `${process.env.GOOGLE_SHEET_NAME}!A:G`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    log('info', 'sheets_append_success');
  } catch (err) {
    const error = err as Error;
    log('error', 'sheets_append_error', { error: error.message });
    throw err;
  }
}

export async function getRecentExpenses(count = 20): Promise<string[][]> {
  try {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: `${process.env.GOOGLE_SHEET_NAME}!A:G`,
    });
    const values = res.data.values ?? [];
    // Skip header row, take last `count` rows, reverse (newest first)
    return values.slice(1).slice(-count).reverse() as string[][];
  } catch (err) {
    const error = err as Error;
    log('error', 'sheets_get_error', { error: error.message });
    throw err;
  }
}
