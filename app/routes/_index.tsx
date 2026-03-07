import { useEffect, useRef, useState } from 'react';
import {
  data,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router';
import type { Route } from './+types/_index';
import {
  appendExpense,
  getAvailableMonths,
} from '~/lib/sheets.server';
import { expenseSchema } from '~/lib/validation';
import { ExpenseForm } from '~/components/expense-form';
import { MonthSelector } from '~/components/month-selector';
import { log } from '~/lib/logger.server';
import { toast } from 'sonner';
import { requireAuth } from '~/lib/auth.server';
import { resolveActiveMonth } from '~/lib/month.server';
import {
  selectedMonthCookie,
  selectedUserCookie,
} from '~/lib/cookies.server';

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
        description: string;
        month: string;
      };
    }
  | { success: false; errors: Record<string, string> }
  | { success: false; error: string };

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);

  const cookieHeader = request.headers.get('Cookie');
  const cookieMonth = await selectedMonthCookie.parse(cookieHeader);
  const cookieUser = await selectedUserCookie.parse(cookieHeader);

  const { months, activeMonth } =
    await resolveActiveMonth(cookieMonth);

  return data({
    months,
    activeMonth,
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
    description: formData.get('description') as string,
  };

  const result = expenseSchema.safeParse(raw);

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

  const now = new Date();
  const jakartaDate = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }),
  );
  const timestamp = `${jakartaDate.getMonth() + 1}/${jakartaDate.getDate()}/${jakartaDate.getFullYear()} ${String(jakartaDate.getHours()).padStart(2, '0')}:${String(jakartaDate.getMinutes()).padStart(2, '0')}:${String(jakartaDate.getSeconds()).padStart(2, '0')}`;

  const [year, month, day] = parsed.date.split('-');
  const formattedDate = `${Number(month)}/${Number(day)}/${year}`;

  const row = [
    timestamp, // Timestamp
    parsed.item, // Item
    parsed.category, // Category
    String(parsed.amount), // Amount (IDR)
    parsed.method, // Payment Method
    formattedDate, // Date
    parsed.description, // Description
  ];

  try {
    await appendExpense(parsed.month, row);
    const headers = new Headers();
    headers.append(
      'Set-Cookie',
      await selectedMonthCookie.serialize(parsed.month),
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
          description: parsed.description,
          month: parsed.month,
        },
      },
      { headers },
    );
  } catch (err) {
    log('error', 'action_append_error', {
      error: (err as Error).message,
    });
    return data(
      {
        success: false as const,
        error: 'Failed to save. Please try again.',
      },
      { status: 500 },
    );
  }
}

export default function Index() {
  const { months, activeMonth } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as
    | ActionData
    | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';
  const amountRef = useRef<HTMLInputElement>(null);

  const [selectedMonth, setSelectedMonth] = useState(activeMonth);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!actionData) return;

    if (actionData.success) {
      const monthLabel = formatMonthLabel(actionData.entry.month);
      toast.success(
        `Saved to ${monthLabel}: ${actionData.entry.item} — IDR ${actionData.entry.amount.toLocaleString()}`,
      );
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      ) {
        navigator.vibrate(50);
      }
      setFormKey((k) => k + 1);
      setTimeout(() => amountRef.current?.focus(), 100);
    } else if ('error' in actionData && actionData.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  const errors =
    actionData && !actionData.success && 'errors' in actionData
      ? actionData.errors
      : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white">
      <header className="px-4 flex justify-between items-center pt-[max(1.5rem,env(safe-area-inset-top))] pb-2 shrink-0">
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
      <ExpenseForm
        key={formKey}
        errors={errors}
        isSubmitting={isSubmitting}
        amountRef={amountRef}
        selectedMonth={selectedMonth}
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
