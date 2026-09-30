import { getStore } from "@netlify/blobs";

const SESSION_COOKIE_NAME = "mv_session";

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json(
      { success: false },
      { status: 405 }
    );
  }

  try {
    const cookieHeader =
      request.headers.get("cookie") || "";

    const cookies = Object.fromEntries(
      cookieHeader
        .split(";")
        .map(cookie =>
          cookie.trim().split("=")
        )
        .filter(parts => parts.length === 2)
    );

    const sessionToken =
      cookies[SESSION_COOKIE_NAME];

    // Delete the server-side session.
    if (sessionToken) {
      const sessionStore =
        getStore("login-sessions");

      await sessionStore.delete(
        sessionToken
      );
    }

    // Expire the browser cookie.
    const cookie = [
      `${SESSION_COOKIE_NAME}=`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=0"
    ].join("; ");

    return new Response(
      JSON.stringify({
        success: true
      }),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/json",
          "Set-Cookie": cookie
        }
      }
    );

  } catch (error) {

    console.error(
      "logout error:",
      error
    );

    return Response.json(
      { success: false },
      { status: 500 }
    );

  }
};