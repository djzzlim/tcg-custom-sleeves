import { google } from 'googleapis';


const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

/**
 * Initialise Google Drive client using a Service Account JSON stored in env.
 */
export function getDriveClient() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Upload a remote image (public URL) to Google Drive.
 * Returns a shareable link (anyone with link can view).
 */
export async function uploadImageToDrive(imageUrl: string, fileName: string): Promise<string> {
  const drive = getDriveClient();
  // Fetch the image bytes
  const response = await fetch(imageUrl);
  // In Node.js, fetch returns a Response without .buffer(). Use arrayBuffer() and convert to Buffer.
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const fileMetadata: any = {
    name: fileName,
  };
  if (process.env.GOOGLE_DRIVE_FOLDER_ID) {
    fileMetadata.parents = [process.env.GOOGLE_DRIVE_FOLDER_ID];
  }

  const media = {
    mimeType: response.headers.get('content-type') || 'image/png',
    body: Buffer.from(buffer),
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

  const result = `https://drive.google.com/file/d/${data.id}/view?usp=sharing`;
  return result;
}
