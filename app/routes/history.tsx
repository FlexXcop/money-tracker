import { useReducer, useEffect, useCallback } from 'react';
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
import { getPendingCount } from '~/lib/offline-queue';
import { syncPendingExpenses } from '~/lib/sync';
import { toast } from 'sonner';
import { SOURCES, TRANSACTION_TYPES } from '~/lib/constants';

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const url = new URL(request.url);
  const monthParam = url.searchParams.get('month');
  const cookieMonth = await selectedMonthCookie.parse(
    request.headers.get('Cookie'),
  );

  const { months, activeMonth, offline } = await resolveActiveMonth(
    monthParam ?? cookieMonth,
  );

  if (offline) {
    return data({
      entries: [] as ExpenseEntry[],
      activeMonth,
      months,
      offline: true,
    });
  }

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
      type: (row[7] as 'Expense' | 'Income' | 'Savings') || 'Expense',
    }));

    return data({
      entries,
      activeMonth,
      months,
    });
  } catch {
    return data({
      entries: [] as ExpenseEntry[],
      activeMonth,
      months,
      error: 'Failed to load transactions',
    });
  }
}

type State = {
  sourceFilter: string;
  typeFilter: string;
  pendingCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  cachedEntries: ExpenseEntry[];
};

type Action =
  | { type: 'SET_SOURCE_FILTER'; filter: string }
  | { type: 'SET_TYPE_FILTER'; filter: string }
  | { type: 'SET_PENDING_COUNT'; count: number }
  | { type: 'SET_ONLINE'; online: boolean }
  | { type: 'SET_SYNCING'; syncing: boolean }
  | { type: 'SET_CACHED_ENTRIES'; entries: ExpenseEntry[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_SOURCE_FILTER':
      return { ...state, sourceFilter: action.filter };
    case 'SET_TYPE_FILTER':
      return { ...state, typeFilter: action.filter };
    case 'SET_PENDING_COUNT':
      return { ...state, pendingCount: action.count };
    case 'SET_ONLINE':
      return { ...state, isOnline: action.online };
    case 'SET_SYNCING':
      return { ...state, isSyncing: action.syncing };
    case 'SET_CACHED_ENTRIES':
      return { ...state, cachedEntries: action.entries };
    default:
      return state;
  }
}

function formatIDR(value: number) {
  return `IDR ${value.toLocaleString('id-ID')}`;
}

type Totals = {
  income: number;
  expense: number;
  savings: number;
};

function calculateTotals(entries: ExpenseEntry[]): Totals {
  return entries.reduce(
    (acc, entry) => {
      if (entry.type === 'Income') acc.income += entry.amount;
      if (entry.type === 'Expense') acc.expense += entry.amount;
      if (entry.type === 'Savings') acc.savings += entry.amount;
      return acc;
    },
    { income: 0, expense: 0, savings: 0 },
  );
}

function getActiveBalance(totals: Totals) {
  return totals.income - totals.expense - totals.savings;
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'income' | 'expense' | 'savings' | 'balance';
}) {
  const activeBalancePositive = value >= 0;

  const styles = {
    income: {
      wrapper: 'rounded-xl border border-emerald-200 bg-emerald-50 p-3',
      label: 'text-xs text-emerald-700',
      value: 'text-sm font-bold text-emerald-900',
    },
    expense: {
      wrapper: 'rounded-xl border border-rose-200 bg-rose-50 p-3',
      label: 'text-xs text-rose-700',
      value: 'text-sm font-bold text-rose-900',
    },
    savings: {
      wrapper: 'rounded-xl border border-blue-200 bg-blue-50 p-3',
      label: 'text-xs text-blue-700',
      value: 'text-sm font-bold text-blue-900',
    },
    balance: activeBalancePositive
      ? {
          wrapper: 'rounded-xl border border-slate-900 bg-slate-900 p-3',
          label: 'text-xs text-slate-300',
          value: 'text-sm font-bold text-white',
        }
      : {
          wrapper: 'rounded-xl border border-amber-300 bg-amber-50 p-3',
          label: 'text-xs text-amber-700',
          value: 'text-sm font-bold text-amber-900',
        },
  }[tone];

  return (
    <div className={styles.wrapper}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{formatIDR(value)}</p>
    </div>
  );
}

