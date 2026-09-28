import { getStore } from "@netlify/blobs";

const SESSION_COOKIE_NAME = "mv_session";

export default async (request) => {
  if (request.method !== "GET") {
    return Response.json(
      { authenticated: false },
      { status: 405 }
    );
  }

  try {
    const cookieHeader = request.headers.get("cookie") || "";

    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map(cookie => cookie.trim().split("="))
        .filter(parts => parts.length === 2)
    );

    const sessionToken = cookies[SESSION_COOKIE_NAME];

    if (!sessionToken) {
      return Response.json({
        authenticated: false
      });
    }

    const sessionStore = getStore("login-sessions");

    const sessionData = await sessionStore.get(sessionToken, {
      type: "json"
    });

    if (!sessionData) {
      return Response.json({
        authenticated: false
      });
    }

    // Check whether the session has expired.
    if (Date.now() > sessionData.expiresAt) {
      await sessionStore.delete(sessionToken);

      return Response.json({
        authenticated: false
      });
    }

    return Response.json({
      authenticated: true
    });

  } catch (error) {
    console.error("check-session error:", error);

    return Response.json(
      { authenticated: false },
      { status: 500 }
    );
  }
};