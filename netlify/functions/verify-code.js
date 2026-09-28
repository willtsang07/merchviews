import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const SESSION_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

    const loginCodeStore = getStore("login-codes");

    // Retrieve the stored login code.
    const loginData = await loginCodeStore.get(email, {
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
      await loginCodeStore.delete(email);

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

    // Delete the login code so it cannot be reused.
    await loginCodeStore.delete(email);


    /* =========================
       CREATE LOGIN SESSION
    ========================= */

    // Generate a cryptographically secure random session token.
    const sessionToken = randomBytes(32).toString("hex");

    // Session expires after 7 days.
    const expiresAt = Date.now() + SESSION_EXPIRATION_MS;

    // Store the session server-side.
    const sessionStore = getStore("login-sessions");

    await sessionStore.setJSON(sessionToken, {
      email,
      expiresAt
    });


    /* =========================
       SET SECURE SESSION COOKIE
    ========================= */

    const cookie = [
      `mv_session=${sessionToken}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${SESSION_EXPIRATION_MS / 1000}`
    ].join("; ");


    return new Response(
      JSON.stringify({
        success: true
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookie
        }
      }
    );

  } catch (error) {
    console.error("verify-code error:", error);

    return Response.json(
      { error: "Unable to process request." },
      { status: 500 }
    );
  }
};