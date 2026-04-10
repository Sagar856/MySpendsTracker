const { requireUser } = require("./_lib/auth");
const {
  getSheetsApi, sanitizeCell, num, fmtDateMMDDYYYY, fmtTimestamp,
  getNextId, findRowNumberById, deleteRow,
} = require("./_lib/google");

const TITLE = "Daily";

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
        range: `'${TITLE}'!A2:J`,
      });

      const rows = resp.data.values || [];
      const records = rows
        .map((r) => ({
          id: Number(r[0] || 0),
          date: String(r[1] || ""),
          amount: num(r[2]),
          category: String(r[3] || ""),
          tranType: String(r[4] || ""),
          account: String(r[5] || ""),
          description: String(r[6] || ""),
          place: String(r[7] || ""),
          refTimestamp: String(r[8] || ""),
          referenceId: String(r[9] || ""),
        }))
        .filter((x) => x.id);

      return json(200, { records });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (!(Number(body.amount) > 0)) return json(400, { error: "Amount must be > 0" });

      const nextId = await getNextId({ sheets, spreadsheetId, title: TITLE });

      const row = [
        nextId,
        fmtDateMMDDYYYY(body.date),
        Number(body.amount),
        sanitizeCell(body.category || "NA"),
        sanitizeCell(body.tranType || "Debit"),
        sanitizeCell(body.account || "UPI"),
        sanitizeCell(body.description || ""),
        sanitizeCell(body.place || ""),
        fmtTimestamp(new Date()),
        sanitizeCell(body.referenceId || "NA"),
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${TITLE}'!A:J`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });

      return json(200, { ok: true, id: nextId });
    }

    if (event.httpMethod === "PUT") {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: "Missing id" });
      const body = JSON.parse(event.body || "{}");

      const rowNumber = await findRowNumberById({ sheets, spreadsheetId, title: TITLE, id });
      if (!rowNumber) return json(404, { error: "Not found" });

      const updated = [
        Number(id),
        fmtDateMMDDYYYY(body.date),
        Number(body.amount || 0),
        sanitizeCell(body.category || "NA"),
        sanitizeCell(body.tranType || "Debit"),
        sanitizeCell(body.account || "UPI"),
        sanitizeCell(body.description || ""),
        sanitizeCell(body.place || ""),
        fmtTimestamp(new Date()),
        sanitizeCell(body.referenceId || "NA"),
      ];

      // FIX: Daily is A:J (10 cols)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${TITLE}'!A${rowNumber}:J${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [updated] },
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