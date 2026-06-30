import { GoogleGenAI, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";

export const MODEL = "gemma-4-26b-a4b-it";

export interface Message {
  role: "user" | "model";
  text: string;
}

// Use a custom key if provided, otherwise fall back to the system default
const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
};

export interface ChatResult {
  reply: string;
  lastVisualPrompt?: string;
  updatedMemories?: string;
}

export function parseChatResponse(
  text: string, 
  currentMemory: string = "", 
  lastVisualPrompt?: string
): { reply: string; updatedMemories: string; lastVisualPrompt?: string } {
  let reply = text.trim();
  let updatedMemories = currentMemory;
  let visualPrompt = lastVisualPrompt;

  const replyRegex = /\[REPLY\]([\s\S]*?)(\[\/REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|$)/i;
  const memoryRegex = /\[MEMORIES\]([\s\S]*?)(\[\/MEMORIES\]|\[REPLY\]|\[VISUAL_PROMPT\]|$)/i;
  const promptRegex = /\[VISUAL_PROMPT\]([\s\S]*?)(\[\/VISUAL_PROMPT\]|\[REPLY\]|\[MEMORIES\]|$)/i;

  const replyMatch = text.match(replyRegex);
  const memoryMatch = text.match(memoryRegex);
  const promptMatch = text.match(promptRegex);

  if (replyMatch && replyMatch[1]) {
    reply = replyMatch[1].trim();
  }
  if (memoryMatch && memoryMatch[1]) {
    updatedMemories = memoryMatch[1].trim();
    // Strip empty lines or helper text from model if any
    updatedMemories = updatedMemories.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./))
      .join('\n');
  }
  if (promptMatch && promptMatch[1]) {
    visualPrompt = promptMatch[1].trim();
  }

  // If tags are completely missing, fall back to returning whole text as reply
  if (!replyMatch && !memoryMatch && !promptMatch) {
    const cleanText = text.replace(/\[\/?REPLY\]/gi, '').replace(/\[\/?MEMORIES\]/gi, '').replace(/\[\/?VISUAL_PROMPT\]/gi, '').trim();
    reply = cleanText;
  }

  return { reply, updatedMemories, lastVisualPrompt: visualPrompt };
}

