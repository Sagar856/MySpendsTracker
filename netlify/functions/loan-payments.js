const { requireUser } = require("./_lib/auth");
const {
  getSheetsApi,
  sanitizeCell,
  num,
  fmtDateMMDDYYYY,
  fmtTimestamp,
  getNextId,
  findRowNumberById,
} = require("./_lib/google");

const PAYMENTS_SHEET = "LoanPayments";
const LOANS_SHEET = "Lend&Loan";

exports.handler = async (event, context) => {
  const auth = requireUser(context);
  if (!auth.ok) return auth.response;

  try {
    const spreadsheetId = process.env.SHEET_ID;
    if (!spreadsheetId) throw new Error("Missing SHEET_ID");
    const sheets = getSheetsApi();

    // GET payments (optionally by loanId)
    if (event.httpMethod === "GET") {
      const loanId = event.queryStringParameters?.loanId;

      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${PAYMENTS_SHEET}'!A2:G`,
      });

      const rows = resp.data.values || [];
      let records = rows
        .map((r) => ({
          id: Number(r[0] || 0),
          loanId: Number(r[1] || 0),
          date: String(r[2] || ""),
          amount: num(r[3]),
          method: String(r[4] || ""),
          note: String(r[5] || ""),
          refTimestamp: String(r[6] || ""),
        }))
        .filter((x) => x.id && x.loanId);

      if (loanId) records = records.filter((x) => String(x.loanId) === String(loanId));

      // newest first
      records.sort((a, b) => b.id - a.id);

      return json(200, { records });
    }

    // POST add payment or settle
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");

      const action = String(body.action || "payment"); // "payment" | "settle"
      const loanId = Number(body.loanId || 0);
      const method = sanitizeCell(body.method || "UPI");
      const note = sanitizeCell(body.note || "");
      const date = fmtDateMMDDYYYY(body.date || new Date());

      if (!loanId) return json(400, { error: "loanId is required" });

      // find loan row
      const loanRowNumber = await findRowNumberById({
        sheets,
        spreadsheetId,
        title: LOANS_SHEET,
        id: loanId,
      });
      if (!loanRowNumber) return json(404, { error: "Loan not found" });

      // Read Total_Amount (D) and Transffered_Amount (H) and Settled_Date (G)
      const loanResp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${LOANS_SHEET}'!D${loanRowNumber}:H${loanRowNumber}`,
      });

      const cells = (loanResp.data.values || [[]])[0];
      const totalAmount = num(cells[0]);              // D
      const settledDateExisting = String(cells[3] || ""); // G
      const transferredExisting = num(cells[4]);      // H

      const remaining = Math.max(0, totalAmount - transferredExisting);
      if (remaining <= 0) return json(400, { error: "Loan already settled (remaining is 0)" });

      let payAmount = 0;

      if (action === "settle") {
        payAmount = remaining;
      } else {
        payAmount = Number(body.amount || 0);
        if (!(payAmount > 0)) return json(400, { error: "amount must be > 0" });
        // cap to remaining to avoid negative balance
        if (payAmount > remaining) payAmount = remaining;
      }

      const newTransferred = transferredExisting + payAmount;
      const shouldSettle = newTransferred >= totalAmount;

      const settledDate = shouldSettle ? (settledDateExisting || date) : (settledDateExisting || "");

      // 1) Append payment row
      const nextPaymentId = await getNextId({ sheets, spreadsheetId, title: PAYMENTS_SHEET });
      const paymentRow = [
        nextPaymentId,
        loanId,
        date,
        payAmount,
        method,
        note,
        fmtTimestamp(new Date()),
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${PAYMENTS_SHEET}'!A:G`,
        valueInputOption: "RAW",
        requestBody: { values: [paymentRow] },
      });

      // 2) Update loan row: Settled_Date (G) & Transffered_Amount (H)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${LOANS_SHEET}'!G${loanRowNumber}:H${loanRowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [[settledDate, newTransferred]] },
      });

      return json(200, {
        ok: true,
        paymentId: nextPaymentId,
        paid: payAmount,
        transferred: newTransferred,
        remaining: Math.max(0, totalAmount - newTransferred),
        settled: shouldSettle,
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (e) {
    return json(500, { error: e.message || "Server error" });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}