javascript
import { getStore } from "@netlify/blobs";

const SESSION_COOKIE_NAME = "mv_session";

function getSessionToken(request) {
  const cookieHeader = request.headers.get("cookie") || "";

  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map(cookie => cookie.trim().split("="))
      .filter(parts => parts.length === 2)
  );

  return cookies[SESSION_COOKIE_NAME] || null;
}

export default async (request, context) => {
  try {
    const sessionToken = getSessionToken(request);

    // No session cookie.
    if (!sessionToken) {
      return Response.redirect(
        new URL("/login", request.url),
        302
      );
    }

    const sessionStore = getStore("login-sessions");

    const sessionData = await sessionStore.get(
      sessionToken,
      {
        type: "json"
      }
    );

    // Session doesn't exist.
    if (!sessionData) {
      return Response.redirect(
        new URL("/login", request.url),
        302
      );
    }

    // Session has expired.
    if (Date.now() > sessionData.expiresAt) {
      await sessionStore.delete(sessionToken);

      return Response.redirect(
        new URL("/login", request.url),
        302
      );
    }

    // Valid session — allow Netlify to serve /upload.
    return context.next();

  } catch (error) {
    console.error(
      "protect-upload error:",
      error
    );

    // Fail closed.
    return Response.redirect(
      new URL("/login", request.url),
      302
    );
  }
};

export const config = {
  path: [
    "/upload",
    "/upload.html"
  ]
};