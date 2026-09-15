import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

function cleanApiKey(key?: string): string {
  if (!key) return "";
  let k = key.trim();
  if (k.includes("=")) {
    k = k.split("=").slice(1).join("=").trim();
  }
  return k.replace(/^['"]|['"]$/g, "").trim();
}

function getAI(): GoogleGenAI {
  const rawKey =
    process.env.GEMINI_API_KEY ||
    process.env.CUSTOM_GEMINI_API_KEY ||
    "";
  const key = cleanApiKey(rawKey);
  if (!key) {
    throw new Error(
      "No Gemini API key found in server environment variables. Please check your API key configuration."
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "20mb" }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Server-side Gemini API Proxy
  app.post("/api/gemini/generate", async (req, res) => {
    try {
      const { model, contents, config } = req.body;
      const ai = getAI();
      const targetModel = model || "gemini-3.8-flash";

      const response = await ai.models.generateContent({
        model: targetModel,
        contents,
        config,
      });

      return res.json({ text: response.text || "" });
    } catch (err: any) {
      console.error("Server Gemini API Error:", err?.message || err);
      const statusCode = typeof err?.status === "number" ? err.status : 500;
      return res.status(statusCode).json({
        error: err?.message || "Failed to generate content via Gemini API",
      });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
