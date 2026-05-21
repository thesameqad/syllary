import "../load-env.js";
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env.js";

// Configures the R2 bucket CORS so browsers can PUT (direct upload) and
// GET/HEAD (waveform fetch + ranged playback) the audio objects.
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

await s3.send(
  new PutBucketCorsCommand({
    Bucket: env.R2_BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ["*"],
          AllowedMethods: ["GET", "HEAD", "PUT"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag", "Content-Length", "Content-Type", "Accept-Ranges"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);

console.log(`R2 CORS configured for bucket "${env.R2_BUCKET}".`);
