import { GoogleGenAI } from "@google/genai";

function cleanApiKey(key?: string): string {
  if (!key) return "";
  let k = key.trim();
  if (k.includes("=")) {
    k = k.split("=").slice(1).join("=").trim();
  }
  return k.replace(/^['"]|['"]$/g, "").trim();
}

export default async function handler(req: any, res: any) {
  // CORS support
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }

    const { model, contents, config } = body || {};

    const rawKey =
      process.env.GEMINI_API_KEY ||
      process.env.CUSTOM_GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      "";
    const apiKey = cleanApiKey(rawKey);

    if (!apiKey) {
      return res.status(500).json({
        error:
          "GEMINI_API_KEY is missing on Vercel. Please add GEMINI_API_KEY to your Vercel Project Settings -> Environment Variables and redeploy.",
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const targetModel = model || "gemini-3.8-flash";

    const response = await ai.models.generateContent({
      model: targetModel,
      contents,
      config,
    });

    return res.status(200).json({ text: response.text || "" });
  } catch (err: any) {
    console.error("Vercel Gemini API Error:", err);
    const statusCode = typeof err?.status === "number" ? err.status : 500;
    return res.status(statusCode).json({
      error: err?.message || "Failed to generate content via Gemini API",
    });
  }
}
