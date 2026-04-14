import { apiFetch } from "./client";

export type CategoryType = "Expense" | "Income" | "Investment" | "Loan";

export type CategoryRecord = {
  id: number;
  category: string;
  type: CategoryType;
  active: boolean;
  color: string;
  sortOrder: number;
  updatedAt: string;
};

export async function listCategories() {
  return apiFetch<{ records: CategoryRecord[] }>("/.netlify/functions/categories");
}

export async function createCategory(input: Omit<CategoryRecord, "id" | "updatedAt">) {
  return apiFetch<{ ok: true; id: number }>("/.netlify/functions/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCategory(id: number, input: Omit<CategoryRecord, "id" | "updatedAt">) {
  return apiFetch<{ ok: true }>(`/.netlify/functions/categories?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteCategory(id: number) {
  return apiFetch<{ ok: true }>(`/.netlify/functions/categories?id=${id}`, {
    method: "DELETE",
  });
}