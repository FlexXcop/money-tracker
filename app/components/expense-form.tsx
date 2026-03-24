import React, { useReducer, type RefObject } from 'react';
import { toast } from 'sonner';
import { Form } from 'react-router';
import { endOfMonth, format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { METHODS, SOURCES } from '~/lib/constants';
import { Calendar } from '~/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { cn } from '~/lib/utils';

interface ExpenseFormProps {
  title?: string;
  categories: readonly string[];
  submitLabel?: string;
  sourceLabel?: string;
  errors?: Record<string, string>;
  isSubmitting?: boolean;
  amountRef?: RefObject<HTMLInputElement | null>;
  selectedMonth?: string;
  defaultSource?: string;
  isOnline?: boolean;
  onOfflineSubmit?: (formData: FormData) => Promise<void>;
}

function toDateString(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type State = {
  date: Date;
  calendarOpen: boolean;
  amount: string;
};

type Action =
  | { type: 'select_date'; date: Date }
  | { type: 'toggle_calendar'; open: boolean }
  | { type: 'set_amount'; value: string };

function formatAmount(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'select_date':
      return { ...state, date: action.date, calendarOpen: false };
    case 'toggle_calendar':
      return { ...state, calendarOpen: action.open };
    case 'set_amount':
      return { ...state, amount: formatAmount(action.value) };
    default:
      return state;
  }
}

export function ExpenseForm({
  title,
  categories,
  submitLabel = 'Save Transaction',
  sourceLabel = 'Source',
  errors,
  isSubmitting,
  amountRef,
  selectedMonth,
  defaultSource,
  isOnline = true,
  onOfflineSubmit,
}: ExpenseFormProps) {
  const [state, dispatch] = useReducer(reducer, {
    date: new Date(),
    calendarOpen: false,
    amount: '',
  });

  const maxDate = selectedMonth
    ? endOfMonth(new Date(`${selectedMonth}-01`))
    : undefined;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (isOnline) return;

    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const amount = formData.get('amount') as string;
    const category = formData.get('category') as string;
    const method = formData.get('method') as string;
    const source = formData.get('source') as string;
    const item = formData.get('item') as string;
    const date = formData.get('date') as string;

    if (!amount || !category || !method || !source || !item || !date) {
      toast.error('Please fill in all required fields.');
      return;
    }

    const numAmount = Number(amount);
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      toast.error('Amount must be a positive number.');
      return;
    }

    try {
      await onOfflineSubmit?.(formData);
    } catch {
      toast.error('Failed to save offline entry.');
    }
  }

  return (
    <Form
      method="post"
      className="flex flex-col gap-4 p-4"
      onSubmit={handleSubmit}
    >
      {title ? (
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">
            Fill in the transaction details below.
          </p>
        </div>
      ) : null}

      {selectedMonth && (
        <input type="hidden" name="month" value={selectedMonth} />
      )}

      {/* Amount */}
      <fieldset>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Amount
        </label>
        <div className="flex items-center gap-2 rounded-xl border-2 border-slate-200 px-4 py-3 focus-within:border-slate-900">
          <span className="text-lg font-semibold text-slate-400">IDR</span>

          <input
            type="hidden"
            name="amount"
            value={state.amount.replace(/,/g, '')}
          />

          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            placeholder="0"
            autoFocus
            value={state.amount}
            onChange={(e) =>
              dispatch({
                type: 'set_amount',
                value: e.target.value,
              })
            }
            className="w-full bg-transparent text-3xl font-bold text-slate-900 outline-none placeholder:text-slate-300"
          />
        </div>
        {errors?.amount && (
          <p className="mt-1 text-xs text-red-500">{errors.amount}</p>
        )}
      </fieldset>

      {/* Item */}
      <fieldset>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Item
        </label>
        <input
          type="text"
          name="item"
          placeholder="What is this transaction for?"
          maxLength={100}
          className="w-full rounded-lg border-2 border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-900"
        />
        {errors?.item && (
          <p className="mt-1 text-xs text-red-500">{errors.item}</p>
        )}
      </fieldset>

      {/* Category */}
      <fieldset>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Category
        </label>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((category) => (
            <label key={category} className="cursor-pointer">
              <input
                type="radio"
                name="category"
                value={category}
                className="peer sr-only"
              />
              <div className="rounded-lg bg-slate-100 px-2 py-2 text-center text-xs font-medium text-slate-600 transition-colors peer-checked:bg-slate-900 peer-checked:text-white">
                {category}
              </div>
            </label>
          ))}
        </div>
        {errors?.category && (
          <p className="mt-1 text-xs text-red-500">{errors.category}</p>
        )}
      </fieldset>

      {/* Payment Method */}
      <fieldset>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Payment Method
        </label>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((method) => (
            <label key={method} className="cursor-pointer">
              <input
                type="radio"
                name="method"
                value={method}
                className="peer sr-only"
              />
              <div className="rounded-lg bg-slate-100 px-2 py-2 text-center text-xs font-medium text-slate-600 transition-colors peer-checked:bg-slate-900 peer-checked:text-white">
                {method}
              </div>
            </label>
          ))}
        </div>
        {errors?.method && (
          <p className="mt-1 text-xs text-red-500">{errors.method}</p>
        )}
      </fieldset>

      {/* Date */}
      <fieldset>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Date
        </label>

        <input type="hidden" name="date" value={toDateString(state.date)} />

        <Popover
          open={state.calendarOpen}
          onOpenChange={(open) =>
            dispatch({ type: 'toggle_calendar', open })
          }
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'w-full rounded-lg border-2 border-slate-200 px-4 py-3 text-left text-sm text-slate-700 outline-none transition-colors hover:border-slate-300 focus:border-slate-900',
                state.calendarOpen && 'border-slate-900',
              )}
            >
              <span className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-slate-400" />
                {format(state.date, 'EEEE, d MMMM yyyy')}
              </span>
            </button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-auto">
            <Calendar
              mode="single"
              selected={state.date}
              onSelect={(d) =>
                d && dispatch({ type: 'select_date', date: d })
              }
              disabled={maxDate ? (d) => d > maxDate : undefined}
              endMonth={maxDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {errors?.date && (
          <p className="mt-1 text-xs text-red-500">{errors.date}</p>
        )}
      </fieldset>

      {/* Source */}
      <fieldset>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          {sourceLabel}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {SOURCES.map((source) => (
            <label key={source} className="cursor-pointer">
              <input
                type="radio"
                name="source"
                value={source}
                defaultChecked={source === (defaultSource ?? SOURCES[0])}
                className="peer sr-only"
              />
              <div className="rounded-lg bg-slate-100 px-2 py-2 text-center text-xs font-medium text-slate-600 transition-colors peer-checked:bg-slate-900 peer-checked:text-white">
                {source}
              </div>
            </label>
          ))}
        </div>
        {errors?.source && (
          <p className="mt-1 text-xs text-red-500">{errors.source}</p>
        )}
      </fieldset>

      {/* Submit */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Saving...
          </span>
        ) : isOnline ? (
          submitLabel
        ) : (
          'Save Offline'
        )}
      </button>
    </Form>
  );
}