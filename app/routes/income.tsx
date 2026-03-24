import { useEffect, useRef, useState, useCallback } from 'react';
import {
  data,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router';
import type { Route } from './+types/income';
import {
  appendExpense,
  getAvailableMonths,
} from '~/lib/sheets.server';
import { incomeSchema } from '~/lib/validation';
import { ExpenseForm } from '~/components/expense-form';
import { MonthSelector } from '~/components/month-selector';
import { log } from '~/lib/logger.server';
import { toast } from 'sonner';
import { requireAuth } from '~/lib/auth.server';
import { resolveActiveMonth, isNetworkError } from '~/lib/month.server';
import {
  selectedMonthCookie,
  selectedSourceCookie,
} from '~/lib/cookies.server';
import {
  addPendingExpense,
  getPendingCount,
  registerBackgroundSync,
} from '~/lib/offline-queue';
import { syncPendingExpenses } from '~/lib/sync';
import { INCOME_CATEGORIES } from '~/lib/constants';

function formatMonthLabel(month: string): string {
  const date = new Date(month + '-01');
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

type ActionData =
  | {
      success: true;
      entry: {
        item: string;
        category: string;
        amount: number;
        method: string;
        date: string;
        source: string;
        month: string;
      };
    }
  | { success: false; errors: Record<string, string> }
  | { success: false; error: string }
  | {
      success: false;
      networkError: true;
      pendingData: {
        month: string;
        item: string;
        date: string;
        amount: number;
        category: string;
        method: string;
        source: string;
      };
    };

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const cookieHeader = request.headers.get('Cookie');
  const cookieMonth = await selectedMonthCookie.parse(cookieHeader);
  const cookieSource = await selectedSourceCookie.parse(cookieHeader);

  const { months, activeMonth } = await resolveActiveMonth(cookieMonth);

  return data({
    months,
    activeMonth,
    defaultSource: cookieSource ?? 'Hussen',
  });
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();

  const raw = {
    month: formData.get('month') as string,
    item: formData.get('item') as string,
    date: formData.get('date') as string,
    amount: formData.get('amount') as string,
    category: formData.get('category') as string,
    method: formData.get('method') as string,
    source: formData.get('source') as string,
  };

  const result = incomeSchema.safeParse(raw);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as string;
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return data({ success: false as const, errors: fieldErrors });
  }

  const parsed = result.data;

  // Verify the target month tab exists
  try {
    const availableMonths = await getAvailableMonths();
    if (!availableMonths.includes(parsed.month)) {
      return data({
        success: false as const,
        error:
          "Sheet tab '" +
          parsed.month +
          "' not found. Please create it in the spreadsheet.",
      });
    }
  } catch (err) {
    // Allow offline/network-failure flow to continue
    if (!isNetworkError(err)) throw err;
  }

  const now = new Date();
  const jakartaDate = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }),
  );

  const timestamp = `${jakartaDate.getMonth() + 1}/${jakartaDate.getDate()}/${jakartaDate.getFullYear()} ${String(jakartaDate.getHours()).padStart(2, '0')}:${String(jakartaDate.getMinutes()).padStart(2, '0')}:${String(jakartaDate.getSeconds()).padStart(2, '0')}`;

  const [year, month, day] = parsed.date.split('-');
  const formattedDate = `${Number(month)}/${Number(day)}/${year}`;

  const row = [
    timestamp,
    parsed.item,
    parsed.category,
    String(parsed.amount),
    parsed.method,
    formattedDate,
    parsed.source,
    'Income',
  ];

  try {
    await appendExpense(parsed.month, row);

    const headers = new Headers();
    headers.append(
      'Set-Cookie',
      await selectedMonthCookie.serialize(parsed.month),
    );
    headers.append(
      'Set-Cookie',
      await selectedSourceCookie.serialize(parsed.source),
    );

    return data(
      {
        success: true as const,
        entry: {
          item: parsed.item,
          category: parsed.category,
          amount: parsed.amount,
          method: parsed.method,
          date: parsed.date,
          source: parsed.source,
          month: parsed.month,
        },
      },
      { headers },
    );
  } catch (err) {
    if (isNetworkError(err)) {
      return data({
        success: false as const,
        networkError: true as const,
        pendingData: {
          month: parsed.month,
          item: parsed.item,
          date: parsed.date,
          amount: parsed.amount,
          category: parsed.category,
          method: parsed.method,
          source: parsed.source,
        },
      });
    }

    log('error', 'action_append_income_error', {
      error: (err as Error).message,
    });

    return data(
      {
        success: false as const,
        error: 'Failed to save income. Please try again.',
      },
      { status: 500 },
    );
  }
}

