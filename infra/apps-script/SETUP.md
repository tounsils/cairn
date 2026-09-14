# Apps Script signup collector — setup

About three minutes. No AWS, no credit card, no credentials to rotate, nothing to tear down afterwards.

---

## Steps

1. **Create the sheet.** Go to [sheets.new](https://sheets.new). Name it `Cairn signups`.

2. **Open the script editor.** In that sheet: **Extensions → Apps Script**.

3. **Paste the code.** Delete whatever is in `Code.gs` and paste the entire contents of [`Code.gs`](Code.gs) from this folder. Save (Ctrl+S).

4. **Deploy as a web app.** **Deploy → New deployment → gear icon → Web app**, then set:

   | Field | Value |
   |---|---|
   | Description | `cairn signups` |
   | Execute as | **Me** |
   | Who has access | **Anyone** |

   "Anyone" is required. The landing page is public, so the people submitting are not signed into anything. It does not expose the sheet — only this script can write to it, and the script only ever appends.

5. **Authorise it.** Google will warn that the app is unverified, because it is your own script rather than a published add-on. Click **Advanced → Go to Cairn signups (unsafe)** and allow. The permissions it asks for are exactly what the code uses: append to this spreadsheet, and send email as you for the notification.

6. **Copy the Web app URL.** It looks like:

   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

   Put it in `site/index.html`:

   ```js
   const FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycb.../exec";
   ```

   Push. The Pages workflow deploys it and the form is live.

---

## Checking it works

Open the deployment URL directly in a browser. A `GET` returns:

```json
{ "ok": true, "service": "cairn-signup", "rows": 0 }
```

If you see that, the endpoint is up. Then submit the real form once and confirm a row lands in the sheet and an email arrives.

## Reading the result

In the Apps Script editor, select `summary` from the function dropdown and **Run**. The execution log prints the numbers `docs/validation.md` actually decides on:

```
total 84 | named a crew 51 (60.7%) | cold 71 | warm 13
by source: {"reddit-geoguessr":44,"hackernews":27,"personal-network":13}

verdict: THIN — real but weak. One rewrite, one new channel, two more weeks
```

Cold and warm are separated deliberately. Friends sign up out of kindness, and mixing them is how a no gets read as a yes.

## Things worth knowing

**Duplicates are silently accepted.** Submitting twice returns the same success and writes one row. The endpoint never confirms whether an address is already on the list, so it cannot be used to check who signed up.

**The `named_a_crew` column is computed at write time**, so the decision does not depend on anyone re-reading free text later.

**Notifications are best-effort.** If the email fails, the row is still written — a failed notification must never lose a signup. Set `NOTIFY = ""` at the top of `Code.gs` to turn it off.

**Quotas are not a concern at this scale.** A consumer Google account allows roughly 100 `MailApp` emails a day and 20,000 script executions. The validation test targets 100 signups over two weeks.

**Changing a rule?** `infra/lib/signup.mjs` is the canonical statement of the validation rules and is unit tested (`node --test infra/test`). This file mirrors it. Change it there first, then port.
