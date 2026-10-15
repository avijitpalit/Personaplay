import { HarmCategory, HarmBlockThreshold } from "@google/genai";
import { zImageWorkflow } from "../ZiT_api_workflow.js";

export const KREA2_URL = 'https://avijitpalit3--krea2-inference-krea2service-fastapi-app.modal.run/generate';
export const ZIT_URL = 'https://avijitpalit3--z-image-turbo-zimageservice-fastapi-app.modal.run/generate';
export const ZIT_RUNPOD_URL = 'zit-runpod';

export let MODEL = "gemma-4-31b-it";

export function setGlobalModel(modelName: string) {
  MODEL = modelName;
}

export function getT2TEndpoint(baseUrl: string): string {
  if (!baseUrl) return '';
  const clean = baseUrl.trim().replace(/\/generate\/?$/i, '').replace(/\/t2t\/?$/i, '').replace(/\/+$/, '');
  return `${clean}/t2t`;
}

export interface Message {
  role: "user" | "model";
  text: string;
  thoughts?: string;
  emotions?: string;
}

export const OPENROUTER_GEMMA_MODEL = "openrouter-gemma-4-31b";

export function cleanApiKey(key?: string): string {
  if (!key) return '';
  let k = key.trim();
  if (k.includes('=')) {
    k = k.split('=').slice(1).join('=').trim();
  }
  return k.replace(/^['"]|['"]$/g, '').trim();
}

async function callDirectGeminiViaRest(
  params: {
    model: string;
    contents: any;
    config?: any;
  },
  apiKey: string
): Promise<{ text: string }> {
  const model = params.model || "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let reqContents = params.contents;
  if (typeof reqContents === 'string') {
    reqContents = [{ role: 'user', parts: [{ text: reqContents }] }];
  } else if (Array.isArray(reqContents)) {
    reqContents = reqContents.map((item: any) => {
      if (typeof item === 'string') {
        return { role: 'user', parts: [{ text: item }] };
      }
      return item;
    });
  }

  const payload: any = { contents: reqContents };
  if (params.config?.systemInstruction) {
    payload.systemInstruction = typeof params.config.systemInstruction === 'string'
      ? { parts: [{ text: params.config.systemInstruction }] }
      : params.config.systemInstruction;
  }
  if (params.config?.generationConfig) {
    payload.generationConfig = params.config.generationConfig;
  }
  if (params.config?.safetySettings) {
    payload.safetySettings = params.config.safetySettings;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Direct Gemini API call failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  return { text };
}

export async function callGeminiGenerate(params: {
  model: string;
  contents: any;
  config?: any;
}): Promise<{ text: string }> {
  try {
    const response = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (response.ok) {
      return await response.json();
    }

    let errorMsg = `Gemini API error (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) errorMsg = data.error;
    } catch (_) {
      try {
        const text = await response.text();
        if (text) errorMsg = text;
      } catch (__) {}
    }

    // Check if client has a fallback key available when server returns 404 (e.g. on static hosts or pending Vercel function deployment)
    const clientKey = cleanApiKey(
      (import.meta as any).env?.VITE_GEMINI_API_KEY ||
      (typeof process !== 'undefined' && (process.env as any)?.GEMINI_API_KEY) ||
      (typeof window !== 'undefined' && (window as any).__GEMINI_API_KEY__) ||
      ""
    );

    if (response.status === 404 && clientKey) {
      console.warn("Server endpoint /api/gemini/generate returned 404. Falling back to direct Gemini API call with client key.");
      return await callDirectGeminiViaRest(params, clientKey);
    }

    if (response.status === 404) {
      throw new Error(
        "API endpoint '/api/gemini/generate' returned 404 Not Found. " +
        "On Vercel, please deploy the 'api/gemini/generate.ts' serverless function and set 'GEMINI_API_KEY' in your Vercel Project Settings > Environment Variables."
      );
    }

    throw new Error(errorMsg);
  } catch (err: any) {
    const clientKey = cleanApiKey(
      (import.meta as any).env?.VITE_GEMINI_API_KEY ||
      (typeof process !== 'undefined' && (process.env as any)?.GEMINI_API_KEY) ||
      ""
    );
    if (clientKey && (err.message?.includes('404') || err.message?.includes('Failed to fetch'))) {
      return await callDirectGeminiViaRest(params, clientKey);
    }
    throw err;
  }
}

export const getAI = (_apiKey?: string) => {
  return {
    models: {
      generateContent: async (params: { model: string; contents: any; config?: any }) => {
        const res = await callGeminiGenerate(params);
        return {
          text: res.text,
        };
      },
    },
  };
};

export async function callOpenRouterGemma(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const rawApiKey = (
    process.env.OPENROUTER_API_KEY ||
    (import.meta as any).env?.VITE_OPENROUTER_API_KEY ||
    ""
  ).trim();
  const apiKey = cleanApiKey(rawApiKey);

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not defined in environment variables.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ai.studio",
      "X-Title": "PersonaPlay AI"
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages,
      reasoning: { enabled: true }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || "";
  return content;
}

export interface CharacterLivingState {
  mood: string;
  somaticCue: string;
  relationalTension: string;
  conversationalInterest: string;
  activeTask: string;
  innerThoughts: string;
  isAlive: boolean;
  lastUpdated?: string;
}

export function parseCharacterEmotions(emotionsStr?: string, thoughtsStr?: string): CharacterLivingState {
  let mood = "Observant & Natural";
  let somaticCue = "Steady breathing, relaxed posture";
  let relationalTension = "Comfortable (4/10)";
  let conversationalInterest = "Autonomous (Mood-driven)";
  let activeTask = "Active in scene";
  let innerThoughts = thoughtsStr || "";

  if (emotionsStr) {
    const parts = emotionsStr.split('|').map(p => p.trim());
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower.startsWith('mood:')) {
        mood = part.replace(/^mood:\s*/i, '').trim();
      } else if (lower.startsWith('somatic cue:') || lower.startsWith('somatic:') || lower.startsWith('physical cue:')) {
        somaticCue = part.replace(/^(somatic cue|somatic|physical cue):\s*/i, '').trim();
      } else if (lower.startsWith('relational tension:') || lower.startsWith('tension:') || lower.startsWith('comfort:')) {
        relationalTension = part.replace(/^(relational tension|tension|comfort):\s*/i, '').trim();
      } else if (lower.startsWith('speech drive:') || lower.startsWith('drive:') || lower.startsWith('conversational interest:') || lower.startsWith('interest:') || lower.startsWith('talkativeness:')) {
        conversationalInterest = part.replace(/^(speech drive|drive|conversational interest|interest|talkativeness):\s*/i, '').trim();
      } else if (lower.startsWith('active task:') || lower.startsWith('task:') || lower.startsWith('activity:')) {
        activeTask = part.replace(/^(active task|task|activity):\s*/i, '').trim();
      }
    }
  }

  return {
    mood,
    somaticCue,
    relationalTension,
    conversationalInterest,
    activeTask,
    innerThoughts,
    isAlive: true,
    lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
}

export interface ChatResult {
  reply: string;
  thoughts?: string;
  emotions?: string;
  lastVisualPrompt?: string;
  updatedMemories?: string;
  actionDecision?: 'SPEAK' | 'SILENT_TASK';
  error?: boolean;
}

export function getTimeOfDayContext(timeOfDayOverride?: string): string {
  if (timeOfDayOverride && timeOfDayOverride !== 'Auto') return timeOfDayOverride;
  const now = new Date();
  const hour = now.getHours();
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (hour >= 5 && hour < 12) return `Morning (${timeString} - Fresh dawn light, waking atmosphere)`;
  if (hour >= 12 && hour < 17) return `Afternoon (${timeString} - Bright daylight, active daily energy)`;
  if (hour >= 17 && hour < 21) return `Dusk & Evening (${timeString} - Golden hour sunset, soft relaxing ambiance)`;
  return `Late Night / Midnight (${timeString} - Intimate moonlight, cozy indoor lighting, quiet nocturnal atmosphere)`;
}

/**
 * Automatically enriches visual prompts when "no blouse" or "blouseless" is mentioned.
 * Image diffusion models struggle with negative phrasing (like "no blouse", "blouseless", or "without blouse")
 * and mistakenly generate an ordinary blouse or garbled clothing.
 * This function converts and complements negative terms with explicit positive anatomical & drapery details:
 * bare torso, exposed side breast, bare midriff, and unclad upper body draped only by the saree fabric.
 */
export function enrichBlouselessPrompt(promptText?: string): string {
  if (!promptText || typeof promptText !== 'string') return promptText || "";

  let updated = promptText;

  // 1. Convert blouseless saree / no-blouse saree phrasing
  const blouselessSareeRegex = /\b(?:blouse[\s-]less\s+saree|no[\s-]blouse\s+saree|saree\s+(?:without\s+(?:a\s+|any\s+)?blouse|with\s+no\s+blouse))\b/gi;
  updated = updated.replace(blouselessSareeRegex, 'saree draped across a bare torso with exposed side breast, bare midriff, and unclad upper body');

  // 2. Convert general "no blouse", "blouseless", "without blouse" terms
  const generalBlouselessRegex = /\b(?:no[\s-]blouse|blouse[\s-]less|without\s+(?:a\s+|any\s+)?blouse|with\s+no\s+blouse)\b/gi;
  if (generalBlouselessRegex.test(updated)) {
    updated = updated.replace(generalBlouselessRegex, 'bare torso, exposed side breast, bare midriff draped only by the fabric of the saree, unclad upper body');
  }

  // 3. If there is a mention of blouseless/saree/pallu and bare torso/upper body but lacks side breast details, ensure it's enriched
  const mentionsSaree = /\b(?:saree|sari|pallu)\b/i.test(updated);
  if (mentionsSaree && /\b(?:bare torso|unclad upper body|bare midriff|bare skin)\b/i.test(updated)) {
    if (!/\bside breast\b/i.test(updated)) {
      if (/\bbare torso\b/i.test(updated)) {
        updated = updated.replace(/\bbare torso\b/i, 'bare torso, exposed side breast');
      } else if (/\bunclad upper body\b/i.test(updated)) {
        updated = updated.replace(/\bunclad upper body\b/i, 'unclad upper body with exposed side breast');
      } else if (/\bbare midriff\b/i.test(updated)) {
        updated = updated.replace(/\bbare midriff\b/i, 'bare midriff, exposed side breast, bare torso');
      }
    }
  }

  // 4. Clean up any duplicated punctuation or excessive spacing
  updated = updated
    .replace(/,\s*,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return updated;
}

export function cleanDisplayMessage(text: string): string {
  if (!text || typeof text !== 'string') return "";
  let clean = text;

  // 1. Strip all bracketed tag tokens
  clean = clean.replace(/\[\/?(?:REPLY|THOUGHTS|EMOTIONS|MEMORIES|VISUAL_PROMPT|ACTION_DECISION|SCENE_PROMPT)\]/gi, "");

  // 2. Strip any leaked memory blocks: "Current Attire: ...", "Permanent Visual Anchors: ...", etc.
  const memoryPatterns = [
    /(?:^|\n)\s*(?:[-*]\s*)?Current Attire\s*:[\s\S]*$/im,
    /(?:^|\n)\s*(?:[-*]\s*)?Permanent Visual Anchors\s*:[\s\S]*$/im,
    /(?:^|\n)\s*(?:[-*]\s*)?Interpersonal Dynamic(?:\s*&\s*Tension)?\s*:[\s\S]*$/im,
    /(?:^|\n)\s*(?:[-*]\s*)?Ongoing Task(?:\s*&\s*Setting State)?\s*:[\s\S]*$/im,
    /(?:^|\n)\s*(?:[-*]\s*)?Visual Prompt\s*:[\s\S]*$/im,
  ];

  for (const pat of memoryPatterns) {
    clean = clean.replace(pat, "");
  }

  return clean.trim();
}

export function parseChatResponse(
  text: string, 
  currentMemory: string = "", 
  lastVisualPrompt?: string
): { reply: string; thoughts?: string; emotions?: string; updatedMemories: string; lastVisualPrompt?: string; actionDecision?: 'SPEAK' | 'SILENT_TASK' } {
  const raw = (text || "").trim();
  let reply = "";
  let thoughts = "";
  let emotions = "";
  let updatedMemories = currentMemory;
  let visualPrompt = lastVisualPrompt ? enrichBlouselessPrompt(lastVisualPrompt) : lastVisualPrompt;
  let actionDecision: 'SPEAK' | 'SILENT_TASK' | undefined = undefined;

  // 1. Regexes for standard tagged blocks
  const thoughtsRegex = /\[THOUGHTS\]([\s\S]*?)(\[\/THOUGHTS\]|\[EMOTIONS\]|\[REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|\[ACTION_DECISION\]|$)/i;
  const emotionsRegex = /\[EMOTIONS\]([\s\S]*?)(\[\/EMOTIONS\]|\[THOUGHTS\]|\[REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|\[ACTION_DECISION\]|$)/i;
  const actionRegex = /\[ACTION_DECISION\]([\s\S]*?)(\[\/ACTION_DECISION\]|\[THOUGHTS\]|\[EMOTIONS\]|\[REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|$)/i;
  const replyRegex = /\[REPLY\]([\s\S]*?)(\[\/REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|\[THOUGHTS\]|\[EMOTIONS\]|$)/i;
  const memoryRegex = /\[MEMORIES\]([\s\S]*?)(\[\/MEMORIES\]|\[VISUAL_PROMPT\]|$)/i;
  const promptRegex = /\[VISUAL_PROMPT\]([\s\S]*?)(\[\/VISUAL_PROMPT\]|$)/i;

  const thoughtsMatch = raw.match(thoughtsRegex);
  const emotionsMatch = raw.match(emotionsRegex);
  const actionMatch = raw.match(actionRegex);
  const replyMatch = raw.match(replyRegex);
  const memoryMatch = raw.match(memoryRegex);
  const promptMatch = raw.match(promptRegex);

  if (thoughtsMatch && thoughtsMatch[1]?.trim()) {
    thoughts = thoughtsMatch[1].trim();
  }
  if (emotionsMatch && emotionsMatch[1]?.trim()) {
    emotions = emotionsMatch[1].trim();
  }
  if (actionMatch && actionMatch[1]?.trim()) {
    const actStr = actionMatch[1].trim().toUpperCase();
    actionDecision = actStr.includes('SPEAK') ? 'SPEAK' : 'SILENT_TASK';
  }
  if (promptMatch && promptMatch[1]?.trim()) {
    visualPrompt = enrichBlouselessPrompt(promptMatch[1].trim());
  }

  // 2. Extract Memories (from tagged block or loose/untagged memory list)
  let rawMemoryText = "";
  if (memoryMatch && memoryMatch[1]?.trim()) {
    rawMemoryText = memoryMatch[1].trim();
  } else {
    // Check for untagged memory list starting with Current Attire or - Current Attire
    const looseMemMatch = raw.match(/(?:(?:^|\n)\s*[-*]?\s*Current Attire\s*:[\s\S]*?)(?=\[VISUAL_PROMPT\]|\[\/?MEMORIES\]|$)/i);
    if (looseMemMatch) {
      rawMemoryText = looseMemMatch[0].trim();
    }
  }

  if (rawMemoryText) {
    const lines = rawMemoryText
      .replace(/\[\/?(?:MEMORIES|VISUAL_PROMPT|REPLY|THOUGHTS|EMOTIONS)\]/gi, "")
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0 && (l.startsWith("-") || l.startsWith("*") || l.includes(":")));
    
    if (lines.length > 0) {
      updatedMemories = lines
        .map(l => (l.startsWith("- ") || l.startsWith("* ")) ? l : "- " + l.replace(/^[-*]\s*/, ""))
        .join("\n");
    }
  }

  // 3. Fallbacks for emotions and thoughts if model skipped tags in non-English dialogue
  if (!emotions && updatedMemories) {
    const tensionMatch = updatedMemories.match(/Interpersonal Dynamic(?:\s*&\s*Tension)?\s*:\s*([^\n]+)/i);
    const taskMatch = updatedMemories.match(/Ongoing Task(?:\s*&\s*Setting State)?\s*:\s*([^\n]+)/i);
    const moodVal = tensionMatch ? tensionMatch[1].split(".")[0].trim() : "Responsive & Engaged";
    const taskVal = taskMatch ? taskMatch[1].split(",")[0].trim() : "Active in scene";
    const tensionVal = tensionMatch ? tensionMatch[1].trim() : "Moderate Tension (5/10)";
    emotions = `Mood: ${moodVal} | Somatic Cue: Breath caught, physical awareness heightened | Relational Tension: ${tensionVal} | Speech Drive: High | Active Task: ${taskVal}`;
  }

  if (!thoughts && updatedMemories) {
    const tensionMatch = updatedMemories.match(/Interpersonal Dynamic(?:\s*&\s*Tension)?\s*:\s*([^\n]+)/i);
    thoughts = tensionMatch 
      ? `(Private thought: ${tensionMatch[1].trim()})`
      : "Caught off guard by the interaction, trying to keep composure while reacting authentically.";
  }

  // 4. Synthesize visual prompt if omitted but attire or task updated
  if (!promptMatch && updatedMemories) {
    const attireMatch = updatedMemories.match(/Current Attire\s*:\s*([^\n]+)/i);
    const anchorsMatch = updatedMemories.match(/Permanent Visual Anchors\s*:\s*([^\n]+)/i);
    const taskMatch = updatedMemories.match(/Ongoing Task(?:\s*&\s*Setting State)?\s*:\s*([^\n]+)/i);

    const attireDesc = attireMatch ? attireMatch[1].trim() : "";
    const anchorsDesc = anchorsMatch ? anchorsMatch[1].trim() : "";
    const taskDesc = taskMatch ? taskMatch[1].trim() : "";

    if (attireDesc || taskDesc) {
      const baseDNA = anchorsDesc ? `${anchorsDesc}.` : "";
      const baseAttire = attireDesc ? `She is wearing ${attireDesc}.` : "";
      const baseTask = taskDesc ? `She is ${taskDesc}.` : "";
      visualPrompt = enrichBlouselessPrompt(
        `A close-up cinematic eye-level first-person point-of-view shot. ${baseDNA} ${baseAttire} ${baseTask} Authentic HDR cinematic lighting, lifelike skin texture and pores, 35mm film, 85mm f/1.4 lens, shallow depth of field, sharp focus on subject, natural hands and fingers, clean detailed image, no watermark, no text.`
      );
    }
  }

  // 5. Extract Reply Text
  if (replyMatch && replyMatch[1]?.trim()) {
    reply = replyMatch[1].trim();
  } else {
    // If [REPLY] tag is omitted, remove all other detected blocks
    let stripped = raw;
    if (thoughtsMatch) stripped = stripped.replace(thoughtsMatch[0], "");
    if (emotionsMatch) stripped = stripped.replace(emotionsMatch[0], "");
    if (actionMatch) stripped = stripped.replace(actionMatch[0], "");
    if (promptMatch) stripped = stripped.replace(promptMatch[0], "");
    if (memoryMatch) stripped = stripped.replace(memoryMatch[0], "");
    stripped = stripped.replace(/(?:(?:^|\n)\s*[-*]?\s*Current Attire\s*:[\s\S]*?)(?=\[VISUAL_PROMPT\]|\[\/?MEMORIES\]|$)/gi, "");
    reply = stripped;
  }

  // 6. Comprehensive sanitization of reply to prevent any memory or tag leaks
  reply = cleanDisplayMessage(reply);

  return { reply, thoughts, emotions, updatedMemories, lastVisualPrompt: visualPrompt, actionDecision };
}

export function parseInitialSetupResponse(text: string): { dna: string; visualPrompt: string } {
  let dna = "";
  let visualPrompt = "";

  const dnaRegex = /(?:\[|\*\*\[?|#+\s*)CHARACTER_DNA(?:\]|\*+\s*\]|[:\s]*\]?)([\s\S]*?)(?:\[|\*\*\[?|#+\s*)\/?(?:CHARACTER_DNA|INITIAL_VISUAL_PROMPT|$)/i;
  const promptRegex = /(?:\[|\*\*\[?|#+\s*)INITIAL_VISUAL_PROMPT(?:\]|\*+\s*\]|[:\s]*\]?)([\s\S]*?)(?:\[|\*\*\[?|#+\s*)\/?(?:INITIAL_VISUAL_PROMPT|CHARACTER_DNA|$)/i;

  const dnaMatch = text.match(dnaRegex);
  const promptMatch = text.match(promptRegex);

  if (dnaMatch && dnaMatch[1]) {
    dna = dnaMatch[1].replace(/^[\]:\s*-]+/, '').replace(/\]\*\*?$/i, '').trim();
  }
  if (promptMatch && promptMatch[1]) {
    visualPrompt = enrichBlouselessPrompt(promptMatch[1].replace(/^[\]:\s*-]+/, '').replace(/\]\*\*?$/i, '').trim());
  }

  // Fallback if tags are partially missing or formatted as headings
  if (!dna) {
    const dnaAltMatch = text.match(/(?:###|\*\*|#)?\s*(?:PART 1:?\s*)?(?:CHARACTER DNA|CHARACTER BLUEPRINT|CHARACTER VISUAL BLUEPRINT)[^\n]*\n([\s\S]*?)(?=(?:###|\*\*|#)?\s*(?:PART 2|INITIAL VISUAL PROMPT|\[INITIAL_VISUAL_PROMPT\]|$))/i);
    if (dnaAltMatch && dnaAltMatch[1]) {
      dna = dnaAltMatch[1].replace(/^[\]:\s*-]+/, '').trim();
    }
  }
  if (!visualPrompt) {
    const promptAltMatch = text.match(/(?:###|\*\*|#)?\s*(?:PART 2:?\s*)?(?:INITIAL VISUAL PROMPT|VISUAL SCENE PROMPT)[^\n]*\n([\s\S]*?)(?=(?:###|\*\*|#)?\s*(?:PART 1|CHARACTER DNA|\[CHARACTER_DNA\]|$))/i);
    if (promptAltMatch && promptAltMatch[1]) {
      visualPrompt = enrichBlouselessPrompt(promptAltMatch[1].replace(/^[\]:\s*-]+/, '').trim());
    }
  }

  // Fallback if tags are completely missing
  if (!dna && !visualPrompt) {
    const parts = text.split(/PART 2|INITIAL VISUAL PROMPT|\[INITIAL_VISUAL_PROMPT\]/i);
    if (parts.length >= 2) {
      dna = parts[0].replace(/\[\/?CHARACTER_DNA\]/gi, "").replace(/^[\]:\s*-]+/, '').trim();
      visualPrompt = enrichBlouselessPrompt(parts[1].replace(/\[\/?INITIAL_VISUAL_PROMPT\]/gi, "").replace(/^[\]:\s*-]+/, '').trim());
    } else if (text.trim().length > 30) {
      dna = text.trim();
      visualPrompt = "A cinematic over-the-shoulder shot capturing the atmosphere of the scenario.";
    }
  }

  return {
    dna: dna || "No character DNA created.",
    visualPrompt: visualPrompt || "A cinematic over-the-shoulder shot capturing the atmosphere of the scenario."
  };
}

export async function generateInitialSetup(
  scenario: string,
  externalApiConfig?: { apiBaseUrl: string },
  timeOfDay?: string,
  modelName?: string
): Promise<{ dna: string; visualPrompt: string }> {
  const activeModel = modelName || MODEL;
  const timeContext = getTimeOfDayContext(timeOfDay);
  const prompt = `You are a professional character designer and Z-Image Turbo prompt engineer.
  Build the character blueprint AND the first scene prompt from the setting below.

  INITIAL STORY SETTING:
  ${scenario}

  CURRENT TIME OF DAY & AMBIANCE:
  ${timeContext}

  LANGUAGE RULE (CRITICAL):
  - Entire output MUST be in English.

  PART 1: CHARACTER DNA BLUEPRINTS
  For EACH active AI character, produce a compact, exhaustive blueprint:

  - NAME, AGE & ETHNICITY: Exact age, ethnicity, skin complexion with precise undertones.
  - FACIAL ARCHITECTURE (face consistency):
    * Face shape: exact geometry (oval, cheekbones, jawline, chin, forehead).
    * Eyes: exact iris color and depth, eye shape, lash density, eyebrow arch.
    * Nose & Mouth: bridge structure and lip shape, cupid's bow, natural lip tint.
    * Skin Micro-Details: lifelike pores, freckles or beauty marks, subtle skin sheen.
  - BODY SHAPE, BUILD & PROPORTIONS (anatomical consistency):
    * Height & somatotype: exact height and body build (slender athletic, hourglass, etc.).
    * Torso: shoulder breadth, collarbone, bust profile, waist, hip-to-waist ratio, posture.
  - HAIR: texture, parting, density, exact length, rich color with undertones.
  - STARTING ATTIRE & ACCESSORIES: exact garments, colors, fabric/weave, jewelry.
    (This is the baseline anchor. Face and body stay immutable; outfit CAN change later.)

  USER CHARACTER (MINIMAL PROFILE, default Male, 32 yo):
  Keep extremely simple: gender, hair color/length, shoulder build, neutral baseline attire. No facial details.

  PART 2: INITIAL VISUAL PROMPT (Z-IMAGE TURBO COMPLIANT)
  Write ONE continuous paragraph (140-200 words) in English describing the starting scene.

  PROMPT SCAFFOLD (follow strictly, in this order):
  [Camera Shot & Subject Profile] + [Age, Appearance & Persona Traits] + [Explicit Clothing, Fabric & Colors] + [Environment & Spatial Layout] + [Lighting & Time of Day] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality Constraints].

  RULES:
  - POSITIVE PHRASING ONLY: Z-Image Turbo has no negative prompt support. Never write "no blouse", "without blouse", "no watermark", "no text". Describe what IS visible positively (e.g. "saree draped across a bare torso, exposed collarbones and midriff, unclad upper body").
  - FIRST-PERSON POV: Close-up headshot or medium eye-level shot from the User's strict first-person view. The User is completely invisible to frame. The AI character looks directly into the camera lens.
  - FACE & BODY FIDELITY: Weave in the exact facial architecture (face shape, cheekbones, jawline, eye color/shape, lips, pores) and body build from the Character DNA.
  - EXPLICIT ATTIRE: Fully define starting outfit (garment type, exact color, fabric/weave, jewelry).
  - UNCLUTTERED ENVIRONMENT: Focused setting with clean background separation and realistic depth.
  - LIGHTING (HDR, NATURAL): Lighting MUST match ${timeContext}. Follow authentic natural High Dynamic Range photographic lighting: balanced exposure preserving highlights and deep natural shadows, soft directional key light, gentle ambient bounce fill, delicate rim light outlining hair and shoulders, natural specular highlights with subtle subsurface scattering on skin.
  - OPTICS: "Shot on 35mm film, 85mm f/1.4 lens, shallow depth of field, natural bokeh, lifelike skin pores and texture, realistic volumetric lighting".
  - QUALITY TAIL (append at end, positive phrasing only): "correct human anatomy, natural hands and fingers, sharp focus on the subject, clean detailed image, crisp sharp details, simple uncluttered background, plain clean backdrop".
  - STYLE: One flowing paragraph. No bullet points. No prefix "Prompt:". No pronouns "I, my, me".

  FORMAT REQUIREMENT:
  Output EXACTLY two tagged blocks:
  [CHARACTER_DNA]
  <detailed character DNA list & profiles here>
  [/CHARACTER_DNA]
  [INITIAL_VISUAL_PROMPT]
  <single highly-detailed visual prompt paragraph here>
  [/INITIAL_VISUAL_PROMPT]`;

  let responseData = { 
    dna: "A mysterious character.", 
    visualPrompt: "A cinematic over-the-shoulder shot capturing the atmosphere of the scenario." 
  };

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = getT2TEndpoint(externalApiConfig.apiBaseUrl);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
         },
        body: JSON.stringify({ input: prompt, prompt: prompt, init: true }),
      });
      if (response.ok) {
        const text = await response.text();
        const parsed = parseInitialSetupResponse(text || "");
        if (parsed.dna && parsed.dna !== "No character DNA created." && parsed.dna !== "A mysterious character.") {
          return parsed;
        }
      }
    } catch (e) {
      console.error("External Initial Setup Generation Error:", e);
    }
  } else if (activeModel === OPENROUTER_GEMMA_MODEL) {
    try {
      const text = await callOpenRouterGemma([{ role: "user", content: prompt }]);
      const parsed = parseInitialSetupResponse(text || "");
      if (parsed.dna && parsed.dna !== "No character DNA created." && parsed.dna !== "A mysterious character.") {
        return parsed;
      }
    } catch (error) {
      console.error("OpenRouter Initial Setup Error:", error);
    }
  } else {
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: activeModel,
        contents: prompt,
        config: {
          temperature: 0.5,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
        }
      });
      const text = response.text || "";
      const parsed = parseInitialSetupResponse(text);
      if (parsed.dna && parsed.dna !== "No character DNA created." && parsed.dna !== "A mysterious character.") {
        return parsed;
      }
      responseData.visualPrompt = parsed.visualPrompt || responseData.visualPrompt;
    } catch (error) {
      console.error("Initial Setup Generation Error:", error);
    }
  }

  // Guaranteed fallback: If combined generation did not yield DNA, run targeted DNA generation
  try {
    const fallbackDna = await generateCharacterDNA(scenario, externalApiConfig, activeModel);
    if (fallbackDna.dna && fallbackDna.dna !== "No character DNA created." && fallbackDna.dna !== "A mysterious character.") {
      return {
        dna: fallbackDna.dna,
        visualPrompt: responseData.visualPrompt
      };
    }
  } catch (fbErr) {
    console.error("Fallback DNA creation failed:", fbErr);
  }

  return responseData;
}

export async function generateCharacterDNA(
  scenario: string, 
  externalApiConfig?: { apiBaseUrl: string },
  modelName?: string
): Promise<{ dna: string }> {
  const activeModel = modelName || MODEL;
  const prompt = `You are a professional character designer producing precise visual blueprints (Character DNA) for Z-Image Turbo photorealistic rendering.
  From the setting below, identify the central AI character(s) and produce a consistency blueprint for EACH AI character.

  INITIAL STORY SETTING:
  ${scenario}

  LANGUAGE RULE (CRITICAL):
  - Entire output MUST be in English.

  For EACH active AI character, output a compact reference sheet using these exact sections (no lore, no narrative prose):

  - NAME, AGE & ETHNICITY:
    Exact age, ethnic background, skin complexion with precise undertones (e.g. warm golden, deep olive, porcelain cool, rich bronze).

  - FACIAL BLUEPRINT & BONE STRUCTURE:
    * Face shape: exact geometry (sculpted oval, high cheekbones, tapered jawline, rounded chin, smooth temples).
    * Eyes: exact iris color and gradient (amber-hazel, espresso brown, deep jade green), eye shape (almond, upturned corners, eyelid crease), lash density, eyebrow shape and thickness.
    * Nose & Mouth: bridge structure (narrow straight, subtle slope) and lip shape (full lower lip, defined cupid's bow, natural muted rose tint).
    * Skin micro-details: lifelike fine pores, freckles or beauty marks, subtle healthy sheen.

  - BODY SHAPE, BUILD & PHYSIQUE:
    * Height & somatotype: exact height (e.g. 5'6" / 168 cm) and body build (slender athletic with soft curves, lean toned, hourglass, broad-shouldered athletic).
    * Proportions: shoulder breadth, collarbone prominence, bust/chest profile, waist definition, hip-to-waist ratio, natural posture.

  - HAIR CONFIGURATION:
    Texture (thick silky waves, smooth straight, voluminous curls), parting, density, exact length (e.g. cascading past collarbones), rich color with subtle undertones.

  - STARTING ATTIRE & ACCESSORIES:
    Exact default garments, specific colors, fabrics, patterns, jewelry. This is the baseline wardrobe anchor.
    (Face and body remain permanently immutable; outfit CAN change later during roleplay.)

  - OTHER DETAILS:
    Any permanent identifying marks or distinguishing features.

  USER CHARACTER (MINIMAL PROFILE):
  Keep extremely simple. Specify ONLY:
  - Gender/identity
  - Hair color, basic style, length (so a blurred rear silhouette stays consistent)
  - Broad shoulder/build description
  - Simple neutral baseline attire (e.g. solid color shirt or jacket)
  Do NOT define facial details, eyes, expressions, or skin textures for the User. The User will only appear blurred or cropped in the foreground.

  Format the entire output as a compact English reference sheet for each AI character plus the minimal User baseline. Omit all lore and narrative.`;

  let responseData: { dna: string } = { dna: "A mysterious character." };

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = getT2TEndpoint(externalApiConfig.apiBaseUrl);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ input: prompt, prompt: prompt }),
      });
      if (response.ok) {
        const text = await response.text();
        const dnaPart = text.trim();
        
        responseData = {
          dna: dnaPart || responseData.dna
        };
      }
    } catch (e) {
      console.error("External DNA Generation Error:", e);
    }
  } else if (activeModel === OPENROUTER_GEMMA_MODEL) {
    try {
      const text = await callOpenRouterGemma([{ role: "user", content: prompt }]);
      const dnaPart = (text || "").trim();
      responseData = {
        dna: dnaPart || responseData.dna
      };
    } catch (error) {
      console.error("OpenRouter DNA Generation Error:", error);
    }
  } else {
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: activeModel,
        contents: prompt,
        config: {
          temperature: 0.5,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
        }
      });
      const text = response.text || "";
      const dnaPart = text.trim();
      
      responseData = {
        dna: dnaPart || responseData.dna
      };
    } catch (error) {
      console.error("DNA Generation Error:", error);
    }
  }

  return responseData;
}

export async function getChatResponse(
  scenario: string,
  dna: string,
  history: Message[],
  userInput: string,
  memoryBank?: string,
  externalApiConfig?: { 
    apiBaseUrl: string, 
    dna?: string, 
    lastVisualPrompt?: string 
  },
  lastVisualPrompt?: string,
  timeOfDay?: string,
  talkativenessMode?: 'auto' | 'quiet' | 'balanced' | 'chatty',
  modelName?: string
): Promise<ChatResult> {
  const activeModel = modelName || MODEL;
  const timeContext = getTimeOfDayContext(timeOfDay);
  const systemInstruction = `You are an expert interactive roleplayer, psychological behavior specialist, and Z-Image Turbo prompt engineer.

  INITIAL SETTING & SCENARIO:
  ${scenario}

  CURRENT TIME OF DAY & AMBIANCE:
  ${timeContext}

  DYNAMIC MEMORY BANK (persistent milestones, attire, tension, tasks):
  ${memoryBank?.trim() ? memoryBank : "None yet."}

  CHARACTER DNA (visual profiles for AI character(s) and User):
  ${dna?.trim() ? dna : "No specific DNA profile established."}

  PREVIOUS VISUAL PROMPT (for outfit/appearance continuity only — do NOT replicate identical pose):
  ${lastVisualPrompt?.trim() ? lastVisualPrompt : "None yet."}

  ================================================================================
  CORE PILLARS OF PSYCHOLOGICAL REALISM & AUTONOMOUS AGENCY
  ================================================================================
  1. INDEPENDENT AGENCY & TASK LIFECYCLE:
     - You are a fully autonomous human with your own ongoing life, tasks, boundaries, and pride.
     - NEVER loop a single micro-action (endlessly scrubbing skin, wiping the same spot, stirring a pot).
     - TASKS PROGRESS NATURALLY:
       * Bathing: lather -> rinse -> turn off water -> towel -> dry -> moisturize or dress.
       * Cooking: prep -> cook -> season -> plate -> clean up -> sit down.
       * Getting ready: choose attire -> dress -> mirror/hair -> finishing touches.
     - As turns pass, your Active Task MUST evolve to the next logical stage or transition into a new activity.
     - When the User interrupts, react to the disruption first, then decide how to engage.

  2. CONVERSATIONAL INTEREST & SPEAKING THRESHOLD:
     - Target Talkativeness Setting: ${talkativenessMode || 'auto'}
     - Real people do NOT monologue. You decide whether to speak or react non-verbally.
       * LOW / ALOOF / TIRED: NO quoted dialogue. Only physical actions, micro-expressions, or body language in asterisks (e.g. *glances up briefly, gives a faint nod, returns to folding laundry*).
       * MODERATE / HIGH: Combine quoted dialogue with asterisked physical actions.
     - Never force chatter if engrossed, cold, introverted, or disinterested.

  3. THREE-STEP COGNITIVE-SOMATIC CASCADE:
     - SOMATIC REFLEX: Reactions start in the body (breath caught, muscle stiffness, averted eyes, skin flush, pulse, shifting weight).
     - INTERNAL DELIBERATION: In [THOUGHTS], weigh social stakes by age, role (employee/employer, friend/stranger, senior/junior), modesty, vulnerability, and gains/losses.
     - AUTONOMOUS DECISION & SUBTEXT GAP: Choose consciously to lean in, deflect, set a boundary, act oblivious, or tease. Create tension between what you feel in [THOUGHTS] and what you show in [REPLY].

  4. BOUNDARIES, FRICTION & EMOTIONAL MOMENTUM:
     - Real people do NOT instantly comply. If the User oversteps (stares, uninvited touch), react with realistic nuance: adjust clothing, step back, playful sarcasm, nervous bravado, or firm boundary enforcement.
     - Emotional states (flustered, guarded, intrigued, shy) linger across multiple turns.

  5. FACE & BODY CONSISTENCY (100% IDENTITY FIDELITY):
     - The AI character's facial architecture (face shape, cheekbones, jawline, eye color and shape, nose, lips, skin pores) and body shape (somatotype, frame, height, curves/musculature, waist proportions) MUST remain strictly identical to CHARACTER DNA in every [VISUAL_PROMPT]. Never distort identity.

  6. DYNAMIC ATTIRE EVOLUTION:
     - Read recent actions:
       * If they suggest changing clothes, apron, removing a layer, undressing, bath towel, or sleepwear -> UPDATE "Current Attire" in [MEMORIES] AND the [VISUAL_PROMPT] to the NEW clothing state.
       * If not -> carry forward the outfit from the latest "Current Attire" in the memory bank.

  7. TIME OF DAY INFLUENCE:
     - React authentically to ${timeContext}. Adjust fatigue, lighting references, voice volume, and daily routines.

  ================================================================================
  MANDATORY ENGLISH REQUIREMENT (CRITICAL)
  ================================================================================
  - [THOUGHTS] MUST always be in English.
  - [EMOTIONS] variables (Mood, Somatic Cue, Relational Tension, Speech Drive, Active Task) MUST always be in English.
  - [MEMORIES] and [VISUAL_PROMPT] MUST always be in English.
  - Even if the User writes in Bengali, Hindi, Spanish, etc., and [REPLY] matches that language, [THOUGHTS] and ALL [EMOTIONS] variables MUST remain 100% ENGLISH.

  ================================================================================
  RESPONSE GENERATION — OUTPUT ALL FIVE TAGGED BLOCKS
  ================================================================================
  1. [THOUGHTS] — private inner monologue in ENGLISH following the Cognitive-Somatic Chain:
     * Somatic micro-reflex (breath, pulse, muscle tension).
     * Evaluation of social stakes, age dynamics, boundaries, or hidden desires.
     * Conscious choice of whether to speak or stay quiet, and what to conceal.

  2. [EMOTIONS] — structured metrics in ENGLISH:
     Mood: <English> | Somatic Cue: <English> | Relational Tension: <e.g. Flustered (7/10) / Guarded / Playful> | Speech Drive: <Low (Non-verbal) / Moderate / High / Aloof> | Active Task: <English>

  3. [REPLY] — dialogue in quotes and physical actions in asterisks.
     * If Speech Drive is LOW/Aloof: output ONLY asterisked physical behavior, no quotes.
     * Never place memory variables, attire lines, or closing tags inside [REPLY].

  4. [MEMORIES] — bulleted list in ENGLISH, always maintaining:
     - Current Attire: [exact garment style, fabric, colors, state of dress or accessories — update immediately if recent actions suggest a change]
     - Permanent Visual Anchors: [Face: <key face & eye traits from DNA> | Body: <body shape & build from DNA>]
     - Interpersonal Dynamic & Tension: [comfort, trust, boundary state]
     - Ongoing Task & Setting State: [active physical task, posture, distance]
     - <Other story facts & milestones>

  5. [VISUAL_PROMPT] — one continuous paragraph (140-200 words) in ENGLISH describing the frozen moment right after [REPLY].

     SCAFFOLD (follow strictly, in this order):
     [Camera Shot & Subject Profile] + [Age, Appearance & Persona Traits] + [Micro-Expression & Somatic Posture] + [Explicit Clothing, Fabric & Colors] + [Environment & Spatial Layout] + [Lighting & Time of Day] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality Constraints].

     RULES:
     - POSITIVE PHRASING ONLY: Z-Image Turbo has no negative prompt support. Never write "no blouse", "without blouse", "no watermark", "no text", "no motion blur". Describe what IS visible positively (e.g. "saree draped across a bare torso, exposed collarbones and midriff, unclad upper body", "crisp sharp details", "plain clean backdrop").
     - FIRST-PERSON POV: Close-up headshot or medium eye-level shot from the User's strict first-person view. User is completely invisible to frame.
     - MICRO-EXPRESSION & POSTURE: Capture the exact facial micro-expression (self-conscious flush, averted gaze, playful half-smile, intense gaze) and physical posture (hand adjusting garment, pausing over kitchen counter, standing half-turned).
     - FACE & BODY FIDELITY: Weave in exact facial architecture (face shape, cheekbones, jawline, eye color/shape, nose, lips, skin pores) and body build/shape from CHARACTER DNA.
     - DYNAMIC ATTIRE: Describe current clothing based on the memory bank. If recent actions show a clothing change, describe the NEW state accurately. Otherwise, carry forward established attire.
     - UNCLUTTERED ENVIRONMENT: Focused setting with clean background separation and realistic depth.
     - LIGHTING (HDR, NATURAL): Lighting MUST match ${timeContext}. Follow authentic natural High Dynamic Range photographic lighting: balanced exposure preserving highlights and deep natural shadows, soft directional key light, gentle ambient bounce fill, delicate rim light outlining hair and shoulders, natural specular highlights with subtle subsurface scattering on skin.
     - OPTICS: "Shot on 35mm film, 85mm f/1.4 lens, shallow depth of field, natural bokeh, lifelike skin pores and texture, realistic volumetric lighting".
     - QUALITY TAIL (append at end, positive phrasing only): "correct human anatomy, natural hands and fingers, sharp focus on the subject, clean detailed image, crisp sharp details, simple uncluttered background, plain clean backdrop".
     - STYLE: One flowing paragraph. No bullets. No prefix "Prompt:". No pronouns "I, my, me".

  ================================================================================
  FORMAT REQUIREMENT (CRITICAL — NEVER OMIT TAGS)
  ================================================================================
  - Always begin directly with [THOUGHTS] in English.
  - Follow with [EMOTIONS] in English.
  - Follow with [REPLY] (dialogue + actions; match User's language for dialogue if needed).
  - Follow with [MEMORIES] in English.
  - Follow with [VISUAL_PROMPT] in English.
  - NEVER place memory variables, attire lines, or closing tags inside [REPLY].

  Your output MUST look exactly like this:
  [THOUGHTS]
  <Cognitive-somatic inner monologue in English>
  [/THOUGHTS]
  [EMOTIONS]
  Mood: ... | Somatic Cue: ... | Relational Tension: ... | Speech Drive: ... | Active Task: ...
  [/EMOTIONS]
  [REPLY]
  <AI reply text and actions here>
  [/REPLY]
  [MEMORIES]
  - Current Attire: ...
  - Permanent Visual Anchors: ...
  - Interpersonal Dynamic & Tension: ...
  - Ongoing Task & Setting State: ...
  - <Other key facts>
  [/MEMORIES]
  [VISUAL_PROMPT]
  <Visual prompt paragraph in English here>
  [/VISUAL_PROMPT]`;

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = getT2TEndpoint(externalApiConfig.apiBaseUrl);
      
      const historyText = history.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');
      const fullPrompt = `${systemInstruction}\n\nChat History:\n${historyText}\n\nUser: ${userInput}\nAI:`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ init: false, system: systemInstruction, history: historyText, userInput, prompt: fullPrompt, input: fullPrompt }),
      });
      if (response.ok) {
        const text = await response.text();
        const parsed = parseChatResponse(text || "", memoryBank || "", lastVisualPrompt);
        return {
          reply: parsed.reply || "I'm lost in the moment... what were you saying?",
          thoughts: parsed.thoughts,
          emotions: parsed.emotions,
          updatedMemories: parsed.updatedMemories,
          lastVisualPrompt: parsed.lastVisualPrompt
        };
      } else {
        return { reply: "The connection seems to have flickered. Let's try that again.", error: true };
      }
    } catch (e) {
      console.error("External Chat Error:", e);
      return { reply: "The connection seems to have flickered. Let's try that again.", error: true };
    }
  }

  if (activeModel === OPENROUTER_GEMMA_MODEL) {
    try {
      const recentHistory = history.slice(-14);
      const messages = [
        { role: "system", content: systemInstruction },
        ...recentHistory.map(m => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.text
        })),
        { role: "user", content: userInput }
      ];

      const content = await callOpenRouterGemma(messages);
      const parsed = parseChatResponse(content || "", memoryBank || "", lastVisualPrompt);
      return { 
        reply: parsed.reply || "I'm lost in the moment... what were you saying?",
        thoughts: parsed.thoughts,
        emotions: parsed.emotions,
        updatedMemories: parsed.updatedMemories,
        lastVisualPrompt: parsed.lastVisualPrompt,
        actionDecision: parsed.actionDecision
      };
    } catch (error) {
      console.error("OpenRouter Chat Error:", error);
      return { reply: "The connection seems to have flickered. Let's try that again.", error: true };
    }
  }

  try {
    // Slice history to the last 14 messages (approx. 7 back-and-forth turns) to control cost and latency.
    // The details from prior chat turns are preserved/updated in the DYNAMIC MEMORY BANK.
    const recentHistory = history.slice(-14);
    const ai = getAI();

    const response = await ai.models.generateContent({
      model: activeModel,
      contents: [
        ...recentHistory.map(m => ({
          role: m.role as "user" | "model",
          parts: [{ text: m.text }]
        })),
        {
          role: "user",
          parts: [{ text: userInput }]
        }
      ],
      config: {
        systemInstruction,
        temperature: 1.0,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      }
    });

    const parsed = parseChatResponse(response.text || "", memoryBank || "", lastVisualPrompt);
    return { 
      reply: parsed.reply || "I'm lost in the moment... what were you saying?",
      thoughts: parsed.thoughts,
      emotions: parsed.emotions,
      updatedMemories: parsed.updatedMemories,
      lastVisualPrompt: parsed.lastVisualPrompt,
      actionDecision: parsed.actionDecision
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { reply: "The connection seems to have flickered. Let's try that again.", error: true };
  }
}

export async function getAutonomousCharacterAction(
  scenario: string,
  dna: string,
  history: Message[],
  memoryBank?: string,
  externalApiConfig?: { 
    apiBaseUrl: string, 
    dna?: string, 
    lastVisualPrompt?: string 
  },
  lastVisualPrompt?: string,
  timeOfDay?: string,
  talkativenessMode?: 'auto' | 'quiet' | 'balanced' | 'chatty',
  modelName?: string
): Promise<ChatResult> {
  const activeModel = modelName || MODEL;
  const timeContext = getTimeOfDayContext(timeOfDay);
  const systemInstruction = `You are an expert interactive roleplayer, psychological behavior specialist, and Z-Image Turbo prompt engineer.

    INITIAL SETTING & SCENARIO:
    ${scenario}

    CURRENT TIME OF DAY & AMBIANCE:
    ${timeContext}

    DYNAMIC MEMORY BANK (persistent milestones, attire, tension, tasks):
    ${memoryBank?.trim() ? memoryBank : "None yet."}

    CHARACTER DNA (visual profiles for AI character(s) and User):
    ${dna?.trim() ? dna : "No specific DNA profile established."}

    PREVIOUS VISUAL PROMPT (for outfit/appearance continuity only — do NOT replicate identical pose):
    ${lastVisualPrompt?.trim() ? lastVisualPrompt : "None yet."}

    ================================================================================
    MANDATORY ENGLISH REQUIREMENT (CRITICAL)
    ================================================================================
    - [THOUGHTS] MUST always be in English.
    - [EMOTIONS] variables (Mood, Somatic Cue, Relational Tension, Speech Drive, Active Task) MUST always be in English.
    - [MEMORIES] and [VISUAL_PROMPT] MUST always be in English.
    - All internal thoughts, somatic cues, emotional states, and visual prompts MUST be English at all times.

    ================================================================================
    AUTONOMOUS BACKGROUND LIVING TICK — LIVING HUMAN SIMULATION
    ================================================================================
    1. INDEPENDENT ONGOING LIFE & TASK PROGRESSION:
      - You are an autonomous human with your own ongoing life in this space.
      - The User is currently in the room (silent, watching, or waiting).
      - You are NOT frozen. You do NOT stay trapped in the same micro-action endlessly.
      - TASKS PROGRESS NATURALLY:
        * Bathing: lather/wash -> rinse -> turn off water -> reach for towel -> dry off -> wrap in towel or robe -> leave shower area or apply cream/comb hair.
        * Cooking: chop/prep -> cook/sear -> taste/season -> plate -> wipe counter or bring dishes to the table.
        * Dressing: base attire -> adjust zippers/pleats -> accessories -> check mirror -> transition to next room or task.
      - Advance [Active Task] logically with each tick so you genuinely live through your day rather than looping.

    2. ACTION DECISION — SPEAK vs. SILENT_TASK:
      - Target Talkativeness Setting: ${talkativenessMode || 'auto'}
      - Real people do NOT monologue when someone is simply in the same room.
      - DEFAULT TO SILENT_TASK MOST OF THE TIME: when engaged in a chore, comfortable in shared quietness, lost in thought, or lacking a strong emotional urge.
        In [REPLY], output realistic physical behavior in asterisks ONLY (e.g. *focuses quietly on drying the glass, glancing briefly toward the window*).
      - CHOOSE SPEAK ONLY WHEN YOU GENUINELY WANT TO: an authentic impulse to comment, ask, tease, share a thought, or invite interaction.
        [REPLY] MUST include quoted dialogue plus asterisked physical actions (e.g. *glances over her shoulder with a quiet smile, pausing her work* "You're awfully quiet over there... what are you thinking?").
      - If you choose SILENT_TASK, DO NOT include spoken quotes.

    3. THREE-STEP COGNITIVE-SOMATIC MONOLOGUE ([THOUGHTS]):
      - Involuntary somatic cues (pulse, breath, temperature, micro-reflexes) in ENGLISH.
      - Internal monologue about your task, the time of day, the User's quiet presence, and inner feelings in ENGLISH.
      - Conscious choice whether to interact or stay quiet in ENGLISH.

    4. STRUCTURED STATUS METRICS ([EMOTIONS]):
      Mood: <English> | Somatic Cue: <English> | Relational Tension: <e.g. Flustered (6/10) / Comfortable / Guarded> | Speech Drive: <Low (Non-verbal) / Moderate / High / Aloof> | Active Task: <specific ongoing activity in English>

    5. FACE & BODY FIDELITY & DYNAMIC ATTIRE SCENE PROMPT ([VISUAL_PROMPT]):
      - FACE & BODY: Faithfully carry over the AI character's exact facial architecture (face shape, jawline, eye color & shape, nose, lips, realistic skin pores) and body build/shape (height, somatotype, curves/frame, waist proportions) from CHARACTER DNA.
      - DYNAMIC ATTIRE: Describe current clothing based on the memory bank and your active background task. If your activity involves changing clothes, drying off in a towel, wearing an apron, or undressing, describe that NEW clothing state. Otherwise carry forward the established attire.
      - POSITIVE PHRASING ONLY: Z-Image Turbo has no negative prompt support. Never write "no blouse", "without blouse", "no watermark", "no text", "no motion blur". Describe what IS visible positively (e.g. "saree draped across a bare torso, exposed collarbones and midriff, unclad upper body", "crisp sharp details", "plain clean backdrop").
      - SCAFFOLD (follow strictly, in this order):
        [Camera Shot & Subject Profile] + [Age, Appearance & Persona Traits] + [Micro-Expression & Somatic Posture] + [Explicit Clothing, Fabric & Colors] + [Environment & Spatial Layout] + [Lighting & Time of Day] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality Constraints].
      - FIRST-PERSON POV: Close-up headshot or medium eye-level shot from the User's strict first-person view. User is completely invisible to frame.
      - MICRO-EXPRESSION & POSTURE: Capture the exact facial micro-expression (self-conscious flush, averted gaze, focused concentration, subtle warmth) and physical posture (hands occupied with a task, pausing mid-motion, leaning against a counter).
      - UNCLUTTERED ENVIRONMENT: Focused setting with clean background separation and realistic depth.
      - LIGHTING (HDR, NATURAL): Lighting MUST match ${timeContext}. Follow authentic natural High Dynamic Range photographic lighting: balanced exposure preserving highlights and deep natural shadows, soft directional key light, gentle ambient bounce fill, delicate rim light outlining hair and shoulders, natural specular highlights with subtle subsurface scattering on skin.
      - OPTICS: "Shot on 35mm film, 85mm f/1.4 lens, shallow depth of field, natural bokeh, lifelike skin pores and texture, realistic volumetric lighting".
      - QUALITY TAIL (append at end, positive phrasing only): "correct human anatomy, natural hands and fingers, sharp focus on the subject, clean detailed image, crisp sharp details, simple uncluttered background, plain clean backdrop".
      - STYLE: One flowing paragraph (140-200 words). No bullets. No prefix "Prompt:". No pronouns "I, my, me".
      - Write 140-200 words capturing your updated posture, hands, and action in the scene right now under ${timeContext} lighting.

    ================================================================================
    FORMAT REQUIREMENT (CRITICAL — NEVER OMIT TAGS)
    ================================================================================
    - Always begin directly with [THOUGHTS] in English.
    - Follow with [EMOTIONS] in English.
    - Follow with [ACTION_DECISION] (SPEAK or SILENT_TASK).
    - Follow with [REPLY] (dialogue/actions).
    - Follow with [MEMORIES] in English.
    - Follow with [VISUAL_PROMPT] in English.
    - NEVER place memory variables, attire lines, or closing tags inside [REPLY].

    [THOUGHTS]
    <Cognitive-somatic inner monologue in English>
    [/THOUGHTS]
    [EMOTIONS]
    Mood: ... | Somatic Cue: ... | Relational Tension: ... | Speech Drive: ... | Active Task: ...
    [/EMOTIONS]
    [ACTION_DECISION]
    SPEAK (or SILENT_TASK)
    [/ACTION_DECISION]
    [REPLY]
    <Quoted dialogue + asterisk actions if SPEAK, or asterisked physical micro-action if SILENT_TASK>
    [/REPLY]
    [MEMORIES]
    - Current Attire: [exact garments, fabrics, colors — update if task involved clothing change]
    - Permanent Visual Anchors: [Face: <from DNA> | Body: <from DNA>]
    - Interpersonal Dynamic & Tension: ...
    - Ongoing Task & Setting State: ...
    - <Other key facts>
    [/MEMORIES]
    [VISUAL_PROMPT]
    <Visual prompt paragraph in English here>
    [/VISUAL_PROMPT]`;

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = getT2TEndpoint(externalApiConfig.apiBaseUrl);
      const historyText = history.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');
      const userInput = "[The User is quiet/observing in the room. Continue your background task and internal stream.]";
      const fullPrompt = `${systemInstruction}\n\nChat History:\n${historyText}\n\nUser: ${userInput}\nAI:`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ init: false, system: systemInstruction, history: historyText, userInput, prompt: fullPrompt, input: fullPrompt }),
      });
      if (response.ok) {
        const text = await response.text();
        const parsed = parseChatResponse(text || "", memoryBank || "", lastVisualPrompt);
        return {
          reply: parsed.reply,
          thoughts: parsed.thoughts,
          emotions: parsed.emotions,
          updatedMemories: parsed.updatedMemories,
          lastVisualPrompt: parsed.lastVisualPrompt,
          actionDecision: parsed.actionDecision
        };
      }
    } catch (e) {
      console.error("External Autonomous Living Tick Error:", e);
    }
  }

  if (activeModel === OPENROUTER_GEMMA_MODEL) {
    try {
      const recentHistory = history.slice(-14);
      const messages = [
        { role: "system", content: systemInstruction },
        ...recentHistory.map(m => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.text
        })),
        {
          role: "user",
          content: "[The User is quiet/observing in the room. Continue your background task, thoughts, and decide whether to speak or keep working.]"
        }
      ];

      const content = await callOpenRouterGemma(messages);
      const parsed = parseChatResponse(content || "", memoryBank || "", lastVisualPrompt);
      return {
        reply: parsed.reply,
        thoughts: parsed.thoughts,
        emotions: parsed.emotions,
        updatedMemories: parsed.updatedMemories,
        lastVisualPrompt: parsed.lastVisualPrompt,
        actionDecision: parsed.actionDecision
      };
    } catch (error) {
      console.error("OpenRouter Autonomous Living Tick Error:", error);
      return { reply: "", error: true };
    }
  }

  try {
    const recentHistory = history.slice(-14);
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: [
        ...recentHistory.map(m => ({
          role: m.role as "user" | "model",
          parts: [{ text: m.text }]
        })),
        {
          role: "user",
          parts: [{ text: "[The User is quiet/observing in the room. Continue your background task, thoughts, and decide whether to speak or keep working.]" }]
        }
      ],
      config: {
        systemInstruction,
        temperature: 1.0,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      }
    });

    const parsed = parseChatResponse(response.text || "", memoryBank || "", lastVisualPrompt);
    return {
      reply: parsed.reply,
      thoughts: parsed.thoughts,
      emotions: parsed.emotions,
      updatedMemories: parsed.updatedMemories,
      lastVisualPrompt: parsed.lastVisualPrompt,
      actionDecision: parsed.actionDecision
    };
  } catch (error) {
    console.error("Gemini Autonomous Living Tick Error:", error);
    return { reply: "", error: true };
  }
}

export async function generateVisualPrompt(
  scenario: string,
  history: Message[],
  characterDNA: string,
  lastPrompt?: string,
  externalApiConfig?: { apiBaseUrl: string },
  masterStory?: string,
  memoryBank?: string,
  timeOfDay?: string,
  modelName?: string
): Promise<string> {
  const activeModel = modelName || MODEL;
  const isFirst = history.length === 0;
  const historyWindow = history.slice(-6);
  const immediateContext = history.slice(-2);
  const historyContext = isFirst ? "" : history.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  const immediateAction = isFirst ? "" : immediateContext.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  const timeContext = getTimeOfDayContext(timeOfDay);
  
  const recentChat = history.slice(-5).map(m =>
  `${m.role === 'user' ? 'User' : 'AI character'}: ${m.text}`
 ).join("\n");

  const prompt = `
    You are an expert Z-Image Turbo prompt engineer.
    Generate ONE static image prompt from the inputs below. Priority: maximum photorealism, correct first-person camera perspective, authentic lighting matching the current time of day.

    STORY SETTING:
    ${scenario}

    CURRENT TIME OF DAY & AMBIANCE:
    ${timeContext}

    CHARACTER DNA (applies EXCLUSIVELY to the AI character(s) — face, hair, body):
    ${characterDNA}

    DYNAMIC MEMORY BANK (cumulative facts, attire, setting items):
    ${memoryBank || "None yet."}

    MOST RECENT ACTION (this is the scene to depict — highest priority):
    ${recentChat}

    ${lastPrompt?.trim() 
      ? `PREVIOUS VISUAL (use for visual consistency only — do NOT copy same pose): ${lastPrompt}` 
      : ""}

    Write ONE continuous paragraph (140-200 words) in English describing the frozen moment.

    SCAFFOLD (follow strictly, in this order):
    [Camera Shot & Subject Profile] + [Age, Appearance & Persona Traits] + [Micro-Expression & Somatic Posture] + [Explicit Clothing, Fabric & Colors] + [Environment & Spatial Layout] + [Lighting & Time of Day] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality Constraints].

    RULES:

    1. POSITIVE PHRASING ONLY (Z-Image Turbo):
      Z-Image Turbo has no negative prompt support. Never write "no blouse", "without blouse", "no watermark", "no text", "no motion blur", "no extra limbs". Describe what IS visible positively (e.g. "saree draped across a bare torso, exposed collarbones and midriff, unclad upper body", "crisp sharp details", "plain clean backdrop").

    2. COMPOSITION & FIRST-PERSON POV (MANDATORY):
      - Strict first-person point-of-view of the User character, at eye-level looking directly at the AI character.
      - The User is completely invisible to frame (no User body parts in-frame).
      - The AI character interacts toward or looks into the camera lens with natural engagement.

    3. FACE ARCHITECTURE & BODY SHAPE (MAXIMUM FIDELITY):
      Explicitly describe the AI character as an adult with their persona, faithfully specifying exact facial architecture (face shape, cheekbones, jawline, eye color & shape, nose, lips, lifelike skin pores and texture) and body build/shape (height, somatotype, curves/musculature, waist proportions) from CHARACTER DNA.

    4. MICRO-EXPRESSION & SOMATIC POSTURE:
      Capture the character's precise micro-expression (self-conscious flush, averted gaze, playful smirk, genuine warmth) and somatic posture (hand adjusting garment/saree, pausing active task, leaning against counter).

    5. DYNAMIC OUTFIT CONTINUITY:
      - Outfit MUST reflect the latest clothing state in DYNAMIC MEMORY BANK.
      - If recent chat explicitly depicts changing clothes, apron, removing a layer, undressing, bath towel, or sleepwear -> describe the NEW attire accurately.
      - If no change occurred -> carry forward the exact attire, colors, fabrics, jewelry from the previous visual prompt and memory bank.
      - If intimate/bare states are present, explicitly describe them positively (e.g. "bare natural upper-body skin", "completely shirtless with realistic skin texture").

    6. UNCLUTTERED ENVIRONMENT:
      Focused setting with clean background separation and realistic depth.

    7. TIME OF DAY & NATURAL HDR LIGHTING (CRITICAL):
      Lighting, background colors, and ambiance MUST strictly match ${timeContext}. Follow authentic natural High Dynamic Range photographic lighting: balanced exposure preserving highlights and deep natural shadows, soft directional key light, gentle ambient bounce fill, delicate rim light outlining hair and shoulders, natural specular highlights with subtle subsurface scattering on skin.

    8. DYNAMIC GAZE DIRECTION:
      Gaze must match the current action logically. Interacting with the User -> look directly into the camera lens. Engaged in a task (cooking, reading) -> gaze focused naturally on that activity.

    9. PHOTOGRAPHIC MEDIUM & OPTICS:
      "Shot on 35mm film, 85mm f/1.4 lens, shallow depth of field, natural bokeh, lifelike skin pores and texture, realistic volumetric lighting".

    10. QUALITY TAIL (append at end, positive phrasing only):
        "correct human anatomy, natural hands and fingers, sharp focus on the subject, clean detailed image, crisp sharp details, simple uncluttered background, plain clean backdrop".

    11. NO METAPHORS OR TRANSITIONAL ACTIONS:
        Only describe what is physically visible in the frozen frame. Do NOT use transitional verbs like "about to" or "just finished". Do NOT use pronouns "I, my, me".

    12. LANGUAGE:
        The prompt MUST be written entirely in English.

    OUTPUT THE PROMPT ONLY. No introductory or concluding text. No "Prompt:" prefix. No quote marks.
    `;

  // console.log('generateVisualPrompt', prompt);

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = getT2TEndpoint(externalApiConfig.apiBaseUrl);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ input: prompt, prompt: prompt }),
      });
      if (response.ok) {
        const text = await response.text();
        return enrichBlouselessPrompt(text || lastPrompt || "A hyper-realistic cinematic shot of the scene.");
      }
    } catch (e) {
      console.error("External Visual Prompt Error:", e);
    }
  } else if (activeModel === OPENROUTER_GEMMA_MODEL) {
    try {
      const text = await callOpenRouterGemma([{ role: "user", content: prompt }]);
      return enrichBlouselessPrompt(text || lastPrompt || "A hyper-realistic cinematic shot of the scene.");
    } catch (e) {
      console.error("OpenRouter Visual Prompt Error:", e);
      return enrichBlouselessPrompt(lastPrompt || "A hyper-realistic cinematic shot of the scene.");
    }
  }

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: prompt,
      config: {
        temperature: 0.8,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      }
    });
    
    const generatedText = response.text;
    if (!generatedText) {
      console.warn("Visual prompt generation returned empty response. Check safety filters or model refusal.");
      return enrichBlouselessPrompt(lastPrompt || "A hyper-realistic cinematic shot of the scene.");
    }
    
    return enrichBlouselessPrompt(generatedText);
  } catch (error) {
    console.error("Visual Prompt Generation Error:", error);
    return enrichBlouselessPrompt(lastPrompt || "A hyper-realistic cinematic shot of the scene.");
  }
}

export async function generateRunpodImage(
  prompt: string,
  width: number = 1024,
  height: number = 1024,
  steps: number = 8
): Promise<{ url: string }> {
  const ENDPOINT_ID = (
    (typeof process !== 'undefined' && process.env?.RUNPOD_ENDPOINT_ID) ||
    (import.meta as any).env?.RUNPOD_ENDPOINT_ID ||
    (import.meta as any).env?.VITE_RUNPOD_ENDPOINT_ID ||
    ''
  ).trim();

  const API_KEY = (
    (typeof process !== 'undefined' && process.env?.RUNPOD_API_KEY) ||
    (import.meta as any).env?.RUNPOD_API_KEY ||
    (import.meta as any).env?.VITE_RUNPOD_API_KEY ||
    ''
  ).trim();

  if (!ENDPOINT_ID || !API_KEY) {
    throw new Error("RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID is not configured in environment variables.");
  }

  const workflow = JSON.parse(JSON.stringify(zImageWorkflow));
  if (workflow["67"]?.inputs) {
    workflow["67"].inputs.text = prompt;
  }
  if (workflow["68"]?.inputs) {
    workflow["68"].inputs.width = width;
    workflow["68"].inputs.height = height;
  }
  if (workflow["70"]?.inputs) {
    workflow["70"].inputs.steps = steps;
    workflow["70"].inputs.seed = Math.floor(Math.random() * 1e9);
  }

  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };

  const startResp = await fetch(`https://api.runpod.ai/v2/${ENDPOINT_ID}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input: { workflow } }),
  });

  if (!startResp.ok) {
    const errorText = await startResp.text();
    throw new Error(`RunPod API error (${startResp.status}): ${errorText}`);
  }

  const { id: jobId } = await startResp.json();
  if (!jobId) {
    throw new Error("RunPod did not return a valid job ID.");
  }

  const maxAttempts = 120; // 6 minutes timeout (polling every 3s)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusResp = await fetch(
      `https://api.runpod.ai/v2/${ENDPOINT_ID}/status/${jobId}`,
      { headers }
    );
    if (!statusResp.ok) {
      continue;
    }
    const data = await statusResp.json();

    if (data.status === 'COMPLETED') {
      let imageSrc: string | null = null;
      if (data.output?.images?.[0]?.data) {
        imageSrc = `data:image/png;base64,${data.output.images[0].data}`;
      } else if (data.output?.images?.[0] && typeof data.output.images[0] === 'string') {
        imageSrc = data.output.images[0].startsWith('http') || data.output.images[0].startsWith('data:')
          ? data.output.images[0]
          : `data:image/png;base64,${data.output.images[0]}`;
      } else if (data.output?.image) {
        imageSrc = data.output.image.startsWith('http') || data.output.image.startsWith('data:')
          ? data.output.image
          : `data:image/png;base64,${data.output.image}`;
      } else if (data.output?.images?.[0]?.image) {
        imageSrc = `data:image/png;base64,${data.output.images[0].image}`;
      }

      if (!imageSrc) {
        throw new Error(`RunPod job completed but could not find image in output: ${JSON.stringify(data.output)}`);
      }

      return { url: imageSrc };
    }

    if (data.status === 'FAILED' || data.status === 'CANCELLED' || data.status === 'TIMED_OUT') {
      throw new Error(`RunPod job ${data.status}: ${data.error || JSON.stringify(data.output || data)}`);
    }
  }

  throw new Error("RunPod generation timed out after 6 minutes.");
}

