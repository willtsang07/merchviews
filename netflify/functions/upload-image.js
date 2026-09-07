javascript
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const Busboy = require("busboy");
const path = require("path");
const crypto = require("crypto");

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

// Connect directly to Cloudflare R2.
// This does NOT use AWS for storage.
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function sanitizeFilename(filename) {
  const originalExtension = path.extname(filename).toLowerCase();

  const baseName = path
    .basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return {
    baseName: baseName || "image",
    extension: originalExtension,
  };
}

exports.handler = async (event) => {
  // Only allow POST requests.
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Method not allowed.",
      }),
    };
  }

  // Make sure all required R2 environment variables exist.
  if (
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.R2_BUCKET_NAME
  ) {
    console.error("Missing R2 environment variables.");

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Server configuration error.",
      }),
    };
  }

  try {
    const contentType =
      event.headers["content-type"] ||
      event.headers["Content-Type"];

    // Make sure the browser sent multipart/form-data.
    if (
      !contentType ||
      !contentType.toLowerCase().startsWith("multipart/form-data")
    ) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Request must use multipart/form-data.",
        }),
      };
    }

    // Netlify functions may provide the request body as base64.
    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64")
      : Buffer.from(event.body || "", "utf8");

    const uploadedFile = await new Promise((resolve, reject) => {
      const busboy = Busboy({
        headers: {
          "content-type": contentType,
        },
        limits: {
          files: 1,
          fileSize: MAX_FILE_SIZE,
        },
      });

      let fileData = null;
      let fileError = null;

      busboy.on("file", (fieldname, file, info) => {
        const { filename, mimeType } = info;

        // Our upload HTML uses:
        // formData.append("image", file)
        if (fieldname !== "image") {
          file.resume();
          return;
        }

        // Only allow PNG, JPEG and WebP.
        if (!ALLOWED_TYPES[mimeType]) {
          fileError = new Error(
            "Only PNG, JPEG, and WebP images are allowed."
          );

          file.resume();
          return;
        }

        const chunks = [];

        file.on("data", (chunk) => {
          chunks.push(chunk);
        });

        file.on("limit", () => {
          fileError = new Error(
            "Image is too large. Maximum size is 10 MB."
          );
        });

        file.on("end", () => {
          if (fileError) {
            return;
          }

          fileData = {
            filename,
            mimeType,
            buffer: Buffer.concat(chunks),
          };
        });
      });

      busboy.on("error", (error) => {
        reject(error);
      });

      busboy.on("finish", () => {
        if (fileError) {
          reject(fileError);
          return;
        }

        if (!fileData) {
          reject(new Error("No image was uploaded."));
          return;
        }

        resolve(fileData);
      });

      busboy.end(bodyBuffer);
    });

    // Clean up the original filename.
    const { baseName } = sanitizeFilename(
      uploadedFile.filename
    );

    // Use the MIME type to determine the final extension.
    // This prevents a misleading original file extension.
    const extension = ALLOWED_TYPES[uploadedFile.mimeType];

    // Generate a unique filename.
    const uniqueId = crypto.randomBytes(6).toString("hex");

    const filename = `${baseName}-${uniqueId}${extension}`;

    // Store every uploaded image in:
    //
    // R2 bucket: merchviews
    // folder:    content/
    //
    // Example:
    // content/my-shirt-a83f91c42d10.jpg
    const key = `content/${filename}`;

    // Upload directly to Cloudflare R2.
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: uploadedFile.buffer,
        ContentType: uploadedFile.mimeType,

        // Images can be cached for one year because
        // the filename is unique.
        CacheControl:
          "public, max-age=31536000, immutable",
      })
    );

    console.log(`Successfully uploaded: ${key}`);

    // Return JSON to the upload page.
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        key: key,
        filename: filename,

        // This is the URL your website will use.
        url: `/content/${filename}`,
      }),
    };

  } catch (error) {
    console.error("Upload error:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error: error.message || "Image upload failed.",
      }),
    };
  }
};
