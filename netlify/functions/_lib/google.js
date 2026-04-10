const { google } = require("googleapis");

function getServiceAccount() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_B64");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

let sheetsApi;
function getSheetsApi() {
  if (sheetsApi) return sheetsApi;
  const sa = getServiceAccount();
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheetsApi = google.sheets({ version: "v4", auth });
  return sheetsApi;
}

// Prevent formula injection into Google Sheets
function sanitizeCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/^[=+\-@]/.test(s)) return `'${s}`;
  return s;
}

function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace("₹", "").replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtDateMMDDYYYY(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function fmtTimestamp(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${mi}:${ss}`;
}

async function getNextId({ sheets, spreadsheetId, title }) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${title}'!A:A`,
  });
  const values = (resp.data.values || []).slice(1).flat();
  const ids = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return ids.length ? Math.max(...ids) + 1 : 1;
}

async function findRowNumberById({ sheets, spreadsheetId, title, id }) {
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${title}'!A:A`,
  });
  const values = resp.data.values || [];
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1;
  }
  return null;
}

async function getSheetIdByTitle({ sheets, spreadsheetId, title }) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const s = (meta.data.sheets || []).find((x) => x.properties.title === title);
  if (!s) throw new Error(`Sheet not found: ${title}`);
  return s.properties.sheetId;
}

async function deleteRow({ sheets, spreadsheetId, title, rowNumber }) {
  const sheetId = await getSheetIdByTitle({ sheets, spreadsheetId, title });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}

module.exports = {
  getSheetsApi,
  sanitizeCell,
  num,
  fmtDateMMDDYYYY,
  fmtTimestamp,
  getNextId,
  findRowNumberById,
  deleteRow,
};