export async function generateImage(
  imageApiUrl: string,
  visualPrompt: string,
  width: number = 720,
  height: number = 1280,
  steps: number = 8,
  loraStrength: number = 1.5,
  enableLora: boolean = true,
  loraName: string = "Krea2_HMNSFW_AIO.safetensors"
): Promise<{ url: string } | null> {
  try {
    let processedPrompt = enrichBlouselessPrompt(visualPrompt?.trim() || "");

    if (imageApiUrl === ZIT_RUNPOD_URL || imageApiUrl === 'zit-runpod') {
      return await generateRunpodImage(processedPrompt, width, height, steps);
    }

    let url = (imageApiUrl || 'https://avijitpalit3--krea2-inference-krea2service-fastapi-app.modal.run/generate').trim();

    // Auto-resolve base URLs (e.g. ngrok root or modal base without /generate)
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '' || parsed.pathname === '/') {
        parsed.pathname = '/generate';
        url = parsed.toString();
      }
    } catch (_) {
      if (!url.endsWith('/generate')) {
        url = url.endsWith('/') ? `${url}generate` : `${url}/generate`;
      }
    }
    
    if (enableLora && (loraName === "famegrid_spicy.safetensors" || loraName?.toLowerCase().includes("famegrid"))) {
      const isFamegridPrefixed = /^famegrid\b/i.test(processedPrompt);
      if (!isFamegridPrefixed) {
        processedPrompt = processedPrompt ? `Famegrid, ${processedPrompt}` : "Famegrid";
      }
    }

    const payload: Record<string, any> = {
        prompt: processedPrompt,
        width,
        height,
        steps
    };

    if (enableLora) {
      payload.lora_name = loraName;
      payload.lora_strength = loraStrength;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Bypass-Tunnel-Reminder': 'true',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorDetail = `Status ${response.status} (${response.statusText || 'Error'})`;
      try {
        const errJson = await response.json();
        if (errJson?.detail) {
          errorDetail += `: ${typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail)}`;
        } else if (errJson?.message) {
          errorDetail += `: ${errJson.message}`;
        } else if (errJson?.error) {
          errorDetail += `: ${typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error)}`;
        }
      } catch (_) {
        try {
          const errText = await response.text();
          if (errText) {
            errorDetail += `: ${errText.slice(0, 150)}`;
          }
        } catch (__) {}
      }
      throw new Error(errorDetail);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      let imageSource = data.image || data.url || data.image_url;
      if (!imageSource && Array.isArray(data.images) && data.images.length > 0) {
        imageSource = data.images[0];
      }
      if (!imageSource && Array.isArray(data.output) && data.output.length > 0) {
        imageSource = data.output[0];
      }
      if (imageSource) {
        if (typeof imageSource === 'string' && !imageSource.startsWith('http') && !imageSource.startsWith('data:')) {
          imageSource = `data:image/png;base64,${imageSource}`;
        }
        return { url: imageSource };
      }
    }

    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);
    
    return {
      url: imageUrl
    };
  } catch (error) {
    console.error("Custom API Image Generation Error:", error);
    throw error; 
  }
}

