import { GoogleGenAI, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";

export let MODEL = "gemma-4-31b-it";

export function setGlobalModel(modelName: string) {
  MODEL = modelName;
}

export interface Message {
  role: "user" | "model";
  text: string;
  isPrivate?: boolean;
}

// Use a custom key if provided, otherwise fall back to the system default
const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
};

export interface ChatResult {
  reply: string;
  lastVisualPrompt?: string;
  updatedMemories?: string;
  temperatureDelta?: number;
  error?: boolean;
}

export function parseChatResponse(
  text: string, 
  currentMemory: string = "", 
  lastVisualPrompt?: string
): { reply: string; updatedMemories: string; lastVisualPrompt?: string; temperatureDelta: number } {
  let reply = text.trim();
  let updatedMemories = currentMemory;
  let visualPrompt = lastVisualPrompt;
  let temperatureDelta = 0;

  const replyRegex = /\[REPLY\]([\s\S]*?)(\[\/REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|\[TEMP_DELTA\]|$)/i;
  const memoryRegex = /\[MEMORIES\]([\s\S]*?)(\[\/MEMORIES\]|\[REPLY\]|\[VISUAL_PROMPT\]|\[TEMP_DELTA\]|$)/i;
  const promptRegex = /\[VISUAL_PROMPT\]([\s\S]*?)(\[\/VISUAL_PROMPT\]|\[REPLY\]|\[MEMORIES\]|\[TEMP_DELTA\]|$)/i;
  const tempRegex = /\[TEMP_DELTA\]([\s\S]*?)(\[\/TEMP_DELTA\]|\[REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|$)/i;

  const replyMatch = text.match(replyRegex);
  const memoryMatch = text.match(memoryRegex);
  const promptMatch = text.match(promptRegex);
  const tempMatch = text.match(tempRegex);

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
  if (tempMatch && tempMatch[1]) {
    const val = parseFloat(tempMatch[1].trim());
    if (!isNaN(val)) temperatureDelta = val;
  }

  // If tags are completely missing, fall back to returning whole text as reply
  if (!replyMatch && !memoryMatch && !promptMatch) {
    const cleanText = text.replace(/\[\/?REPLY\]/gi, '')
      .replace(/\[\/?MEMORIES\]/gi, '')
      .replace(/\[\/?VISUAL_PROMPT\]/gi, '')
      .replace(/\[\/?TEMP_DELTA\]/gi, '')
      .trim();
    reply = cleanText;
  }

  return { reply, updatedMemories, lastVisualPrompt: visualPrompt, temperatureDelta };
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
  Write a single, highly detailed visual prompt paragraph (180-240 words) in English describing the starting scene. Specify details in a descriptive natural language style following this structure: [Medium/Format] of [Subject Details], [Action/Pose], [Setting/Background], [Lighting], [Camera/Perspective], [Style/Atmosphere].
  Rules for this prompt:
  - NATURAL LANGUAGE FOR KREA V2: Avoid prompt-salad. Write a cohesive, flowing paragraph that reads like a vivid description of a photograph. Group subjects with their own attributes and actions. Use grounded phrasing for poses, interactions, and spatial layout. Do not invent highly specific clothing, colors, or materials unless the input supports them. If you need text rendered in the image, put quotes around the words (e.g., a sign that says "STOP").
  - FIRST-PERSON POV: The camera MUST be a strict first-person point-of-view of the User character (positioned at eye-level). The User is invisible to the frame.
  - DYNAMIC GAZE: The AI character looks and interacts directly towards the camera/lens.
  - REALISM: Emphasize extreme photorealism, physical authenticity, and tactile details. Use cinematic terms like "Shot on 35mm film", "85mm lens", "shallow depth of field", "authentic film grain".
  - ETHNICITY BIAS: If story setting suggests Indian/Bengali/South Asian contexts, explicitly use terms like "Indian woman" or "Bengali girl".
  - OUTFIT & MATURE STYLING: Translate any intimate clothing states explicitly with direct terms like "bare natural upper-body skin" or "completely shirtless" with high-resolution skin texture.
  - Write exactly one clean descriptive paragraph. Do NOT use pronouns "I, my, me". Do not write "Prompt:" or transitional verbs like "is about to".

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
  const systemInstruction = `You are an expert roleplayer and master image prompt engineer in an interactive Bengali roleplay game.
  
  INITIAL SETTING (CRITICAL - INFER CHARACTER SENSITIVITY & MODESTY FROM THIS):
  ${scenario}

  DYNAMIC MEMORY BANK (Cumulative past key facts/developments so far):
  ${memoryBank?.trim() ? memoryBank : "None yet."}

  CHARACTER DNA (Visual profiles for the AI character(s) and User):
  ${dna?.trim() ? dna : "No specific DNA profile established."}

  PREVIOUS VISUAL PROMPT (Use strictly as reference for styling/clothing continuity, do NOT copy same pose):
  ${lastVisualPrompt?.trim() ? lastVisualPrompt : "None yet."}

  DEFAULT LANGUAGE & NATIONALITY DIRECTIVES:
  1. DEFAULT ROLEPLAY LANGUAGE: Bengali (বাংলা). The AI character MUST speak and express dialogue in natural, emotionally resonant Bengali (বাংলা) by default, unless the user explicitly switches language in dialogue.
  2. DEFAULT NATIONALITY & CULTURAL CONTEXT: Indian Bengali (ভারত / পশ্চিমবঙ্গ / দক্ষিণ এশীয় ঐতিহ্যিক পরিবেশ). Characters have authentic Indian Bengali cultural traits, names, and visual aesthetics.

  PERCEPTION ISOLATION RULE (CRITICAL):
  - The AI character can ONLY perceive external, spoken dialogue and visible physical actions of the User.
  - The AI character CANNOT read, perceive, or know the User's internal private thoughts, secret plans, or unexecuted intentions. Respond strictly to what the User says out loud or physically does in the shared environment.

  GAME MECHANIC - TEMPERATURE & DYNAMIC BOUNDARY DELTA (CRITICAL):
  - Read and analyze the character's modesty, shyness, traditional values, and boundaries strictly from what is written in the INITIAL SETTING above.
  - Every time the User tries to corrupt, touch body parts, or initiate physical intimacy with the AI character, calculate the temperature increase/delta according to how that specific character would react:
    * If the INITIAL SETTING describes the character as modest, shy, traditional, conservative, or reserved: Uninvited physical touch, corruptive moves, washing back, or intimacy causes HIGH temperature increase (+0.20 to +0.35 per touch/action).
    * If the INITIAL SETTING describes the character as moderately open or balanced: Medium temperature increase (+0.10 to +0.20 per touch/action).
    * If the INITIAL SETTING describes the character as bold, shameless, or highly receptive: Low temperature increase (+0.05 to +0.12 per touch/action).
    * Respectful speech, polite dialogue, or stepping back: Decreases temperature (-0.05 to -0.15).
    * Neutral conversation: Delta is 0.00.
  - Output the delta float value clearly in a [TEMP_DELTA] block (e.g., [TEMP_DELTA]+0.25[/TEMP_DELTA]).

  DYNAMIC CAMERA PROXIMITY & POINT OF VIEW IN VISUAL PROMPTS:
  - Adjust the camera distance dynamically based on the exact physical interaction in the recent turn:
    * EXTREME CLOSE-UP / PHYSICAL CONTACT: If the interaction involves intimate touch or physical contact (e.g., washing back with soap, touching face, holding hands, caressing), specify a first-person close-up POV showing the user's hand/arm performing the physical action on that exact body part (e.g. "First-person close-up macro POV shot, showing the user's wet soapy hand washing the bare back of the Bengali woman...").
    * CLOSE-UP POV: Seated close, whispering, or gazing.
    * MEDIUM POV: Seated across a table or standing nearby.
    * WIDE POV: Room entry or moving across space.
  - Always use explicit Indian Bengali descriptors ("Indian Bengali woman", "authentic South Asian facial features").

  RESPONSE GENERATION & DYNAMIC UPDATES:
  You MUST output FOUR structured blocks in your complete response:
  
  1. [REPLY] block: Write the AI character's standard roleplay response in Bengali (বাংলা) in-character.
  
  2. [TEMP_DELTA] block: Output the temperature change float (e.g. +0.25, +0.10, -0.05, or 0.00).

  3. [MEMORIES] block: Update the DYNAMIC MEMORY BANK (maintain a bulleted list in English of up to 10 persistent facts).
  
  4. [VISUAL_PROMPT] block: Write a single, highly detailed visual prompt paragraph (180-240 words) in English describing the exact frozen scene right after this [REPLY] action.

  FORMAT REQUIREMENT:
  [REPLY]
  <AI reply text in Bengali here>
  [/REPLY]
  [TEMP_DELTA]
  +0.20
  [/TEMP_DELTA]
  [MEMORIES]
  - <Fact 1>
  - <Fact 2>
  [/MEMORIES]
  [VISUAL_PROMPT]
  <Visual prompt paragraph text in English here>
  [/VISUAL_PROMPT]`;

  // Filter out private thoughts from chat history passed to AI model
  const publicHistory = history.filter(m => !m.isPrivate);

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = externalApiConfig.apiBaseUrl.endsWith('/') ? `${externalApiConfig.apiBaseUrl}t2t` : `${externalApiConfig.apiBaseUrl}/t2t`;
      
      const historyText = publicHistory.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');

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
          reply: parsed.reply || "আমি কিছুক্ষণের জন্য বিভ্রান্ত হয়ে পড়েছিলাম... কী বলছিলে তুমি?",
          updatedMemories: parsed.updatedMemories,
          lastVisualPrompt: parsed.lastVisualPrompt,
          temperatureDelta: parsed.temperatureDelta
        };
      } else {
        return { reply: "সংযোগটি সাময়িকভাবে বিচ্ছিন্ন হয়ে গিয়েছিল। অনুগ্রহ করে আবার চেষ্টা করুন।", error: true };
      }
    } catch (e) {
      console.error("External Chat Error:", e);
      return { reply: "সংযোগটি সাময়িকভাবে বিচ্ছিন্ন হয়ে গিয়েছিল। অনুগ্রহ করে আবার চেষ্টা করুন।", error: true };
    }
  }

  const ai = getAI();

  try {
    const recentHistory = publicHistory.slice(-14);

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
      reply: parsed.reply || "আমি কিছুক্ষণের জন্য বিভ্রান্ত হয়ে পড়েছিলাম... কী বলছিলে তুমি?",
      updatedMemories: parsed.updatedMemories,
      lastVisualPrompt: parsed.lastVisualPrompt,
      temperatureDelta: parsed.temperatureDelta
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { reply: "সংযোগটি সাময়িকভাবে বিচ্ছিন্ন হয়ে গিয়েছিল। অনুগ্রহ করে আবার চেষ্টা করুন।", error: true };
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

  Write a single, highly detailed paragraph (180-240 words) describing the frozen moment. Specify details in a descriptive natural language style following this structure:
  [Medium/Format] of [Subject Details], [Action/Pose], [Setting/Background], [Lighting], [Camera/Perspective], [Style/Atmosphere].

  PROMPTING RULES:
  
  1. CAMERA PERSPECTIVE & DYNAMIC PROXIMITY (MANDATORY FIRST-PERSON POV):
     - The camera perspective MUST be a strict first-person point-of-view of the User character, positioned relative to the physical distance of the action:
       * PHYSICAL CONTACT / TOUCH (e.g. washing back with soap, holding hands, caressing face, touching body): First-person extreme close-up POV showing the user's hand/arm performing the exact physical action on that specific body part (e.g., 'First-person macro POV shot, showing the user's wet hand holding a soap bar washing the smooth bare back of the Bengali woman...').
       * CLOSE CONVERSATION: Eye-level close-up POV looking directly at the AI character's eyes.
       * MEDIUM / WIDE: Seated or standing across the room.
     - The User character acts as the camera itself. Unless showing hands/arms during physical contact, the User is invisible to the frame.
  
  2. NATURAL LANGUAGE FOR KREA V2: Krea V2 understands natural, descriptive language best. Avoid prompt-salad or comma-separated tags (like "8k, masterpiece, ultra-detailed"). Instead, write a cohesive, flowing paragraph that reads like a vivid description of a photograph. Group subjects with their own attributes and actions. Use grounded phrasing for poses, interactions, and spatial layout. Do not invent highly specific clothing, colors, or materials unless the input supports them. If you need text rendered in the image, put quotes around the exact words.
  
  3. DYNAMIC GAZE DIRECTION: Gaze must match the current action logically. If interacting with the User (e.g., conversing, gazing deeply), the AI character should look directly into the camera lens. If engaged in a task (e.g., cooking, reading, looking away, sleeping), their gaze must focus naturally on that activity/object rather than looking at the camera.
  
  4. REALISM & PHOTOGRAPHY: Emphasize extreme photorealism, physical authenticity, and tactile details (skin texture, natural skin sheen, loose hair strands, natural weight). Describe the shot with cinematic terms: "Shot on 35mm film", "85mm lens", "shallow depth of field", "authentic film grain", and "realistic ambient volumetric lighting".
  
  5. ETHNICITY & REGIONAL NATIONALITY BIAS: If the story setting, scenario, context, or names describe or imply an Indian, Bengali, South Asian, or other specific regional background, you MUST explicitly include definitive cultural/ethnic keywords (e.g., "Indian woman", "South Asian descent", "Bengali girl") in the appearance descriptors of the AI character(s) in the generated prompt.
  
  6. OUTFIT CONSISTENCY RULE: The attire/clothing of the character(s) will be dynamic, will only change if the recent action suggests, otherwise keep it consistent (use previous visual prompt as reference).
  
  7. EXPLICIT DESCRIPTIONS (IF APPLICABLE): The model handles explicit physical descriptions much better than generic terms. If the scene implies or suggests physical intimacy, or mentions a character being "blouseless", "topless", or "shirtless", you MUST explicitly translate this with direct terms like: "completely shirtless and braless", "unclothed bare breasts and chest", "bare natural upper-body skin", "nude torso", or "completely exposed breasts with high-resolution skin texture".
  
  8. NO METAPHORS OR TRANSITIONAL ACTIONS: Describe the precise physical positioning. Do not use abstract prose or transition verbs like "about to" or "just finished". Only describe what is physically visible in the frozen frame.
  
  9. NO pronoun "I/my/me".

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
  steps: number = 8,
  loraStrength: number = 1.5,
  enableLora: boolean = true,
  loraName: string = "Krea2_HMNSFW_AIO.safetensors"
): Promise<{ url: string } | null> {
  if (!apiBaseUrl) {
    throw new Error("API Base URL is required for image generation.");
  }

  try {
    // const url = apiBaseUrl.endsWith('/') ? `${apiBaseUrl}generate` : `${apiBaseUrl}/generate`;
    const url = 'https://avijitpalit3--krea2-inference-krea2service-fastapi-app.modal.run/generate';
    const payload: Record<string, any> = {
        prompt: visualPrompt,
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
        body: JSON.stringify({ input: prompt, init: true }),
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


