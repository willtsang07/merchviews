import { getStore } from "@netlify/blobs";
import { Resend } from "resend";
import { randomInt } from "node:crypto";

const CODE_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function generateCode() {
  return randomInt(100000, 1000000).toString();
}

function getApprovedEmails() {
  return (process.env.APPROVED_EMAILS || "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
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

    if (!email) {
      return Response.json(
        { error: "Email address is required." },
        { status: 400 }
      );
    }

    const approvedEmails = getApprovedEmails();

    // Don't reveal whether an email address is approved.
    if (!approvedEmails.includes(email)) {
      return Response.json({ success: true });
    }

    // Generate a secure 6-digit code.
    const code = generateCode();

    // Code expires after 10 minutes.
    const expiresAt = Date.now() + CODE_EXPIRATION_MS;

    // Store the code temporarily in Netlify Blobs.
    const store = getStore("login-codes");

    await store.setJSON(email, {
      code,
      expiresAt
    });

    // Send the code through Resend.
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [email],
      subject: "Your MERCHVIEWS login code",
      html: `
        <div style="
          font-family: Arial, sans-serif;
          line-height: 1.5;
          color: #000;
        ">
          <h2>MERCHVIEWS</h2>

          <p>Your login code is:</p>

          <p style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            margin: 24px 0;
          ">
            ${code}
          </p>

          <p>This code expires in 10 minutes.</p>

          <p>
            If you did not request this code,
            you can safely ignore this email.
          </p>
        </div>
      `
    });

    if (error) {
      console.error("Resend error:", error);

      return Response.json(
        { error: "Unable to send login code." },
        { status: 500 }
      );
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error("send-code error:", error);

    return Response.json(
      { error: "Unable to process request." },
      { status: 500 }
    );
  }
};