export default function History() {
  const loaderData = useLoaderData<typeof loader>();
  const error =
    'error' in loaderData ? (loaderData.error as string) : null;
  const isOffline =
    'offline' in loaderData ? (loaderData.offline as boolean) : false;
  const entries = loaderData.entries as ExpenseEntry[];
  const activeMonth = loaderData.activeMonth as string;
  const months = loaderData.months as string[];
  const navigate = useNavigate();

  const [state, dispatch] = useReducer(reducer, {
    sourceFilter: 'All',
    typeFilter: 'All',
    pendingCount: 0,
    isOnline: true,
    isSyncing: false,
    cachedEntries: [],
  });

  const {
    sourceFilter,
    typeFilter,
    pendingCount,
    isOnline,
    isSyncing,
    cachedEntries,
  } = state;

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      dispatch({ type: 'SET_PENDING_COUNT', count });
    } catch {
      // IndexedDB not available
    }
  }, []);

  useEffect(() => {
    dispatch({ type: 'SET_ONLINE', online: navigator.onLine });
    refreshPendingCount();

    const handleOnline = () =>
      dispatch({ type: 'SET_ONLINE', online: true });
    const handleOffline = () =>
      dispatch({ type: 'SET_ONLINE', online: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshPendingCount]);

  useEffect(() => {
    if (isOffline || entries.length === 0) return;

    try {
      localStorage.setItem(
        `duitlog-history-${activeMonth}`,
        JSON.stringify(entries),
      );
    } catch {
      // localStorage unavailable
    }
  }, [entries, activeMonth, isOffline]);

  useEffect(() => {
    if (!isOffline) return;

    try {
      const cached = localStorage.getItem(`duitlog-history-${activeMonth}`);
      if (cached) {
        dispatch({
          type: 'SET_CACHED_ENTRIES',
          entries: JSON.parse(cached) as ExpenseEntry[],
        });
      }
    } catch {
      // localStorage unavailable
    }
  }, [isOffline, activeMonth]);

  useEffect(() => {
    if (!isOnline || pendingCount === 0 || isSyncing) return;
    if (typeof window !== 'undefined' && 'SyncManager' in window) return;

    dispatch({ type: 'SET_SYNCING', syncing: true });

    syncPendingExpenses((synced, total) => {
      dispatch({ type: 'SET_PENDING_COUNT', count: total - synced });
    })
      .then(({ synced, failed }) => {
        refreshPendingCount();

        if (synced > 0) {
          toast.success(
            `Synced ${synced} transaction${synced > 1 ? 's' : ''} to Google Sheets${failed > 0 ? ` (${failed} failed)` : ''}`,
          );
        }
      })
      .catch((syncError) => {
        console.error('Failed to sync pending transactions', syncError);
        toast.error(
          'Failed to sync pending transactions. Please try again.',
        );
      })
      .finally(() => {
        dispatch({ type: 'SET_SYNCING', syncing: false });
      });
  }, [isOnline, pendingCount, isSyncing, refreshPendingCount]);

  function handleMonthChange(month: string) {
    navigate(`/history?month=${month}`);
  }

  const displayEntries =
    isOffline && cachedEntries.length > 0 ? cachedEntries : entries;
  const isShowingCached = isOffline && cachedEntries.length > 0;

  const filtered = displayEntries.filter((entry) => {
    const sourceMatch =
      sourceFilter === 'All' || entry.source === sourceFilter;
    const typeMatch = typeFilter === 'All' || entry.type === typeFilter;
    return sourceMatch && typeMatch;
  });

  const monthlyTotals = calculateTotals(displayEntries);
  const filteredTotals = calculateTotals(filtered);

  const monthlyActiveBalance = getActiveBalance(monthlyTotals);
  const filteredActiveBalance = getActiveBalance(filteredTotals);

  const hasActiveFilter =
    sourceFilter !== 'All' || typeFilter !== 'All';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      <header className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Recent Transactions
        </h1>
        <div className="mt-2">
          <MonthSelector
            months={months}
            activeMonth={activeMonth}
            onChange={handleMonthChange}
          />
        </div>
      </header>

      {isOffline && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
          {isShowingCached
            ? "You're offline — showing last loaded data."
            : "You're offline — history unavailable until reconnected."}
        </div>
      )}

      {pendingCount > 0 && (
        <div className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-center text-sm text-blue-800">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
            {pendingCount}
          </span>
          {isSyncing
            ? 'Syncing...'
            : `pending transaction${pendingCount > 1 ? 's' : ''} — not yet in history`}
        </div>
      )}

      <div className="flex flex-wrap gap-2 px-4 pb-2">
        {['All', ...SOURCES].map((source) => (
          <button
            key={source}
            onClick={() =>
              dispatch({ type: 'SET_SOURCE_FILTER', filter: source })
            }
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              sourceFilter === source
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {source}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-2">
        {['All', ...TRANSACTION_TYPES].map((transactionType) => (
          <button
            key={transactionType}
            onClick={() =>
              dispatch({
                type: 'SET_TYPE_FILTER',
                filter: transactionType,
              })
            }
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              typeFilter === transactionType
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {transactionType}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 px-4 pb-3">
        <SummaryCard
          label="Income"
          value={monthlyTotals.income}
          tone="income"
        />
        <SummaryCard
          label="Expense"
          value={monthlyTotals.expense}
          tone="expense"
        />
        <SummaryCard
          label="Savings"
          value={monthlyTotals.savings}
          tone="savings"
        />
        <SummaryCard
          label="Active Balance"
          value={monthlyActiveBalance}
          tone="balance"
        />
      </div>

      {hasActiveFilter && (
        <div className="px-4 pb-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Filtered Summary
              </p>
              <p className="text-[11px] text-slate-400">
                {sourceFilter !== 'All' ? sourceFilter : 'All sources'} ·{' '}
                {typeFilter !== 'All' ? typeFilter : 'All types'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <SummaryCard
                label="Income"
                value={filteredTotals.income}
                tone="income"
              />
              <SummaryCard
                label="Expense"
                value={filteredTotals.expense}
                tone="expense"
              />
              <SummaryCard
                label="Savings"
                value={filteredTotals.savings}
                tone="savings"
              />
              <SummaryCard
                label="Active Balance"
                value={filteredActiveBalance}
                tone="balance"
              />
            </div>
          </div>
        </div>
      )}

      {error && <p className="px-4 text-sm text-red-600">{error}</p>}

      {filtered.length === 0 && !error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <span className="text-5xl">🧾</span>
          <p className="text-lg font-semibold text-slate-700">
            {displayEntries.length > 0
              ? 'No transactions match this filter'
              : isOffline
                ? 'No cached history for this month'
                : 'No transactions yet'}
          </p>
          <p className="text-sm text-slate-400">
            {displayEntries.length > 0
              ? 'Try changing the source or type filter above.'
              : isOffline
                ? 'Visit this month while online to cache it.'
                : 'Start logging your transactions from the tabs above.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 pb-4 pt-2">
          {filtered.map((entry, index) => (
            <ExpenseCard
              key={`${entry.timestamp}-${entry.item}-${index}`}
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

  const message = isRouteErrorResponse(error)
    ? error.statusText || 'Something went wrong'
    : error instanceof Error
      ? import.meta.env.DEV
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