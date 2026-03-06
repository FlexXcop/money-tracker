import {
  data,
  Form,
  useActionData,
  useNavigation,
} from 'react-router';
import { appendExpense } from '~/lib/sheets.server';

export async function action() {
  try {
    const row = [
      '2026-03-07', // Date
      'Danny', // Payee
      'Food', // Category
      '25000', // Amount (IDR)
      'Cash', // Payment Method
      'Test entry from DuitLog', // Description
    ];
    await appendExpense(row);
    return data({ success: true, message: 'Test row appended!' });
  } catch {
    return data(
      {
        success: false,
        error: 'Sheets API error — check server logs.',
      },
      { status: 500 },
    );
  }
}

export default function Index() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold tracking-tight">DuitLog</h1>
      <Form method="post">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {isSubmitting ? 'Appending...' : 'Append Test Row'}
        </button>
      </Form>
      {actionData &&
        'message' in actionData &&
        actionData.message && (
          <p className="text-green-600">{actionData.message}</p>
        )}
      {actionData && 'error' in actionData && actionData.error && (
        <p className="text-red-600">{actionData.error}</p>
      )}
    </main>
  );
}
