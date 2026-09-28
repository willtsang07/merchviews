import { getStore } from "@netlify/blobs";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      { status: 405 }
    );
  }

  try {
    const body = await request.json();

    const email = normalizeEmail(body.email || "");
    const code = String(body.code || "").trim();

    if (!email || !code) {
      return Response.json(
        { error: "Email and code are required." },
        { status: 400 }
      );
    }

    // Make sure the code is exactly 6 digits.
    if (!/^\d{6}$/.test(code)) {
      return Response.json(
        { error: "Invalid code." },
        { status: 400 }
      );
    }

    const store = getStore("login-codes");

    // Retrieve the stored login code.
    const loginData = await store.get(email, {
      type: "json"
    });

    if (!loginData) {
      return Response.json(
        { error: "Invalid or expired code." },
        { status: 401 }
      );
    }

    // Check whether the code has expired.
    if (Date.now() > loginData.expiresAt) {
      await store.delete(email);

      return Response.json(
        { error: "Invalid or expired code." },
        { status: 401 }
      );
    }

    // Check whether the submitted code matches.
    if (code !== loginData.code) {
      return Response.json(
        { error: "Invalid or expired code." },
        { status: 401 }
      );
    }

    // Code is valid. Delete it so it cannot be reused.
    await store.delete(email);

    return Response.json({
      success: true
    });

  } catch (error) {
    console.error("verify-code error:", error);

    return Response.json(
      { error: "Unable to process request." },
      { status: 500 }
    );
  }
};