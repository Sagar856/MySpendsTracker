import { apiFetch } from "./client";

export type LoanRecord = {
  id: number;
  person: string;
  initialDate: string;
  totalAmount: number;
  loanOrLend: "Loan" | "Lend" | string;
  description: string;
  settledDate: string;
  transferredAmount: number;
  balanceAmount: number;
  status: string;
};

export async function listLoans() {
  return apiFetch<{ records: LoanRecord[] }>("/.netlify/functions/loans");
}

export async function updateLoan(
  id: number,
  input: {
    person: string;
    initialDate: string; // yyyy-mm-dd
    totalAmount: number;
    loanOrLend: "Loan" | "Lend";
    description?: string;
    settledDate?: string; // yyyy-mm-dd or ""
    transferredAmount?: number;
  }
) {
  return apiFetch<{ ok: true }>(`/.netlify/functions/loans?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteLoan(id: number) {
  return apiFetch<{ ok: true }>(`/.netlify/functions/loans?id=${id}`, { method: "DELETE" });
}

export async function addLoanTransaction(input: {
  kind: "Loan" | "Lend";
  date: string; // yyyy-mm-dd
  person: string;
  amount: number;
  tranType?: "Credit" | "Debit";
  account: string;
  description?: string;
  referenceId?: string;
}) {
  return apiFetch<{ ok: true; dailyId: number; loanId: number }>(
    "/.netlify/functions/add-loan-transaction",
    { method: "POST", body: JSON.stringify(input) }
  );
}