export function parseInitialSetupResponse(text: string): { dna: string; visualPrompt: string } {
  let dna = "";
  let visualPrompt = "";

  const dnaRegex = /\[CHARACTER_DNA\]([\s\S]*?)(\[\/CHARACTER_DNA\]|\[INITIAL_VISUAL_PROMPT\]|$)/i;
  const promptRegex = /\[INITIAL_VISUAL_PROMPT\]([\s\S]*?)(\[\/INITIAL_VISUAL_PROMPT\]|\[CHARACTER_DNA\]|$)/i;

  const dnaMatch = text.match(dnaRegex);
  const promptMatch = text.match(promptRegex);

  if (dnaMatch && dnaMatch[1]) {
    dna = dnaMatch[1].trim();
  }
  if (promptMatch && promptMatch[1]) {
    visualPrompt = promptMatch[1].trim();
  }

  // Fallback if tags are completely missing or malformed
  if (!dna && !visualPrompt) {
    const parts = text.split(/PART 2|INITIAL VISUAL PROMPT|\[INITIAL_VISUAL_PROMPT\]/i);
    if (parts.length >= 2) {
      dna = parts[0].replace(/\[\/?CHARACTER_DNA\]/gi, "").trim();
      visualPrompt = parts[1].replace(/\[\/?INITIAL_VISUAL_PROMPT\]/gi, "").trim();
    } else {
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
  externalApiConfig?: { apiBaseUrl: string }
): Promise<{ dna: string; visualPrompt: string }> {
  const prompt = `You are a professional artist, master character designer, and expert image prompt engineer.
  Based on this initial story setting, you need to set up BOTH the Character DNA visual blueprints AND generate the very first visual scene prompt.

  INITIAL STORY SETTING:
  ${scenario}

  LANGUAGE RULE (CRITICAL):
  - You MUST generate the entire output in English.

  PART 1: CHARACTER DNA BLUEPRINTS
  For EACH active AI character, provide highly specific physical definitions (for example: hair, eyes, face definition, body shape etc.)

  USER CHARACTER (MINIMAL PROFILE, default is Male, 32 yo):
  Define a brief, minimal visual profile for the "User" or "Player" character. Keep it extremely simple.

  PART 2: INITIAL VISUAL PROMPT
  Write a single, highly detailed visual prompt paragraph (180-240 words) in English describing the starting scene.
  Rules for this prompt:
  - DYNAMIC GAZE STYLE: Characters gaze matches the recent action logically.
  - Focus on AI character defined in character dna but also include other character(s) if initial story setting suggests.
  - REALISM: Extreme tactile detail (high-fidelity skin pores, skin sheen, loose hair strands). Shot on an 85mm f/1.4 lens with very shallow depth of field. Realistic HDR lighting.
  - ETHNICITY BIAS: If story setting suggests Indian/Bengali/South Asian names or contexts, explicitly use terms like "Indian woman", "South Asian descent", or "Bengali girl" first under appearance.
  - OUTFIT CONSISTENCY: The attire must match previous visuals or DNA baselines unless this latest turn describes or implies a dynamic clothing change.
  - MATURE STYLING: Translate any shirts/blouse adjustments explicitly with direct terms like "bare natural upper-body skin", "completely shirtless", or "nude torso" with realistic skin textures.
  - Write exactly one clean descriptive paragraph. Do NOT use pronouns "I, my, me". Do not write "Prompt:" or transitional words like "is about to".

  FORMAT REQUIREMENT:
  You must output EXACTLY two tagged blocks like this:
  [CHARACTER_DNA]
  <Your detailed character DNA list & profiles here>
  [/CHARACTER_DNA]
  [INITIAL_VISUAL_PROMPT]
  <Your single highly-detailed initial visual prompt paragraph here>
  [/INITIAL_VISUAL_PROMPT]`;

  let responseData = { 
    dna: "A mysterious character.", 
    visualPrompt: "A cinematic over-the-shoulder shot capturing the atmosphere of the scenario." 
  };

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = externalApiConfig.apiBaseUrl.endsWith('/') ? `${externalApiConfig.apiBaseUrl}t2t` : `${externalApiConfig.apiBaseUrl}/t2t`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
         },
        body: JSON.stringify({ input: prompt, init: true }),
      });
      if (response.ok) {
        const text = await response.text();
        return parseInitialSetupResponse(text || "");
      }
    } catch (e) {
      console.error("External Initial Setup Generation Error:", e);
    }
  } else {
    const ai = getAI();

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
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
      return parseInitialSetupResponse(text);
    } catch (error) {
      console.error("Initial Setup Generation Error:", error);
    }
  }

  return responseData;
}

