# Google Sheets order logging (Apps Script)

This app sends completed orders to **one Google Apps Script Web App URL**. The script appends rows to a spreadsheet. Customers using the website never sign in to Google — only your team manages the sheet.

**You can develop with your personal Google account now.** When the company is ready, they repeat the same steps with their Google account and update one environment variable (`GOOGLE_SHEETS_WEBHOOK_URL`).

---

## How it fits together

```text
Customer browser  →  Next.js server  →  POST JSON  →  Apps Script Web App (/exec)
                                                              ↓
                                                    Google Spreadsheet (order rows)
```

| Piece | Who owns it | Notes |
|-------|-------------|--------|
| Website (Vercel / company server) | Company | Set `GOOGLE_SHEETS_WEBHOOK_URL` in production env |
| Spreadsheet | Company Google account | Share with fulfillment team (view/edit) |
| Apps Script + Web App deploy | Same Google account as the sheet | Deploy once; URL ends with `/exec` |
| S3 image URLs | Company infra | Written into the **Photo Link** column |

The Next.js app does **not** store a spreadsheet ID. Switching Google accounts = new sheet + new script deploy + new webhook URL.

---

## Spreadsheet columns

Create row 1 as headers (column order must match the script):

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Timestamp | Purchase ID | Photo Link | Quantity | Sleeve Type | Design Name | Status |

- **Photo Link** — S3 URL (`design.dataUrl` from checkout).
- **Quantity** — sleeves for that design (e.g. `65`).
- **Sleeve Type** — `Standard` or `Japanese`.
- **Design Name** — e.g. `Design #1` (helpful when one order has multiple designs).
- **Status** — `Unpaid` on checkout. Editor auto-save sends `Draft`; the script skips those by default (`LOG_DRAFT_ROWS = false` in the script).

No customer name, email, or Google Drive — images stay on S3 only.

---

## Part A — Set up with your Google (development)

Do this on **your** account while building and testing.

### 1. Create the spreadsheet

1. [Google Drive](https://drive.google.com) → **New** → **Google Sheets**.
2. Name it e.g. `TCG Custom Sleeves Orders (Dev)`.
3. Add the header row from the table above.

### 2. Add Apps Script (bound to this sheet)

1. In the sheet: **Extensions** → **Apps Script**.
2. Delete any sample code.
3. Copy the full script from [`apps-script/fulfillment-webhook.gs`](../apps-script/fulfillment-webhook.gs) in this repo and paste it into the editor.
4. **Save** the project (name e.g. `Fulfillment Webhook`).

Because the script is opened **from the spreadsheet**, it uses `SpreadsheetApp.getActiveSpreadsheet()` — no spreadsheet ID to configure.

### 3. Deploy as Web App

1. **Deploy** → **New deployment**.
2. Click the gear → type **Web app**.
3. Settings:
   - **Execute as:** Me (`your@gmail.com`)
   - **Who has access:** **Anyone**
4. **Deploy** → complete Google authorization if prompted.
5. Copy the **Web app URL**. It must look like:
   ```text
   https://script.google.com/macros/s/AKfycb.../exec
   ```
   Not a `docs.google.com/spreadsheets/...` link.

### 4. Configure the Next.js app (local)

In the project root, create or edit `.env.local`:

```env
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Restart the dev server:

```bash
npm run dev
```

### 5. Test the webhook

Replace `YOUR_EXEC_URL` with your `/exec` URL:

```bash
curl -L -X POST "YOUR_EXEC_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseId": "TEST-001",
    "customerName": "Test User",
    "customerEmail": "test@example.com",
    "status": "Unpaid",
    "designs": [{
      "name": "Design #1",
      "quantity": 65,
      "sleeveType": "Standard",
      "packName": "Pack #1",
      "packSize": 65,
      "dataUrl": "https://example.com/preview.jpg"
    }]
  }'
```

Expected response:

```json
{"success":true,"links":["https://example.com/preview.jpg"]}
```

A new row should appear in your sheet.

**If you see HTML `Access denied`:** redeploy with **Who has access: Anyone** (not “Only myself”).

---

## Part B — Hand off to the company Google account

When operations should own orders (not your personal Gmail):

### Checklist for the company admin

1. **Sign in** with the company Google account (or a shared Workspace user e.g. `orders@company.com`).

2. **Create a new spreadsheet** (do not rely on the developer’s personal sheet for production).

3. **Extensions → Apps Script** → paste the same script from [`apps-script/fulfillment-webhook.gs`](../apps-script/fulfillment-webhook.gs).

4. **Deploy → New deployment → Web app**
   - Execute as: **Me** (company account)
   - Who has access: **Anyone**
   - Copy the new **`/exec`** URL.

5. **Share the spreadsheet** with fulfillment / CS (Editor or Viewer). They only need the sheet link — not the webhook URL.

6. **Update environment variables** everywhere the app runs:

   | Environment | Where to set |
   |-------------|----------------|
   | Production (Vercel, AWS, etc.) | Hosting dashboard → Environment variables |
   | Staging | Same, separate value if they use a test sheet |
   | Developers’ laptops | `.env.local` (optional; use dev or prod URL as agreed) |

   ```env
   GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/COMPANY_NEW_ID/exec
   ```

7. **Redeploy / restart** the website so the new env var loads.

8. **Run one test order** (or the `curl` command above) and confirm a row lands in the **company** sheet.

9. **Retire the developer sheet** (optional): stop using the old `/exec` URL so test orders do not mix with production.

### What does *not* need to change in code

- No spreadsheet ID in the repository.
- No Google login in the website.
- Same script file for dev and prod — only the deploy URL and which Google account owns the sheet differ.

### After you change the Apps Script code

Google does not auto-update live deployments:

1. **Deploy → Manage deployments**
2. Edit (pencil) → **Version: New version**
3. **Deploy**

If the `/exec` URL changes (rare on “New version” of same deployment), update `GOOGLE_SHEETS_WEBHOOK_URL` again.

---

## Payload reference (from this app)

`POST` body sent to the webhook:

```json
{
  "purchaseId": "PUR-20250529-abc",
  "remarks": "From Basket Checkout",
  "status": "Unpaid",
  "designs": [
    {
      "name": "Design #1",
      "quantity": 65,
      "sleeveType": "Standard",
      "packName": "Pack #1",
      "packSize": 65,
      "dataUrl": "https://s3.example.com/bucket/designs/PUR-.../design-id_preview.jpg"
    }
  ]
}
```

- **`dataUrl`** must be an **HTTPS S3 URL**. The script writes it to **Photo Link** (no Google Drive upload).
- Checkout sends **`status: "Unpaid"`** — one row per design.
- Auto-save sends **`status: "Draft"`** — skipped by default; set `LOG_DRAFT_ROWS = true` in the script if you want those rows too.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Access denied` (HTML) | Web app access must be **Anyone**; use `/exec` not `/dev` |
| `GOOGLE_SHEETS_WEBHOOK_URL is not configured` | Add variable to `.env.local` or hosting env; restart |
| Row missing after checkout | Check server logs for `[Order API]`; test with `curl` |
| Photo Link broken in browser | S3 bucket may be private; URL still valid for ops if they use signed access or internal tools |
| Orders on wrong sheet | Wrong webhook URL still pointing at developer deploy — update prod env |

---

## Security notes

- Treat `GOOGLE_SHEETS_WEBHOOK_URL` like a secret: anyone who knows it can POST rows to your sheet. Restrict who can edit the Apps Script project.
- Do not commit `.env.local` to git.
- Rotate the Web App deployment if the URL leaks (new deployment → update env).
