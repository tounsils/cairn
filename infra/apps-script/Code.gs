/**
 * Cairn signup collector — Google Apps Script backend.
 *
 * Why this and not a server: the validation test needs to collect maybe a few
 * hundred rows over two weeks and then be READ by a human counting how many
 * people named a crew. That is a spreadsheet job. This runs free forever, has
 * no credentials to rotate, no bill to watch, and nothing to tear down.
 *
 * The validation rules here mirror infra/lib/signup.mjs, which is the
 * canonical statement of them and is unit tested. If you change a rule,
 * change it there first.
 *
 * SETUP: see SETUP.md in this folder. Six steps, about three minutes.
 */

// Emailed on every signup. Leave blank to disable notifications.
var NOTIFY = "tounsils@gmail.com";

// Matches infra/lib/signup.mjs
var LIMITS = { email: 254, crew: 500, src: 64, ua: 200 };
var MIN_ELAPSED_MS = 2000;
var HEADERS = ["ts", "email", "crew", "src", "named_a_crew", "country", "ua"];

function doPost(e) {
  try {
    var raw = e && e.postData ? e.postData.contents : "";
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      return json({ ok: false, error: "body must be JSON" });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json({ ok: false, error: "body must be a JSON object" });
    }

    // --- bot filters -------------------------------------------------------
    // A filled honeypot or an instant submission is accepted-looking and
    // discarded. Telling a scraper it was caught just teaches it what to fix.
    if (typeof payload.website === "string" && payload.website.trim() !== "") {
      return json({ ok: true, filtered: true });
    }
    var elapsed = Number(payload.elapsedMs);
    // > 0, not >= 0: Number(null) is 0 and would drop real people whose
    // client never sent a timer. Zero means unknown, and unknown is accepted.
    if (isFinite(elapsed) && elapsed > 0 && elapsed < MIN_ELAPSED_MS) {
      return json({ ok: true, filtered: true });
    }

    // --- validate ----------------------------------------------------------
    var email = String(payload.email == null ? "" : payload.email).trim().toLowerCase();
    if (!plausibleEmail(email)) {
      return json({ ok: false, error: "that email address does not look complete" });
    }

    var crew = clean(payload.crew, LIMITS.crew);
    var src = cleanSrc(payload.src);

    // --- store -------------------------------------------------------------
    // Lock so two people submitting at once cannot land on the same row.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getSheet();
      if (!alreadySignedUp(sheet, email)) {
        sheet.appendRow([
          new Date().toISOString(),
          email,
          crew,
          src,
          namedACrew(crew) ? "yes" : "no",
          clean(payload.country, 8),
          clean(payload.ua, LIMITS.ua),
        ]);
        notify(email, crew, src);
      }
    } finally {
      lock.releaseLock();
    }

    // A duplicate returns the same success as a new signup. The person does
    // not need to know, and it stops the endpoint confirming who is on the
    // list to anyone who probes it.
    return json({ ok: true });
  } catch (err) {
    // Never 500 at a person who just typed their email. Log it and accept;
    // the notification email is the backstop if the sheet write failed.
    console.error(err);
    return json({ ok: false, error: "something broke on our side, try once more" });
  }
}

/** Browsers preflight nothing here, but a GET makes the URL testable. */
function doGet() {
  return json({ ok: true, service: "cairn-signup", rows: getSheet().getLastRow() - 1 });
}

/* --- helpers -------------------------------------------------------------- */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("signups");
  if (!sheet) {
    sheet = ss.insertSheet("signups");
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function alreadySignedUp(sheet, email) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var col = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim().toLowerCase() === email) return true;
  }
  return false;
}

function plausibleEmail(v) {
  if (typeof v !== "string") return false;
  if (v.length < 6 || v.length > LIMITS.email) return false;
  if (/\s/.test(v)) return false;
  var at = v.indexOf("@");
  if (at < 1 || at !== v.lastIndexOf("@")) return false;
  var domain = v.slice(at + 1);
  if (domain.indexOf(".") === -1) return false;
  if (domain.charAt(0) === "." || domain.slice(-1) === "." || domain.indexOf("..") !== -1) return false;
  return /^[^@]+@[^@]+\.[A-Za-z]{2,}$/.test(v);
}

function clean(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\x00-\x1F\x7F]/g, " ") // control chars, incl. CR and LF
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanSrc(value) {
  var v = clean(value, LIMITS.src)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return v || "direct";
}

/** The metric the decision turns on. Politeness is not a crew. */
function namedACrew(crew) {
  var v = String(crew == null ? "" : crew).trim();
  if (v.length < 4) return false;
  if (/^(yes|no|na|n\/a|idk|me|none|maybe|test)$/i.test(v)) return false;
  return /\s/.test(v) || v.length >= 8;
}

function notify(email, crew, src) {
  if (!NOTIFY) return;
  try {
    MailApp.sendEmail({
      to: NOTIFY,
      subject: "Cairn signup — " + (crew ? crew.slice(0, 60) : "no crew named"),
      body:
        "email : " + email + "\n" +
        "crew  : " + (crew || "(blank)") + "\n" +
        "src   : " + src + "\n" +
        "named : " + (namedACrew(crew) ? "YES" : "no") + "\n",
    });
  } catch (err) {
    // A failed notification must never lose the row that was already written.
    console.error("notify failed", err);
  }
}

/**
 * Run this from the editor any time to get the numbers docs/validation.md
 * actually decides on. Cold and warm are reported separately on purpose:
 * friends sign up out of kindness and mixing them turns a no into a yes.
 */
function summary() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  if (last < 2) return console.log("no signups yet");

  var rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var total = rows.length,
    named = 0,
    warm = 0,
    bySrc = {};
  for (var i = 0; i < rows.length; i++) {
    var src = String(rows[i][3] || "direct");
    if (rows[i][4] === "yes") named++;
    if (/^(personal|friends|family|linkedin)/.test(src)) warm++;
    bySrc[src] = (bySrc[src] || 0) + 1;
  }
  var pct = Math.round((named / total) * 1000) / 10;
  console.log(
    "total " + total + " | named a crew " + named + " (" + pct + "%) | cold " +
      (total - warm) + " | warm " + warm + "\nby source: " + JSON.stringify(bySrc) +
      "\n\nverdict: " + verdict(total, pct)
  );
}

function verdict(total, pct) {
  if (pct < 20) return "KILL — they want a puzzle, not a crew (under 20% named one)";
  if (total >= 100) return "BUILD — 100+ signups and the crew idea landed";
  if (total >= 30) return "THIN — real but weak. One rewrite, one new channel, two more weeks";
  return "NO SIGNAL YET — likely a traffic problem, not a concept verdict";
}
