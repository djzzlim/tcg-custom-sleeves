import { NextResponse } from 'next/server';
import { takeAssembled } from '@/lib/uploadStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IncomingDesign = {
  name?: string;
  quantity?: number;
  sleeveType?: 'Standard' | 'Japanese';
  packName?: string;
  packSize?: number;
  /** Either inline base64 (legacy) or a server-side uploadId from chunked upload. */
  dataUrl?: string;
  uploadId?: string;
  mimeType?: string;
};

type OutgoingDesign = {
  name?: string;
  quantity?: number;
  sleeveType?: 'Standard' | 'Japanese';
  packName?: string;
  packSize?: number;
  dataUrl: string;
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

/**
 * Resolve a design that referenced `uploadId` (chunked upload) into the
 * legacy `dataUrl` shape so the downstream Apps Script webhook keeps working.
 */
function resolveDesign(d: IncomingDesign): OutgoingDesign {
  if (d.uploadId) {
    const entry = takeAssembled(d.uploadId);
    if (!entry || !entry.assembled) {
      throw new Error(`Upload ${d.uploadId} was not finalized or already consumed.`);
    }
    const mime = d.mimeType || entry.mimeType || 'image/png';
    const base64 = uint8ToBase64(entry.assembled);
    return {
      name: d.name,
      quantity: d.quantity,
      sleeveType: d.sleeveType,
      packName: d.packName,
      packSize: d.packSize,
      dataUrl: `data:${mime};base64,${base64}`,
    };
  }
  if (typeof d.dataUrl === 'string' && d.dataUrl.length > 0) {
    return {
      name: d.name,
      quantity: d.quantity,
      sleeveType: d.sleeveType,
      packName: d.packName,
      packSize: d.packSize,
      dataUrl: d.dataUrl,
    };
  }
  throw new Error(`Design "${d.name || '(unnamed)'}" is missing both uploadId and dataUrl.`);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { purchaseId, remarks, designs, customerName, customerEmail } = body as {
      purchaseId?: string;
      remarks?: string;
      designs?: IncomingDesign[];
      customerName?: string;
      customerEmail?: string;
    };

    if (!purchaseId || !designs || !Array.isArray(designs)) {
      return NextResponse.json(
        { success: false, message: 'Missing order data' },
        { status: 400 }
      );
    }

    const webhookUrl = (process.env.GOOGLE_SHEETS_WEBHOOK_URL || '').trim();
    console.log(`[Order API] Delegating order ${purchaseId} to Apps Script at: "${webhookUrl}"`);
    if (!webhookUrl) {
      throw new Error('GOOGLE_SHEETS_WEBHOOK_URL is not configured');
    }

    const resolvedDesigns = designs.map(resolveDesign);

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchaseId,
        remarks,
        designs: resolvedDesigns,
        customerName,
        customerEmail,
        status: 'Unpaid',
      }),
    });

    const resultText = await res.text();
    let result;
    try {
      result = JSON.parse(resultText);
    } catch (e) {
      console.error(
        '[Order API] Failed to parse Apps Script response as JSON. Raw response:',
        resultText.substring(0, 500)
      );
      throw new Error('Apps Script returned HTML instead of JSON. Check your Web App URL and permissions.');
    }

    if (!result.success) {
      throw new Error(result.error || 'Apps Script failed to process order');
    }

    return NextResponse.json({
      success: true,
      message: 'Order processed by Apps Script',
      driveLinks: result.links,
    });
  } catch (error: any) {
    console.error('[Order API] Error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
