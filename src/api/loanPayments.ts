import { apiFetch } from "./client";

export type LoanPayment = {
  id: number;
  loanId: number;
  date: string; // mm/dd/yyyy
  amount: number;
  method: string;
  note: string;
  refTimestamp: string;
};

export async function listLoanPayments(loanId: number) {
  return apiFetch<{ records: LoanPayment[] }>(
    `/.netlify/functions/loan-payments?loanId=${encodeURIComponent(String(loanId))}`
  );
}

export async function addLoanPayment(input: {
  loanId: number;
  date: string; // yyyy-mm-dd
  amount: number;
  method: string;
  note?: string;
}) {
  return apiFetch<{ ok: true; paid: number; remaining: number; settled: boolean }>(
    "/.netlify/functions/loan-payments",
    { method: "POST", body: JSON.stringify({ action: "payment", ...input }) }
  );
}

export async function settleLoan(input: {
  loanId: number;
  date: string; // yyyy-mm-dd
  method: string;
  note?: string;
}) {
  return apiFetch<{ ok: true; paid: number; remaining: number; settled: boolean }>(
    "/.netlify/functions/loan-payments",
    { method: "POST", body: JSON.stringify({ action: "settle", ...input }) }
  );
}