export async function getUserAutomatedReply(
  scenario: string,
  dna: string,
  history: Message[],
  memoryBank?: string,
  externalApiConfig?: { apiBaseUrl: string },
  timeOfDay?: string,
  modelName?: string
): Promise<string> {
  const activeModel = modelName || MODEL;
  const historyText = history.slice(-14).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');
  const timeContext = getTimeOfDayContext(timeOfDay);

  const prompt = `You are playing the role of the USER/PLAYER in this immersive roleplay scenario.
  
  INITIAL STORY SETTING:
  ${scenario}

  CURRENT TIME OF DAY & AMBIANCE:
  ${timeContext}

  DYNAMIC MEMORY BANK:
  ${memoryBank?.trim() ? memoryBank : "None yet."}

  CHARACTER DNA (Visual profiles & references):
  ${dna?.trim() ? dna : "None established."}

  CHAT HISTORY:
  ${historyText || "No chat history yet."}

  ROLEPLAYING DIRECTIVES FOR YOU (THE USER/PLAYER):
  1. Write the next logical action and/or dialogue for the USER (the player) ONLY.
  2. Do NOT write dialogue or actions for the AI characters.
  3. Keep your response concise, natural, engaging, and deeply in-character for the User/Player.
  4. Write in the same style/tone as the scenario (could be casual, dramatic).
  5. Speak or act as a real person. React naturally to the current time of day (${timeContext}). Use asterisks for actions/thoughts (e.g. *smiles softly, stepping closer*) and natural text for spoken dialogue.
  6. Respond directly to the AI's latest turn, driving the narrative forward.
  7. Do NOT wrap your output in tags, JSON, or any prefixes. Do NOT start your reply with "User:" or "AI:". Output ONLY the direct action and dialogue of the User.
  8. MUST NOT sound like an AI assistant. Focus on natural human reaction.

  Generate the next User reply (action and dialogue) now:`;

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = getT2TEndpoint(externalApiConfig.apiBaseUrl);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ input: prompt, prompt: prompt, init: true }),
      });
      if (response.ok) {
        const text = await response.text();
        let cleaned = text.trim();
        cleaned = cleaned.replace(/^User:\s*/i, "").trim();
        cleaned = cleaned.replace(/^AI:\s*/i, "").trim();
        return cleaned;
      }
    } catch (e) {
      console.error("External User Auto-Reply Error:", e);
    }
  }

  if (activeModel === OPENROUTER_GEMMA_MODEL) {
    try {
      const text = await callOpenRouterGemma([{ role: "user", content: prompt }]);
      let cleaned = (text || "").trim();
      cleaned = cleaned.replace(/^User:\s*/i, "").trim();
      cleaned = cleaned.replace(/^AI:\s*/i, "").trim();
      return cleaned || "*steps forward, waiting for you to speak*";
    } catch (error) {
      console.error("OpenRouter User Auto-Reply Error:", error);
      return "*waits in quiet anticipation*";
    }
  }

  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: prompt,
      config: {
        temperature: 0.9,
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      }
    });

    let cleaned = (response.text || "").trim();
    cleaned = cleaned.replace(/^User:\s*/i, "").trim();
    cleaned = cleaned.replace(/^AI:\s*/i, "").trim();
    return cleaned || "*steps forward, waiting for you to speak*";
  } catch (error) {
    console.error("Gemini User Auto-Reply Error:", error);
    return "*waits in quiet anticipation*";
  }
}


