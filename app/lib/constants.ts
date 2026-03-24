export const TRANSACTION_TYPES = ['Expense', 'Income', 'Savings'] as const;

export const EXPENSE_CATEGORIES = [
  'Food & Drinks',
  'Transport',
  'Groceries',
  'Pulsa & Internet',
  'Work/Office',
  'Personal Care',
  'Utilities',
  'Health',
  'Entertainment',
  'Shopping',
  'Education',
  'Emergency',
  'Other'
] as const;

export const INCOME_CATEGORIES = [
  'Gaji Intern',
  'Uang Bulanan',
  'Reimburse',
  'Bonus',
  'Gift',
  'Other',
] as const;

export const SAVINGS_CATEGORIES = [
  'Dana Darurat',
  'Tabungan Bulanan',
  'Sewa/Kos',
  'Pulang Kampung',
  'Gadget',
  'Investasi',
  'Other',
] as const;


export const METHODS = ['Cash', 'Gopay', 'Transfer', 'ShopeePay', 'BRI', 'BCA', 'Aladin', 'Jago', 'QRIS'] as const;

export const SOURCES = ['Hussen', 'Reimburse', 'Shared'] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type SavingsCategory = (typeof SAVINGS_CATEGORIES)[number];
export type Method = (typeof METHODS)[number];
export type Source = (typeof SOURCES)[number];