import { apiFetch } from "./client";

export type DailyRecord = {
  id: number;
  date: string; // mm/dd/yyyy
  amount: number;
  category: string;
  tranType: string;
  account: string;
  description: string;
  place: string;
  refTimestamp: string;
  referenceId: string;
};

export type DailyCreateInput = {
  date: string; // yyyy-mm-dd
  amount: number;
  category: string;
  tranType: string;
  account: string;
  description?: string;
  place?: string;
  referenceId?: string;
};

export async function listDaily() {
  return apiFetch<{ records: DailyRecord[] }>("/.netlify/functions/daily");
}
export async function addDaily(input: DailyCreateInput) {
  return apiFetch<{ ok: true; id: number }>("/.netlify/functions/daily", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export async function updateDaily(id: number, input: DailyCreateInput) {
  return apiFetch<{ ok: true }>(`/.netlify/functions/daily?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
export async function deleteDaily(id: number) {
  return apiFetch<{ ok: true }>(`/.netlify/functions/daily?id=${id}`, { method: "DELETE" });
}