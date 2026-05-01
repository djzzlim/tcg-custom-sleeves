import { google } from 'googleapis';
import { Readable } from 'stream';


const SCOPES = ['https://www.googleapis.com/auth/drive'];

/**
 * Initialise Google Drive client using a Service Account JSON stored in env.
 */
export function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '{}');
  
  // Fix for private key newlines if they are escaped in the JSON string
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });
  return google.drive({ version: 'v3', auth });
}


/**
 * Upload an image from a Buffer to Google Drive.
 */
export async function uploadImageFromBuffer(buffer: Buffer, fileName: string, mimeType: string = 'image/png'): Promise<string> {
  const drive = getDriveClient();

  const fileMetadata: any = {
    name: fileName,
  };
  if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
    fileMetadata.parents = [process.env.GOOGLE_DRIVE_FOLDER_ID];
  }

  const media = {
    mimeType,
    body: Readable.from(buffer),
  };

  const { data } = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id',
  });

  // Make the file publicly readable
  await drive.permissions.create({
    fileId: data.id!,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return `https://drive.google.com/file/d/${data.id}/view?usp=sharing`;
}

/**
 * Upload a remote image (public URL) to Google Drive.
 */
export async function uploadImageToDrive(imageUrl: string, fileName: string): Promise<string> {
  const response = await fetch(imageUrl);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'image/png';
  
  return uploadImageFromBuffer(buffer, fileName, mimeType);
}
