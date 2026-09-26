// Creates the local media bucket and makes objects publicly readable (as the R2 bucket's
// public domain will be). Local development only.
import { CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.MEDIA_ENDPOINT ?? "http://localhost:9000";
if (!/localhost|127\.0\.0\.1/.test(endpoint)) throw new Error("Refusing to configure a non-local bucket");
const bucket = process.env.MEDIA_BUCKET ?? "yolt-media";
const client = new S3Client({
  endpoint,
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MEDIA_ACCESS_KEY_ID ?? "yolt",
    secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY ?? "yolt-dev-secret",
  },
});

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`Bucket ${bucket} exists`);
} catch {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`Created bucket ${bucket}`);
}
await client.send(
  new PutBucketPolicyCommand({
    Bucket: bucket,
    Policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Principal: { AWS: ["*"] }, Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${bucket}/*`] }],
    }),
  }),
);
console.log(`Public read enabled: ${endpoint}/${bucket}/<key>`);
