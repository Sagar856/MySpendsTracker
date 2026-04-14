export const ACCOUNTS = ["UPI", "Cash", "Credit Card", "Debit Card"] as const;
export const TRAN_TYPES = ["Debit", "Credit"] as const;

export const CATEGORY_TYPES = ["Expense", "Income", "Investment", "Loan"] as const;

// Fallbacks (only used if Config_Categories sheet is missing/empty)
export const FALLBACK_INVESTMENT_CATEGORIES = ["Inv_SIP", "Inv_Stocks", "Inv_Others"] as const;
export const FALLBACK_LOAN_CATEGORIES = ["Loan", "Lend", "Loan St Received", "Loan St Paid"] as const;

// For Daily sheet: these categories mean "Place" is used as Person
export const DAILY_PERSON_LIKE_CATEGORIES = new Set<string>(["Loan", "Lend", "Loan St Received", "Loan St Paid"]);






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

