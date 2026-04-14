import { apiFetch } from "./client";

export type BudgetRecord = {
  id: number;
  month: string; // YYYY-MM
  category: string;
  budgetAmount: number;
  updatedAt: string;
};

export async function listBudgets(month?: string) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return apiFetch<{ records: BudgetRecord[] }>(`/.netlify/functions/budgets${qs}`);
}

export async function upsertBudget(input: { month: string; category: string; budgetAmount: number }) {
  return apiFetch<{ ok: true; id: number; created?: boolean; updated?: boolean }>(
    "/.netlify/functions/budgets",
    { method: "POST", body: JSON.stringify(input) }
  );
}

export async function deleteBudget(id: number) {
  return apiFetch<{ ok: true }>(`/.netlify/functions/budgets?id=${id}`, { method: "DELETE" });
}