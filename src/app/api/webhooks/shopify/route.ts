// src/app/api/webhooks/shopify/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { uploadImageToDrive } from '@/lib/googleDrive';
// In a real project you would store this secret in .env.local
// For now we fall back to an empty string so the route works in dev.
const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';

/**
 * Mock function to send order data to Google Sheets.
 * Replace with a real fetch to your Google Apps Script endpoint.
 */
async function sendToGoogleSheets(order: any) {
  console.log('[Google Sheets] Received order', order);
  // Example: await fetch(process.env.GOOGLE_SHEETS_WEBHOOK_URL!, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(order),
  // });
}

export async function POST(request: Request) {
  const bodyText = await request.text();
  const signature = request.headers.get('x-shopify-hmac-sha256') || '';

  // Verify the HMAC signature using the shared secret
  const hash = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(bodyText, 'utf8')
    .digest('base64');

  if (hash !== signature) {
    console.warn('[Webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse the payload – Shopify sends JSON.
  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // You can adjust which fields you store. Here we keep a simple shape.
  const order = {
    id: payload.id,
    email: payload.email,
    total_price: payload.total_price,
    currency: payload.currency,
    line_items: await Promise.all((payload.line_items ?? []).map(async (li: any) => {
      const imageUrl = li.image?.src || li.preview_url || null;
      let driveLink = null;
      if (imageUrl) {
        try {
          driveLink = await uploadImageToDrive(imageUrl, `${li.title}-${Date.now()}`);
        } catch (e) {
          console.error('Drive upload error for', li.title, e);
        }
      }
      return {
        title: li.title,
        quantity: li.quantity,
        price: li.price,
        driveLink,
      };
    })),
    created_at: payload.created_at,
  };

  // Send to Google Sheets (or any other persistence layer)
  await sendToGoogleSheets(order);

  return NextResponse.json({ success: true });
}
