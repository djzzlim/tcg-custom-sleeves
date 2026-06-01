const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const endpoint = "https://s3.cardcollectionstudio.shop";
const accessKeyId = "GK635f45dace0cde66d50dd46f";
const secretAccessKey = "7d5082374b61bf63ebcea30c8be85f58d527bc8656fe546e6150ee0c59d615a9";
const bucketName = "ccs-bucket";

const client = new S3Client({
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
  region: "garage",
  forcePathStyle: true,
});

async function run() {
  const sizeMB = 3.5;
  const buffer = Buffer.alloc(sizeMB * 1024 * 1024, "a");
  const key = `test_uploads/dummy_upload_${Date.now()}.txt`;

  console.log(`Uploading dummy ${sizeMB} MB buffer to S3 bucket "${bucketName}" with key "${key}"...`);
  const start = Date.now();

  try {
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: "text/plain",
    }));

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`\n✅ Upload successful in ${duration} seconds!`);
  } catch (error) {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.error(`\n❌ S3 Upload failed after ${duration} seconds:`);
    console.error(error);
  }
}

run();
