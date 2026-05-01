import { NextResponse } from 'next/server';

/**
 * Handle order submission:
 * Delegates both Drive upload and Sheet logging to Google Apps Script
 * to leverage the user's storage quota.
 */
export async function POST(request: Request) {
  try {
    const { purchaseId, remarks, designs, customerName, customerEmail } = await request.json();

    if (!purchaseId || !designs || !Array.isArray(designs)) {
      return NextResponse.json({ success: false, message: 'Missing order data' }, { status: 400 });
    }

    const webhookUrl = (process.env.GOOGLE_SHEETS_WEBHOOK_URL || '').trim();
    console.log(`[Order API] Delegating order ${purchaseId} to Apps Script at: "${webhookUrl}"`);
    if (!webhookUrl) {
      throw new Error('GOOGLE_SHEETS_WEBHOOK_URL is not configured');
    }

    // Send everything (designs + metadata) to the Apps Script
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchaseId,
        remarks,
        designs, // Includes the base64 dataUrl
        customerName,
        customerEmail,
        status: 'Unpaid'
      }),
    });

    const resultText = await res.text();
    let result;
    try {
      result = JSON.parse(resultText);
    } catch (e) {
      console.error('[Order API] Failed to parse Apps Script response as JSON. Raw response:', resultText.substring(0, 500));
      throw new Error('Apps Script returned HTML instead of JSON. Check your Web App URL and permissions.');
    }

    if (!result.success) {
      throw new Error(result.error || 'Apps Script failed to process order');
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Order processed by Apps Script',
      driveLinks: result.links 
    });

  } catch (error: any) {
    console.error('[Order API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Internal Server Error' 
    }, { status: 500 });
  }
}
