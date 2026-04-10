const { requireUser } = require("./_lib/auth");
const {
  getSheetsApi, sanitizeCell, fmtDateMMDDYYYY, fmtTimestamp, getNextId,
} = require("./_lib/google");

const DAILY = "Daily";
const LOANS = "Lend&Loan";

exports.handler = async (event, context) => {
  const auth = requireUser(context);
  if (!auth.ok) return auth.response;

  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) throw new Error("Missing SHEET_ID");
    const sheets = getSheetsApi();

    const body = JSON.parse(event.body || "{}");
    const kind = body.kind; // "Loan" | "Lend"

    if (!["Loan", "Lend"].includes(kind)) return json(400, { error: "kind must be Loan or Lend" });
    if (!body.person) return json(400, { error: "Person is required" });
    if (!(Number(body.amount) > 0)) return json(400, { error: "Amount must be > 0" });

    const date = fmtDateMMDDYYYY(body.date);
    const amount = Number(body.amount);

    const defaultTranType = kind === "Loan" ? "Credit" : "Debit";

    const dailyId = await getNextId({ sheets, spreadsheetId, title: DAILY });
    const loanId = await getNextId({ sheets, spreadsheetId, title: LOANS });

    // Daily row: Person stored in Place column (Daily schema unchanged)
    const dailyRow = [
      dailyId,
      date,
      amount,
      kind,
      sanitizeCell(body.tranType || defaultTranType),
      sanitizeCell(body.account || "UPI"),
      sanitizeCell(body.description || ""),
      sanitizeCell(body.person),
      fmtTimestamp(new Date()),
      sanitizeCell(body.referenceId || "NA"),
    ];

    // Lend&Loan row
    const loanRow = [
      loanId,
      sanitizeCell(body.person),
      date,
      amount,
      kind, // correct meaning
      sanitizeCell(body.description || ""),
      "",
      0,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${DAILY}'!A:J`,
      valueInputOption: "RAW",
      requestBody: { values: [dailyRow] },
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${LOANS}'!A:H`,
      valueInputOption: "RAW",
      requestBody: { values: [loanRow] },
    });

    return json(200, { ok: true, dailyId, loanId });
  } catch (e) {
    return json(500, { error: e.message || "Server error" });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}