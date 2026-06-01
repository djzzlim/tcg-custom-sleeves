const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");

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
  try {
    const res = await client.send(new ListObjectsV2Command({ Bucket: bucketName }));
    const contents = res.Contents || [];
    
    // Filter objects matching PUR-R30UQNJ
    const recent = contents.filter(obj => obj.Key.includes("PUR-R30UQNJ"));
    
    console.log(`\n--- ALL UPLOADS FOR PUR-R30UQNJ ---`);
    if (recent.length === 0) {
      console.log("No uploads found for today.");
    } else {
      recent.forEach((obj, idx) => {
        console.log(`${idx + 1}. Key: ${obj.Key} (Size: ${(obj.Size / 1024).toFixed(1)} KB, Last Modified: ${obj.LastModified})`);
      });
    }
  } catch (error) {
    console.error("Error listing recent uploads:", error);
  }
}

run();
