const { S3Client, ListBucketsCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");

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
  forcePathStyle: true, // Garage / custom endpoints usually require path style URLs
});

async function run() {
  console.log("Connecting to Garage S3 compatible storage at", endpoint, "...");
  try {
    // 1. List Buckets
    const bucketsRes = await client.send(new ListBucketsCommand({}));
    console.log("\n✅ Bucket connection successful!");
    console.log("Available Buckets:");
    console.log(bucketsRes.Buckets?.map(b => `- ${b.Name} (Created: ${b.CreationDate})`).join("\n") || "No buckets found.");

    // 2. List objects in ccs-bucket
    console.log(`\nListing contents of "${bucketName}"...`);
    const objectsRes = await client.send(new ListObjectsV2Command({ Bucket: bucketName }));
    console.log(`\n✅ Objects list retrieved successfully!`);
    console.log("Contents:");
    if (objectsRes.Contents && objectsRes.Contents.length > 0) {
      objectsRes.Contents.forEach((obj, idx) => {
        console.log(`${idx + 1}. Key: ${obj.Key} (Size: ${(obj.Size / 1024).toFixed(1)} KB, Last Modified: ${obj.LastModified})`);
      });
    } else {
      console.log("Bucket is currently empty.");
    }
  } catch (error) {
    console.error("\n❌ Error connecting to Garage S3 Storage:");
    console.error(error.message || error);
    process.exit(1);
  }
}

run();
