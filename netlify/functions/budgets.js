const { requireUser } = require("./_lib/auth");
const {
  getSheetsApi,
  sanitizeCell,
  num,
  fmtTimestamp,
  getNextId,
  findRowNumberById,
  deleteRow,
} = require("./_lib/google");

const TITLE = "Budgets"; // sheet tab name

function isValidMonth(m) {
  return typeof m === "string" && /^\d{4}-\d{2}$/.test(m);
}

exports.handler = async (event, context) => {
  const auth = requireUser(context);
  if (!auth.ok) return auth.response;

  try {
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) throw new Error("Missing SHEET_ID");
    const sheets = getSheetsApi();

    if (event.httpMethod === "GET") {
      const month = event.queryStringParameters?.month || "";

      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${TITLE}'!A2:E`,
      });

      const rows = resp.data.values || [];
      let records = rows
        .map((r) => ({
          id: Number(r[0] || 0),
          month: String(r[1] || ""),
          category: String(r[2] || ""),
          budgetAmount: num(r[3]),
          updatedAt: String(r[4] || ""),
        }))
        .filter((x) => x.id && x.month);

      if (month) records = records.filter((x) => x.month === month);

      // sort by category
      records.sort((a, b) => a.category.localeCompare(b.category));

      return json(200, { records });
    }

    // Upsert by (Month + Category)
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const month = body.month;
      const category = sanitizeCell(body.category || "");
      const budgetAmount = Number(body.budgetAmount || 0);

      if (!isValidMonth(month)) return json(400, { error: "Invalid month. Use YYYY-MM" });
      if (!category) return json(400, { error: "Category is required" });
      if (!(budgetAmount >= 0)) return json(400, { error: "BudgetAmount must be >= 0" });

      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${TITLE}'!A2:E`,
      });

      const rows = resp.data.values || [];

      // Find existing row by month+category (B and C)
      const idx = rows.findIndex((r) => String(r[1] || "") === month && String(r[2] || "") === category);

      const updatedAt = fmtTimestamp(new Date());

      if (idx >= 0) {
        const rowNumber = idx + 2; // because range starts at row 2
        const existingId = Number(rows[idx][0] || 0) || (await getNextId({ sheets, spreadsheetId, title: TITLE }));

        const updatedRow = [existingId, month, category, budgetAmount, updatedAt];

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${TITLE}'!A${rowNumber}:E${rowNumber}`,
          valueInputOption: "RAW",
          requestBody: { values: [updatedRow] },
        });

        return json(200, { ok: true, id: existingId, updated: true });
      } else {
        const nextId = await getNextId({ sheets, spreadsheetId, title: TITLE });
        const newRow = [nextId, month, category, budgetAmount, updatedAt];

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `'${TITLE}'!A:E`,
          valueInputOption: "RAW",
          requestBody: { values: [newRow] },
        });

        return json(200, { ok: true, id: nextId, created: true });
      }
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