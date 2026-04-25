import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { purchaseId, sleeves } = body;

    console.log(`[CHECKOUT] Received order ${purchaseId} with ${sleeves.length} sleeves.`);
    
    // Here we would normally map the data and send it to a Google Sheets Webhook or App Script URL.
    // For example:
    // await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ purchaseId, sleeves: sleeves.map(s => s.previewUrl) })
    // });

    return NextResponse.json({ success: true, message: 'Order sent to mock Google Sheet' });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}