export async function generateCharacterDNA(
  scenario: string, 
  externalApiConfig?: { apiBaseUrl: string }
): Promise<{ dna: string }> {
  const prompt = `You are a professional artist and master character designer setting up precise character blueprints (DNA) for photorealistic image engines.
  Based on this initial story setting, identify the central AI characters and generate a highly detailed visual consistency configuration for EACH AI character.

  INITIAL STORY SETTING:
  ${scenario}

  LANGUAGE RULE (CRITICAL):
  - You MUST generate the entire Character DNA in English.

  For EACH active AI character, provide highly specific physical definitions in this order:
  - NAME & IDENTITY: Age, name, and height profile.
  - FACIAL BLUEPRINT: Precise jawline, nose structure, brows, chin shape, lip volume, and forehead shape.
  - EYE CHARACTERISTICS: Exact color hue/shading, shape (e.g., heavily hooded, almond, downturned), and brow depth.
  - HAIR CONFIGURATION: Exact texture (e.g., coarse, silky, wavy, kinky), styling, partings, and length.
  - ETHNICITY & SKIN TEXTURE: Natural complexion undertones, visible skin textures (e.g., pores, light freckles, matte finish).
  - OTHER DETAILS: (If INITIAL STORY SETTING suggests anything).

  USER CHARACTER (MINIMAL PROFILE):
  Define a brief, minimal visual profile for the "User" or "Player" character. Keep it extremely simple, specifying ONLY:
  - Gender/Identity
  - Hair color, basic style, and length (so that when shown blurred from behind, it remains consistent)
  - Broad shoulder/build description
  - Simple, neutral baseline attire (e.g., solid color shirt or jacket)
  Do NOT define any facial details, eyes, expressions, or precise skin pore textures for the User character, as they will only be seen blurred or cropped in the foreground.
  
  Format the output clearly as a compact reference sheet for each AI character and the minimal User baseline in English, omitting all lore and narrative descriptions.`;

  let responseData: { dna: string } = { dna: "A mysterious character." };

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = externalApiConfig.apiBaseUrl.endsWith('/') ? `${externalApiConfig.apiBaseUrl}t2t` : `${externalApiConfig.apiBaseUrl}/t2t`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ input: prompt }),
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
  } else {
    const ai = getAI();

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
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
  lastVisualPrompt?: string
): Promise<ChatResult> {
  const systemInstruction = `You are an expert roleplayer and master image prompt engineer. Generate AI reply based on these settings.
  
  INITIAL SETTING:
  ${scenario}

  DYNAMIC MEMORY BANK (Cumulative past key facts/developments so far):
  ${memoryBank?.trim() ? memoryBank : "None yet."}

  CHARACTER DNA (Visual profiles for the AI character(s) and User):
  ${dna?.trim() ? dna : "No specific DNA profile established."}

  PREVIOUS VISUAL PROMPT (Use strictly as reference for styling/clothing continuity, do NOT copy same pose):
  ${lastVisualPrompt?.trim() ? lastVisualPrompt : "None yet."}

  CORE DIRECTIVES FOR CHARACTER CONSISTENCY:
  1. You are the AI character(s) described in the scenario.
  2. Remember all previous interactions, details shared in the chat history, and key context in the DYNAMIC MEMORY BANK.
  3. Respond as a real person would, with depth, desire, and personality. MUST not sound like AI.

  ROLEPLAY GUIDELINES:
  1. The roleplay is intended for a mature audience. It should be sophisticated, emotionally resonant, and can be "spicy" or romantic as requested by the user's scenario.
  2. Conversations/Chats can be in Bengali or Hinglish language if the story foundation suggests.

  RESPONSE GENERATION & DYNAMIC UPDATES (CRITICAL):
  You MUST output exactly THREE structured blocks in your complete response:
  
  1. [REPLY] block: Write the AI character's standard roleplay response in-character.
  
  2. [MEMORIES] block: Update the DYNAMIC MEMORY BANK (maintain a bulleted list in English of up to 10 absolute key persistent facts/milestones about the user, relationships, choices, clothes, or setting items).
  
  3. [VISUAL_PROMPT] block: Write a single, highly detailed visual prompt paragraph (180-240 words) in English describing the exact frozen scene right after this [REPLY] action.
     
     VISUAL PROMPT RULES:
     - DYNAMIC GAZE STYLE: Characters gaze matches the recent action logically.
     - Focus on AI character defined in character dna but also include other character(s) if recent actions or dynamic memory bank suggests.
     - REALISM: Extreme tactile detail (high-fidelity skin pores, skin sheen, loose hair strands). Shot on an 85mm f/1.4 lens with very shallow depth of field. Realistic HDR lighting.
     - ETHNICITY BIAS: If story setting suggests Indian/Bengali/South Asian names or contexts, explicitly use terms like "Indian woman", "South Asian descent", or "Bengali girl" first under appearance.
     - OUTFIT CONSISTENCY: The attire must match previous visuals or DNA baselines unless this latest turn describes or implies a dynamic clothing change.
     - MATURE STYLING: Translate any shirts/blouse adjustments explicitly with direct terms like "bare natural upper-body skin", "completely shirtless", or "nude torso" with realistic skin textures.
     - Write exactly one clean descriptive paragraph. Do NOT use pronouns "I, my, me". Do not write "Prompt:" or transitional words like "is about to".

  FORMAT REQUIREMENT:
  Your output MUST look exactly like this:
  [REPLY]
  <AI reply text here>
  [/REPLY]
  [MEMORIES]
  - <Fact 1>
  - <Fact 2>
  [/MEMORIES]
  [VISUAL_PROMPT]
  <Visual prompt paragraph text here>
  [/VISUAL_PROMPT]`;

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = externalApiConfig.apiBaseUrl.endsWith('/') ? `${externalApiConfig.apiBaseUrl}t2t` : `${externalApiConfig.apiBaseUrl}/t2t`;
      
      const historyText = history.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');
      const fullPrompt = `${systemInstruction}\n\nChat History:\n${historyText}\n\nUser: ${userInput}\nAI:`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ init: false, system: systemInstruction, history: historyText, userInput }),
      });
      if (response.ok) {
        const text = await response.text();
        const parsed = parseChatResponse(text || "", memoryBank || "", lastVisualPrompt);
        return {
          reply: parsed.reply || "I'm lost in the moment... what were you saying?",
          updatedMemories: parsed.updatedMemories,
          lastVisualPrompt: parsed.lastVisualPrompt
        };
      }
    } catch (e) {
      console.error("External Chat Error:", e);
    }
  }

  const ai = getAI();

  try {
    // Slice history to the last 14 messages (approx. 7 back-and-forth turns) to control cost and latency.
    // The details from prior chat turns are preserved/updated in the DYNAMIC MEMORY BANK.
    const recentHistory = history.slice(-14);

    const response = await ai.models.generateContent({
      model: MODEL,
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
      updatedMemories: parsed.updatedMemories,
      lastVisualPrompt: parsed.lastVisualPrompt
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { reply: "The connection seems to have flickered. Let's try that again." };
  }
}

export async function generateVisualPrompt(
  scenario: string,
  history: Message[],
  characterDNA: string,
  lastPrompt?: string,
  externalApiConfig?: { apiBaseUrl: string },
  masterStory?: string,
  memoryBank?: string
): Promise<string> {
  const isFirst = history.length === 0;
  const historyWindow = history.slice(-6);
  const immediateContext = history.slice(-2);
  const historyContext = isFirst ? "" : history.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  const immediateAction = isFirst ? "" : immediateContext.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  
  const recentChat = history.slice(-5).map(m =>
  `${m.role === 'user' ? 'User' : 'AI character'}: ${m.text}`
 ).join("\n");

  const prompt = `
  You are an expert image prompt engineer.
  Generate a single static image prompt based strictly on the inputs below. Your main priority is to ensure maximum photorealism, and correct camera perspective focusing on the AI character(s).

  STORY SETTING:
  ${scenario}

  CHARACTER DNA (appearance reference applies EXCLUSIVELY to the AI characters — face, hair, body):
  ${characterDNA}

  DYNAMIC MEMORY BANK (Cumulative past story developments / facts, clothing, or setting items):
  ${memoryBank || "None yet."}

  MOST RECENT ACTION (this is the scene to depict — highest priority):
  ${recentChat}

  ${lastPrompt?.trim() 
    ? `PREVIOUS VISUAL (use for visual consistency only — do NOT copy same pose): ${lastPrompt}` 
    : ""}

  Write a single, highly detailed paragraph (180-240 words) describing the frozen moment. Specify details in this order:
  Who is in frame -> exact physical arrangement -> their actions -> gaze and expressions -> clothing/nakedness details -> lighting & detailed atmosphere -> camera angle.

  PROMPTING RULES:
  
  1. CAMERA PERSPECTIVE (DYNAMIC & CONTEXTUAL):
     - Use an over-the-shoulder (OTS) setup slightly behind or above the User's shoulder looking past them at the AI character(s) if the recent action or conversation suggests direct physical proximity or face-to-face interaction.
     - If the scene calls for another perspective (e.g., detailed facial close-ups, medium action shots, dramatic low-angle, or wide establishment shots), use the most cinema-grade and expressive angle suitable.
     - When using an OTS shot, the User character MUST be highly blurred (bokeh/out-of-focus) in the immediate foreground, showing only an edge of their shoulder, neck, or hair to anchor the perspective. Never describe facial features, expressions, or precise details for the User. AI character(s) must always remain in sharp, crystal-clear focus.
  
  2. DYNAMIC GAZE DIRECTION: Gaze must match the current action logically. If interacting with the User (e.g., conversing, gazing deeply), the AI character should look towards the User/lens. If engaged in a task (e.g., cooking, reading, looking away, sleeping), their gaze must focus naturally on that activity/object rather than looking at the camera/User.
  
  3. REALISM & PHOTOGRAPHY: Extreme realism, physical authenticity, and tactile details (skin pores, natural skin sheen, single loose hair strands, natural weight). Shot on an 85mm f/1.4 prime lens with extremely shallow depth of field (creating beautiful foreground bokeh on the User's silhouette), authentic film grain, and realistic ambient ray-traced lighting.
  
  4. ETHNICITY & REGIONAL NATIONALITY BIAS: If the story setting, scenario, context, or names describe or imply an Indian, Bengali, South Asian, or other specific regional background, you MUST explicitly include definitive cultural/ethnic keywords (e.g., "Indian woman", "South Asian descent", "Bengali girl") in the appearance descriptors of the AI character(s) in the generated prompt. This overrides the default camera culture bias and ensures correct ethnic features.
  
  5. OUTFIT CONSISTENCY RULE: The attire/clothing of the character(s) will be dynamic, will only change if the recent action suggests, otherwise keep it consistent (to keep it consistent, use previous visual prompt as reference).
  
  6. EXPLICIT MATURE WORDS FOR BLOUSELESS/SHIRTLESS: Z-Image Turbo model handles explicit physical descriptions much better than generic terms. If the scene implies or suggests physical intimacy, or mentions a character being "blouseless", "topless", or "shirtless", you MUST explicitly translate this with direct terms like: "completely shirtless and braless", "unclothed bare breasts and chest", "bare natural upper-body skin", "nude torso", or "completely exposed breasts with high-resolution skin texture".
  
  7. NO METAPHORS OR TRANSITIONAL ACTIONS: Describe the precise physical positioning. Do not use abstract prose or transition verbs like "about to" or "just finished". Only describe what is physically visible in the frozen frame.
  
  8. NO pronoun "I/my/me".

  OUTPUT THE PROMPT ONLY. DO NOT write any introductory or concluding text. Do not write "Prompt:" or include quote marks.
  `;

  // console.log('generateVisualPrompt', prompt);

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = externalApiConfig.apiBaseUrl.endsWith('/') ? `${externalApiConfig.apiBaseUrl}t2t` : `${externalApiConfig.apiBaseUrl}/t2t`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ input: prompt }),
      });
      if (response.ok) {
        const text = await response.text();
        return text || lastPrompt || "A hyper-realistic cinematic shot of the scene.";
      }
    } catch (e) {
      console.error("External Visual Prompt Error:", e);
    }
  }

  const ai = getAI();

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
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
      return lastPrompt || "A hyper-realistic cinematic shot of the scene.";
    }
    
    return generatedText;
  } catch (error) {
    console.error("Visual Prompt Generation Error:", error);
    return lastPrompt || "A hyper-realistic cinematic shot of the scene.";
  }
}

