const { requireUser } = require("./_lib/auth");
const {
  getSheetsApi,
  sanitizeCell,
  fmtTimestamp,
  getNextId,
  findRowNumberById,
  deleteRow,
} = require("./_lib/google");

const TITLE = "Config_Categories";
const ALLOWED_TYPES = new Set(["Expense", "Income", "Investment", "Loan"]);

function toBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "yes" || s === "1";
}
function toNum(v) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

exports.handler = async (event, context) => {
  const auth = requireUser(context);
  if (!auth.ok) return auth.response;

  try {
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) throw new Error("Missing SHEET_ID");
    const sheets = getSheetsApi();

    if (event.httpMethod === "GET") {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${TITLE}'!A2:G`,
      });

      const rows = resp.data.values || [];
      const records = rows
        .map((r) => ({
          id: Number(r[0] || 0),
          category: String(r[1] || "").trim(),
          type: String(r[2] || "").trim(),
          active: toBool(r[3]),
          color: String(r[4] || "").trim(),
          sortOrder: toNum(r[5]),
          updatedAt: String(r[6] || "").trim(),
        }))
        .filter((x) => x.id && x.category);

      records.sort((a, b) => (a.sortOrder - b.sortOrder) || a.category.localeCompare(b.category));
      return json(200, { records });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      const category = sanitizeCell(body.category || "").trim();
      const type = sanitizeCell(body.type || "").trim();
      const active = !!body.active;
      const color = sanitizeCell(body.color || "").trim();
      const sortOrder = toNum(body.sortOrder);

      if (!category) return json(400, { error: "Category is required" });
      if (!ALLOWED_TYPES.has(type)) return json(400, { error: "Invalid type" });

      // prevent duplicate category (case-insensitive)
      const existingResp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${TITLE}'!B2:B`,
      });
      const existing = (existingResp.data.values || []).flat().map(v => String(v || "").toLowerCase());
      if (existing.includes(category.toLowerCase())) {
        return json(409, { error: "Category already exists" });
      }

      const nextId = await getNextId({ sheets, spreadsheetId, title: TITLE });
      const updatedAt = fmtTimestamp(new Date());

      const row = [
        nextId,
        category,
        type,
        active ? "TRUE" : "FALSE",
        color,
        sortOrder,
        updatedAt,
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${TITLE}'!A:G`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });

      return json(200, { ok: true, id: nextId });
    }

    if (event.httpMethod === "PUT") {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: "Missing id" });

      const body = JSON.parse(event.body || "{}");

      const category = sanitizeCell(body.category || "").trim();
      const type = sanitizeCell(body.type || "").trim();
      const active = !!body.active;
      const color = sanitizeCell(body.color || "").trim();
      const sortOrder = toNum(body.sortOrder);

      if (!category) return json(400, { error: "Category is required" });
      if (!ALLOWED_TYPES.has(type)) return json(400, { error: "Invalid type" });

      const rowNumber = await findRowNumberById({ sheets, spreadsheetId, title: TITLE, id });
      if (!rowNumber) return json(404, { error: "Not found" });

      const updatedAt = fmtTimestamp(new Date());

      const row = [
        Number(id),
        category,
        type,
        active ? "TRUE" : "FALSE",
        color,
        sortOrder,
        updatedAt,
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${TITLE}'!A${rowNumber}:G${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });

      return json(200, { ok: true });
    }

    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: "Missing id" });

      const rowNumber = await findRowNumberById({ sheets, spreadsheetId, title: TITLE, id });
      if (!rowNumber) return json(404, { error: "Not found" });

      await deleteRow({ sheets, spreadsheetId, title: TITLE, rowNumber });
      return json(200, { ok: true });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: e.message || "Server error" });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}