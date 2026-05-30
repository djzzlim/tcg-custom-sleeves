/**
 * Fulfillment Webhook — Google Apps Script (S3 only, no Google Drive)
 *
 * Deploy from your order spreadsheet: Extensions → Apps Script → Deploy → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Sheet row 1 headers:
 *   Timestamp | Purchase ID | Photo Link | Quantity | Sleeve Type | Design Name | Status
 *
 * IMPORTANT: doPost must be at the top level — do NOT wrap it inside myFunction().
 */

/** Set false to also log editor auto-save rows (status "Draft"). */
var LOG_DRAFT_ROWS = false;

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var purchaseId = data.purchaseId || 'UNKNOWN';
    var designs = data.designs || [];
    var orderStatus = data.status || 'Unpaid';

    if (!LOG_DRAFT_ROWS && orderStatus === 'Draft') {
      return jsonResponse({ success: true, links: [], skipped: 'Draft' });
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var results = [];

    designs.forEach(function (design) {
      var fileUrl = design.dataUrl || '';

      if (fileUrl.indexOf('http://') !== 0 && fileUrl.indexOf('https://') !== 0) {
        throw new Error(
          'Expected an S3 https URL in design.dataUrl, got: ' + fileUrl.substring(0, 80)
        );
      }

      sheet.appendRow([
        new Date(),
        purchaseId,
        fileUrl,
        design.quantity || '',
        design.sleeveType || '',
        design.name || '',
        orderStatus,
      ]);

      results.push(fileUrl);
    });

    return jsonResponse({ success: true, links: results });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
