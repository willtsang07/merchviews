javascript
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const formData = await new Request(
      "https://merchviews.com",
      {
        method: "POST",
        headers: {
          "content-type":
            event.headers["content-type"] ||
            event.headers["Content-Type"],
        },
        body: event.isBase64Encoded
          ? Buffer.from(event.body, "base64")
          : event.body,
      }
    ).formData();

    const file = formData.get("image");

    if (!file || typeof file.arrayBuffer !== "function") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No image uploaded." }),
      };
    }

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Only PNG, JPEG, and WebP images are allowed.",
        }),
      };
    }

    const MAX_SIZE = 10 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Image must be 10MB or smaller.",
        }),
      };
    }

    const extension = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
    }[file.type];

    const originalName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .toLowerCase();

    const filename =
      `${originalName || "image"}-${Date.now()}${extension}`;

    const key = `content/${filename}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        filename,
        key,
        url: `/content/${filename}`,
      }),
    };
  } catch (error) {
    console.error("Upload error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Image upload failed.",
      }),
    };
  }
};