export default function IncomePage() {
  const { months, activeMonth, defaultSource } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as
    | ActionData
    | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const amountRef = useRef<HTMLInputElement>(null);

  const [selectedMonth, setSelectedMonth] = useState(activeMonth);
  const [formKey, setFormKey] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB may be unavailable
    }
  }, []);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    if (!isOnline || pendingCount === 0 || isSyncing) return;
    if (typeof window !== 'undefined' && 'SyncManager' in window) return;

    setIsSyncing(true);

    syncPendingExpenses((synced, total) => {
      setPendingCount(total - synced);
    })
      .then(({ synced, failed }) => {
        refreshPendingCount();
        if (synced > 0) {
          toast.success(
            `Synced ${synced} transaction${synced > 1 ? 's' : ''} to Google Sheets${failed > 0 ? ` (${failed} failed)` : ''}`,
          );
        }
      })
      .catch((error) => {
        console.error('Failed to sync pending transactions', error);
        toast.error(
          'Failed to sync pending transactions. They will be retried automatically when possible.',
        );
      })
      .finally(() => {
        setIsSyncing(false);
      });
  }, [isOnline, pendingCount, isSyncing, refreshPendingCount]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        refreshPendingCount();
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handler);
    };
  }, [refreshPendingCount]);

  useEffect(() => {
    if (!actionData) return;

    if (actionData.success) {
      const monthLabel = formatMonthLabel(actionData.entry.month);
      toast.success(
        `Saved income to ${monthLabel}: ${actionData.entry.item} — IDR ${actionData.entry.amount.toLocaleString()}`,
      );

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(50);
      }

      setFormKey((k) => k + 1);
      setTimeout(() => amountRef.current?.focus(), 100);
    } else if ('networkError' in actionData && actionData.networkError) {
      const fd = new FormData();
      Object.entries(actionData.pendingData).forEach(([k, v]) =>
        fd.set(k, String(v)),
      );
      handleOfflineSubmit(fd);
    } else if ('error' in actionData && actionData.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  function generateOfflineId(): string {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }

    return (
      'offline-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2)
    );
  }

  async function handleOfflineSubmit(formData: FormData) {
    const income = {
      id: generateOfflineId(),
      createdAt: new Date().toISOString(),
      formData: {
        month: formData.get('month') as string,
        item: formData.get('item') as string,
        date: formData.get('date') as string,
        amount: formData.get('amount') as string,
        category: formData.get('category') as string,
        method: formData.get('method') as string,
        source: formData.get('source') as string,
      },
    };

    try {
      await addPendingExpense(income);
      await registerBackgroundSync();
      await refreshPendingCount();

      toast('Saved offline — will sync when connected', {
        style: {
          backgroundColor: '#fffbeb',
          color: '#92400e',
          border: '1px solid #fde68a',
        },
      });

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(50);
      }

      setFormKey((k) => k + 1);
      setTimeout(() => amountRef.current?.focus(), 100);
    } catch (error) {
      console.error('Failed to save income offline', error);
      toast.error(
        'Could not save income for offline use. Please try again or submit when back online.',
      );
    }
  }

  const errors =
    actionData && !actionData.success && 'errors' in actionData
      ? actionData.errors
      : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      <header className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          DuitLog
        </h1>
        <div className="mt-2">
          <MonthSelector
            months={months}
            activeMonth={selectedMonth}
            onChange={setSelectedMonth}
          />
        </div>
      </header>

      {!isOnline && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">
          You're offline — income entries will be saved locally and synced
          when you reconnect.
        </div>
      )}

      {pendingCount > 0 && (
        <div className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-center text-sm text-blue-800">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
            {pendingCount}
          </span>
          {isSyncing
            ? 'Syncing...'
            : `pending transaction${pendingCount > 1 ? 's' : ''}`}
        </div>
      )}

      <ExpenseForm
        key={formKey}
        title="Add Income"
        categories={INCOME_CATEGORIES}
        submitLabel="Save Income"
        sourceLabel="Received by"
        errors={errors}
        isSubmitting={isSubmitting}
        amountRef={amountRef}
        selectedMonth={selectedMonth}
        defaultSource={defaultSource}
        isOnline={isOnline}
        onOfflineSubmit={handleOfflineSubmit}
      />
    </main>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isDev = process.env.NODE_ENV === 'development';

  const message = isRouteErrorResponse(error)
    ? error.statusText || 'Something went wrong'
    : isDev && error instanceof Error
      ? error.message
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