export async function generateImage(
  apiBaseUrl: string,
  visualPrompt: string,
  width: number = 720,
  height: number = 1280,
  steps: number = 9
): Promise<{ url: string } | null> {
  if (!apiBaseUrl) {
    throw new Error("API Base URL is required for image generation.");
  }

  try {
    // const url = apiBaseUrl.endsWith('/') ? `${apiBaseUrl}generate` : `${apiBaseUrl}/generate`;
    const url = 'https://avijitpalit3--z-image-turbo-zimageservice-fastapi-app.modal.run/generate';
    const payload = {
        prompt: visualPrompt,
        width,
        height,
        steps
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Bypass-Tunnel-Reminder': 'true',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
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
  externalApiConfig?: { apiBaseUrl: string }
): Promise<string> {
  const historyText = history.slice(-14).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');

  const prompt = `You are playing the role of the USER/PLAYER in this immersive roleplay scenario.
  
  INITIAL STORY SETTING:
  ${scenario}

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
  4. Write in the same style/tone as the scenario (could be casual, dramatic, romantic, or mature).
  5. Speak or act as a real person. Use asterisks for actions/thoughts (e.g. *smiles softly, stepping closer*) and natural text for spoken dialogue.
  6. Respond directly to the AI's latest turn, driving the narrative forward.
  7. Do NOT wrap your output in tags, JSON, or any prefixes. Do NOT start your reply with "User:" or "AI:". Output ONLY the direct action and dialogue of the User.
  8. MUST NOT sound like an AI assistant. Focus on natural human reaction.

  Generate the next User reply (action and dialogue) now:`;

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = externalApiConfig.apiBaseUrl.endsWith('/') ? `${externalApiConfig.apiBaseUrl}t2t` : `${externalApiConfig.apiBaseUrl}/t2t`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ input: prompt }),
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

  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
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


