export const ACCOUNTS = ["UPI", "Cash", "Credit Card", "Debit Card"] as const;
export const TRAN_TYPES = ["Debit", "Credit"] as const;

export const CATEGORY_TYPES = ["Expense", "Income", "Investment", "Loan"] as const;

// Fallbacks (used if Config_Categories is missing/empty)
export const FALLBACK_INVESTMENT_CATEGORIES = ["Inv_SIP", "Inv_Stocks", "Inv_Others"] as const;
export const FALLBACK_LOAN_CATEGORIES = ["Loan", "Lend", "Loan St Received", "Loan St Paid"] as const;

// Backward compatible exports (older pages may import these)
export const INVESTMENT_CATEGORIES = FALLBACK_INVESTMENT_CATEGORIES;
export const LOAN_CATEGORIES = FALLBACK_LOAN_CATEGORIES;

// For Daily sheet: these categories mean "Place" is used as Person
export const DAILY_PERSON_LIKE_CATEGORIES = new Set<string>([
  "Loan",
  "Lend",
  "Loan St Received",
  "Loan St Paid",
]);



// export const ACCOUNTS = ["UPI", "Cash", "Credit Card", "Debit Card"] as const;
// export const TRAN_TYPES = ["Debit", "Credit"] as const;

// export const FINANCE_CATEGORIES = [
//   "Food",
//   "Groceries",
//   "Fuel",
//   "Inv_SIP",
//   "Inv_Stocks",
//   "Inv_Others",
//   "Rent",
//   "Shopping/Clothing",
//   "Bills",
//   "EMI",
//   "Medicine/Healthcare",
//   "Trips/Gateways",
//   "Salary",
//   "refunds",
//   "Other Personal",
//   "Other",
//   "Vehicle service",
//   "NA",
// ] as const;

// export const LOAN_CATEGORIES = ["Loan", "Lend", "Loan St Received", "Loan St Paid"] as const;
// export const INVESTMENT_CATEGORIES = ["Inv_SIP", "Inv_Stocks", "Inv_Others"] as const;

// export const DAILY_PERSON_LIKE_CATEGORIES = new Set<string>([
//   "Loan",
//   "Lend",
//   "Loan St Received",
//   "Loan St Paid",
// ]);

