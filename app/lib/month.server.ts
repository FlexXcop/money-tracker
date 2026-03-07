import { getAvailableMonths } from './sheets.server';

export async function resolveActiveMonth(
  cookieMonth?: string
): Promise<{ months: string[]; activeMonth: string }> {
  const months = await getAvailableMonths();

  if (months.length === 0) {
    throw new Error(
      'No monthly sheet tabs found. Create a tab named YYYY-MM (e.g., 2025-07) in the spreadsheet.'
    );
  }

  // Priority 1: cookie value, if it still exists as a tab
  if (cookieMonth && months.includes(cookieMonth)) {
    return { months, activeMonth: cookieMonth };
  }

  // Priority 2: current calendar month (in Asia/Jakarta timezone)
  const jakartaFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  });
  const jakartaParts = jakartaFormatter.formatToParts(new Date());
  const jakartaYear = jakartaParts.find((p) => p.type === 'year')?.value;
  const jakartaMonth = jakartaParts.find((p) => p.type === 'month')?.value;
  const currentMonth =
    jakartaYear && jakartaMonth ? `${jakartaYear}-${jakartaMonth}` : months[0];
  if (months.includes(currentMonth)) {
    return { months, activeMonth: currentMonth };
  }

  // Priority 3: most recent available month
  return { months, activeMonth: months[0] };
}
