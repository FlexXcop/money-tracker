import { useState } from 'react';
import {
  data,
  useLoaderData,
  useNavigate,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router';
import type { Route } from './+types/history';
import { getExpensesByMonth } from '~/lib/sheets.server';
import { requireAuth } from '~/lib/auth.server';
import { resolveActiveMonth } from '~/lib/month.server';
import { selectedMonthCookie } from '~/lib/cookies.server';
import type { ExpenseEntry } from '~/lib/types';
import { ExpenseCard } from '~/components/expense-card';
import { MonthSelector } from '~/components/month-selector';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const url = new URL(request.url);
  const monthParam = url.searchParams.get('month');
  const cookieMonth = await selectedMonthCookie.parse(
    request.headers.get('Cookie'),
  );

  const { months, activeMonth } = await resolveActiveMonth(
    monthParam ?? cookieMonth,
  );

  try {
    const LIMIT = 20;
    const rows = await getExpensesByMonth(activeMonth, LIMIT);
    const entries: ExpenseEntry[] = rows.map((row) => ({
      timestamp: row[0] ?? '',
      item: row[1] ?? '',
      category: row[2] ?? '',
      amount: Number(row[3]) || 0,
      method: row[4] ?? '',
      date: row[5] ?? '',
      source: row[6] ?? '',
    }));
    return data({ entries, activeMonth, months });
  } catch {
    return data({
      entries: [] as ExpenseEntry[],
      activeMonth,
      months,
      error: 'Failed to load expenses',
    });
  }
}

export default function History() {
  const loaderData = useLoaderData<typeof loader>();
  const error =
    'error' in loaderData ? (loaderData.error as string) : null;
  const entries = loaderData.entries as ExpenseEntry[];
  const activeMonth = loaderData.activeMonth as string;
  const months = loaderData.months as string[];
  const navigate = useNavigate();
  const [sourceFilter, setSourceFilter] = useState<string>('All');

  function handleMonthChange(month: string) {
    navigate(`/history?month=${month}`);
  }

  const filtered =
    sourceFilter === 'All'
      ? entries
      : entries.filter((e) => e.source === sourceFilter);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      <header className="flex justify-between items-center shrink-0 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Recent Expenses
        </h1>
        <div className="mt-2">
          <MonthSelector
            months={months}
            activeMonth={activeMonth}
            onChange={handleMonthChange}
          />
        </div>
      </header>

      <div className="grid grid-cols-4 gap-1 px-4 pb-2">
        {['All', 'Danny', 'Dewi', 'Together'].map((s) => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
              sourceFilter === s
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="px-4 text-sm text-red-600">{error}</p>}

      {filtered.length === 0 && !error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <span className="text-5xl">🧾</span>
          <p className="text-lg font-semibold text-slate-700">
            No expenses yet
          </p>
          <p className="text-sm text-slate-400">
            Start logging your expenses from the Add tab.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
          {filtered.map((entry, i) => (
            <ExpenseCard
              key={`${entry.timestamp}-${i}`}
              entry={entry}
            />
          ))}
        </div>
      )}
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isDev =
    typeof process !== 'undefined' &&
    process.env &&
    process.env.NODE_ENV === 'development';
  const message = isRouteErrorResponse(error)
    ? error.statusText || 'Something went wrong'
    : error instanceof Error
      ? isDev
        ? error.message
        : 'Something went wrong'
      : 'Something went wrong';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-white px-6 text-center">
      <h1 className="text-xl font-bold text-slate-900">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-slate-500">{message}</p>
      <a
        href="/"
        className="mt-6 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white"
      >
        Go home
      </a>
    </main>
  );
}
