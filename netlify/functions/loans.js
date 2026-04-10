const { requireUser } = require("./_lib/auth");
const {
  getSheetsApi, sanitizeCell, num, fmtDateMMDDYYYY,
  getNextId, findRowNumberById, deleteRow,
} = require("./_lib/google");

const TITLE = "Lend&Loan";

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
          person: String(r[1] || ""),
          initialDate: String(r[2] || ""),
          totalAmount: num(r[3]),
          loanOrLend: String(r[4] || ""),
          description: String(r[5] || ""),
          settledDate: String(r[6] || ""),
          transferredAmount: num(r[7]),
          balanceAmount: num(r[8]),
          status: String(r[9] || ""),
        }))
        .filter((x) => x.id);

      return json(200, { records });
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (!body.person) return json(400, { error: "Person is required" });
      if (!(Number(body.totalAmount) > 0)) return json(400, { error: "Total amount must be > 0" });
      if (!["Loan", "Lend"].includes(body.loanOrLend)) return json(400, { error: "LoanOrLend must be Loan or Lend" });

      const nextId = await getNextId({ sheets, spreadsheetId, title: TITLE });

      const row = [
        nextId,
        sanitizeCell(body.person),
        fmtDateMMDDYYYY(body.initialDate),
        Number(body.totalAmount),
        sanitizeCell(body.loanOrLend), // no inversion
        sanitizeCell(body.description || ""),
        body.settledDate ? fmtDateMMDDYYYY(body.settledDate) : "",
        Number(body.transferredAmount || 0),
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${TITLE}'!A:H`,
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
        sanitizeCell(body.person || ""),
        fmtDateMMDDYYYY(body.initialDate),
        Number(body.totalAmount || 0),
        sanitizeCell(body.loanOrLend || ""),
        sanitizeCell(body.description || ""),
        body.settledDate ? fmtDateMMDDYYYY(body.settledDate) : "",
        Number(body.transferredAmount || 0),
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${TITLE}'!A${rowNumber}:H${rowNumber}`,
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