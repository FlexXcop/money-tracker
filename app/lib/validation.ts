import { z } from 'zod';
import { EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAVINGS_CATEGORIES,
  METHODS,
  SOURCES, } from './constants';

export const baseSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid month'),
  item: z.string().min(1, 'Item is required').max(100, 'Item too long'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .transform(Number)
    .pipe(z.number().positive('Amount must be positive')),
  method: z.enum(METHODS, {
    message: 'Pick a payment method',
  }),
  source: z.enum(SOURCES, {
    message: 'Select a source',
  }),
});

export const expenseSchema = baseSchema.extend({
  category: z.enum(EXPENSE_CATEGORIES, { message: 'Pick a category' }),
});

export const incomeSchema = baseSchema.extend({
  category: z.enum(INCOME_CATEGORIES, { message: 'Pick a category' }),
});

export const savingsSchema = baseSchema.extend({
  category: z.enum(SAVINGS_CATEGORIES, { message: 'Pick a category' }),
});
