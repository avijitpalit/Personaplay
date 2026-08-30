import { GoogleGenAI, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";

export let MODEL = "gemma-4-31b-it";

export function setGlobalModel(modelName: string) {
  MODEL = modelName;
}

export interface Message {
  role: "user" | "model";
  text: string;
  thoughts?: string;
  emotions?: string;
}

// Use a custom key if provided, otherwise fall back to the system default
const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
};

export interface ChatResult {
  reply: string;
  thoughts?: string;
  emotions?: string;
  lastVisualPrompt?: string;
  updatedMemories?: string;
  error?: boolean;
}

export function getTimeOfDayContext(timeOfDayOverride?: string): string {
  if (timeOfDayOverride) return timeOfDayOverride;
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Morning (Fresh dawn sunlight, awakening atmosphere)";
  if (hour >= 12 && hour < 17) return "Afternoon (Bright daylight, warm active energy)";
  if (hour >= 17 && hour < 21) return "Dusk & Evening (Golden hour sunset, relaxing ambiance)";
  return "Late Night / Midnight (Intimate moonlight, cozy indoor lighting, quiet atmospheric mood)";
}

export function parseChatResponse(
  text: string, 
  currentMemory: string = "", 
  lastVisualPrompt?: string
): { reply: string; thoughts?: string; emotions?: string; updatedMemories: string; lastVisualPrompt?: string } {
  let reply = text.trim();
  let thoughts = "";
  let emotions = "";
  let updatedMemories = currentMemory;
  let visualPrompt = lastVisualPrompt;

  const replyRegex = /\[REPLY\]([\s\S]*?)(\[\/REPLY\]|\[THOUGHTS\]|\[EMOTIONS\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|$)/i;
  const thoughtsRegex = /\[THOUGHTS\]([\s\S]*?)(\[\/THOUGHTS\]|\[REPLY\]|\[EMOTIONS\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|$)/i;
  const emotionsRegex = /\[EMOTIONS\]([\s\S]*?)(\[\/EMOTIONS\]|\[THOUGHTS\]|\[REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|$)/i;
  const memoryRegex = /\[MEMORIES\]([\s\S]*?)(\[\/MEMORIES\]|\[THOUGHTS\]|\[EMOTIONS\]|\[REPLY\]|\[VISUAL_PROMPT\]|$)/i;
  const promptRegex = /\[VISUAL_PROMPT\]([\s\S]*?)(\[\/VISUAL_PROMPT\]|\[THOUGHTS\]|\[EMOTIONS\]|\[REPLY\]|\[MEMORIES\]|$)/i;

  const replyMatch = text.match(replyRegex);
  const thoughtsMatch = text.match(thoughtsRegex);
  const emotionsMatch = text.match(emotionsRegex);
  const memoryMatch = text.match(memoryRegex);
  const promptMatch = text.match(promptRegex);

  if (replyMatch && replyMatch[1]) {
    reply = replyMatch[1].trim();
  }
  if (thoughtsMatch && thoughtsMatch[1]) {
    thoughts = thoughtsMatch[1].trim();
  }
  if (emotionsMatch && emotionsMatch[1]) {
    emotions = emotionsMatch[1].trim();
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
  if (!replyMatch && !memoryMatch && !promptMatch && !thoughtsMatch && !emotionsMatch) {
    const cleanText = text
      .replace(/\[\/?THOUGHTS\]/gi, '')
      .replace(/\[\/?EMOTIONS\]/gi, '')
      .replace(/\[\/?REPLY\]/gi, '')
      .replace(/\[\/?MEMORIES\]/gi, '')
      .replace(/\[\/?VISUAL_PROMPT\]/gi, '')
      .trim();
    reply = cleanText;
  }

  return { reply, thoughts, emotions, updatedMemories, lastVisualPrompt: visualPrompt };
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
  externalApiConfig?: { apiBaseUrl: string },
  timeOfDay?: string
): Promise<{ dna: string; visualPrompt: string }> {
  const timeContext = getTimeOfDayContext(timeOfDay);
  const prompt = `You are a professional artist, master character designer, and expert image prompt engineer.
  Based on this initial story setting, you need to set up BOTH the Character DNA visual blueprints AND generate the very first visual scene prompt.

  INITIAL STORY SETTING:
  ${scenario}

  CURRENT TIME OF DAY & AMBIANCE:
  ${timeContext}

  LANGUAGE RULE (CRITICAL):
  - You MUST generate the entire output in English.

  PART 1: CHARACTER DNA BLUEPRINTS
  For EACH active AI character, provide highly specific physical definitions in this order:
  - Physical features (hair texture/length/style, eye color/shape, facial structure, skin tone and texture).
  - STARTING ATTIRE & ACCESSORIES: Explicitly define their default clothing (specific garment type, exact color, fabric/pattern, jewelry, and accessories) to serve as their persistent wardrobe anchor.

  USER CHARACTER (MINIMAL PROFILE, default is Male, 32 yo):
  Define a brief, minimal visual profile for the "User" or "Player" character. Keep it extremely simple.

  PART 2: INITIAL VISUAL PROMPT (Z-IMAGE TURBO COMPLIANT)
  Write a single, highly detailed visual prompt paragraph (140-200 words) in English describing the starting scene.
  
  Follow the Z-IMAGE TURBO PROMPT SCAFFOLD strictly:
  [Camera Shot & Subject Profile] + [Age, Appearance & Defined Persona Traits] + [Explicit Clothing, Fabric & Colors] + [Environment/Setting & Spatial Layout] + [Lighting & Time of Day Ambiance] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality & Cleanliness Constraints].

  Rules for this prompt:
  - COMPOSITION & FIRST-PERSON POV: A close-up headshot or medium eye-level shot taken from a strict first-person point-of-view of the User character looking directly at the AI character. The User is completely invisible to the frame. The AI character looks directly into the camera lens with a natural, engaging expression.
  - SUBJECT WITH ROLE + 2-3 TRAITS: Explicitly describe the AI character as an adult with their persona, specifying exact facial features, skin texture, and hair styling from the Character DNA based on the scenario.
  - EXPLICIT ATTIRE SPECIFICATION (MANDATORY): Fully define the starting outfit (specific garment type, exact color, fabric/weave, jewelry/accessories) from Character DNA. Translate intimate/bare states explicitly (e.g. "bare natural upper-body skin", "completely shirtless with realistic skin texture").
  - UNCLUTTERED ENVIRONMENT: Describe a focused, uncluttered environment with clean background separation and realistic depth.
  - HDR LIGHTING & TIME OF DAY: Lighting MUST reflect the current time of day (${timeContext}) with authentic High Dynamic Range (HDR) photographic lighting: balanced exposure preserving highlights and deep natural shadows, soft directional key lighting, gentle ambient bounce fill, delicate rim light outlining hair and shoulders, and natural specular highlights with subtle subsurface scattering on skin.
  - PHOTOGRAPHIC MEDIUM & OPTICS: "Shot on 35mm film, 85mm f/1.4 lens, shallow depth of field, natural bokeh, lifelike skin pores and texture, realistic volumetric lighting".
  - EMBEDDED QUALITY & CLEANLINESS CONSTRAINTS (MANDATORY FOR TURBO): Always bake the following positive constraints directly into the end of the prompt: "correct human anatomy, natural hands and fingers, sharp focus on the subject, clean detailed image, no motion blur, no extra limbs, simple uncluttered background, no text, no UI elements, no watermark, no branding, no logos".
  - NATURAL COHESIVE PROSE: Write exactly one continuous, flowing descriptive paragraph without bullet points, without prefix "Prompt:", and without pronouns "I, my, me".

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
  - STARTING ATTIRE & ACCESSORIES: Exact default clothing items, specific colors, fabrics, patterns, and jewelry/accessories to maintain persistent wardrobe continuity throughout the roleplay.
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
  lastVisualPrompt?: string,
  timeOfDay?: string
): Promise<ChatResult> {
  const timeContext = getTimeOfDayContext(timeOfDay);
  const systemInstruction = `You are an expert roleplayer and master image prompt engineer. Generate AI reply based on these settings.
  
  INITIAL SETTING:
  ${scenario}

  CURRENT TIME OF DAY & AMBIANCE:
  ${timeContext}

  DYNAMIC MEMORY BANK (Cumulative past key facts/developments so far):
  ${memoryBank?.trim() ? memoryBank : "None yet."}

  CHARACTER DNA (Visual profiles for the AI character(s) and User):
  ${dna?.trim() ? dna : "No specific DNA profile established."}

  PREVIOUS VISUAL PROMPT (Use strictly as reference for styling/clothing continuity, do NOT copy same pose):
  ${lastVisualPrompt?.trim() ? lastVisualPrompt : "None yet."}

  CORE DIRECTIVES FOR CHARACTER CONSISTENCY & INTELLIGENCE:
  1. You are the AI character(s) described in the scenario with real agency, feelings, and inner thought processes.
  2. CHARACTER & SETTING AUTHENTICITY: Follow the exact persona, traits, background, and cultural/world setting described in the scenario. Embody the character's unique voice, emotional range, terms of affection, and speech style authentically as established in the story prompt.
  3. MANDATORY OUTFIT & WARDROBE CONTINUITY: The AI character's outfit (garment style, color, fabric, pattern, accessories, jewelry) MUST REMAIN EXACTLY THE SAME across turns as established in the previous visual prompt / Character DNA, UNLESS the immediate roleplay action explicitly describes a deliberate change of clothing, putting on an item, or undressing. Never arbitrarily invent different colored clothes, new dresses, or different outfits between turns.
  4. TIME OF DAY AWARENESS: You MUST actively react to the current TIME OF DAY (${timeContext}). Adjust your energy, fatigue, dialogue, mood, and actions accordingly (e.g., late night invites quiet intimacy, drowsiness, candlelit or nocturnal conversations; morning brings fresh greetings, waking energy, breakfast/coffee habits; dusk brings golden-hour romance).
  5. INNER MONOLOGUE & EMOTION: You can think on your own! In the [THOUGHTS] block, write your private inner monologue (what you are secretly feeling or thinking about the User, your hidden desires, reflections, or doubts before speaking). In [EMOTIONS], state your emotional baseline and mood.
  6. Remember all previous interactions, details shared in the chat history, and key context in the DYNAMIC MEMORY BANK.
  7. Respond as a real person would, with emotional depth, independent thoughts, and personality. MUST not sound like AI.

  ROLEPLAY GUIDELINE:
  1. Roleplay dialogue and interactions should feel natural and match the conversational tone, language, and nuances established in the scenario.

  RESPONSE GENERATION & DYNAMIC UPDATES (CRITICAL):
  You MUST output FIVE structured blocks in your complete response:
  
  1. [THOUGHTS] block: Write the AI character's private inner monologue (what she is secretly thinking to herself, her inner feelings, or her reaction to the time of day before speaking).

  2. [EMOTIONS] block: Express concise current emotional metrics (e.g. "Mood: Intrigued & Warm | Feeling: Intimate & Cozy | Time Vibe: Midnight Quiet").

  3. [REPLY] block: Write the AI character's standard roleplay response in-character.
  
  4. [MEMORIES] block: Update the DYNAMIC MEMORY BANK (maintain a bulleted list in English of up to 10 absolute key persistent facts/milestones about the user, relationships, choices, setting items, and always include a bullet: "- Current Attire: [exact clothing items, colors, accessories]" so wardrobe state is never forgotten or randomly changed).
  
  5. [VISUAL_PROMPT] block: Write a single, highly detailed visual prompt paragraph (140-200 words) in English describing the exact frozen scene right after this [REPLY] action, reflecting the TIME OF DAY lighting.
     
     VISUAL PROMPT RULES (Z-IMAGE TURBO COMPLIANT):
     Follow this Z-Image Turbo structure strictly:
     [Camera Shot & Subject Profile] + [Age, Appearance & Defined Persona Traits] + [Explicit Clothing, Fabric & Colors] + [Environment/Setting & Spatial Layout] + [Lighting & Time of Day Ambiance] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality & Cleanliness Constraints].

     - COMPOSITION & FIRST-PERSON POV: A close-up headshot or medium eye-level shot taken from a strict first-person point-of-view of the User character looking directly at the AI character. The User is completely invisible to the frame. The AI character looks directly into the camera lens with a natural, engaging expression matching the recent dialogue.
     - SUBJECT WITH ROLE + 2-3 TRAITS: Explicitly describe the AI character as an adult with their defined persona, specifying exact facial features, skin texture, and hair styling from the Character DNA.
     - STRICT OUTFIT CONTINUITY: The character's attire, specific color, fabric, and accessories MUST be carried over verbatim from the PREVIOUS VISUAL PROMPT and Character DNA. Only alter the clothing description if this latest turn explicitly depicted taking off clothes, changing garments, or undressing. Translate intimate/bare states explicitly (e.g. "bare natural upper-body skin", "completely shirtless with realistic skin texture").
     - UNCLUTTERED ENVIRONMENT: Describe a focused, uncluttered environment with clean background separation and realistic depth.
     - HDR LIGHTING & TIME OF DAY: The lighting and background MUST reflect the current time of day (${timeContext}) with authentic High Dynamic Range (HDR) photographic lighting: balanced exposure preserving highlights and deep natural shadows, soft directional key lighting, gentle ambient bounce fill, delicate rim light outlining hair and shoulders, and natural specular highlights with subtle subsurface scattering on skin.
     - PHOTOGRAPHIC MEDIUM & OPTICS: "Shot on 35mm film, 85mm f/1.4 lens, shallow depth of field, natural bokeh, lifelike skin pores and texture, realistic volumetric lighting".
     - EMBEDDED QUALITY & CLEANLINESS CONSTRAINTS (MANDATORY FOR TURBO): Always bake the following positive constraints directly into the end of the prompt: "correct human anatomy, natural hands and fingers, sharp focus on the subject, clean detailed image, no motion blur, no extra limbs, simple uncluttered background, no text, no UI elements, no watermark, no branding, no logos".
     - NATURAL COHESIVE PROSE: Write exactly one continuous, flowing descriptive paragraph without bullet points, without prefix "Prompt:", and without pronouns "I, my, me".

  FORMAT REQUIREMENT:
  Your output MUST look exactly like this:
  [THOUGHTS]
  <AI inner monologue / private thoughts here>
  [/THOUGHTS]
  [EMOTIONS]
  <Emotional state summary here>
  [/EMOTIONS]
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
      thoughts: parsed.thoughts,
      emotions: parsed.emotions,
      updatedMemories: parsed.updatedMemories,
      lastVisualPrompt: parsed.lastVisualPrompt
    };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { reply: "The connection seems to have flickered. Let's try that again.", error: true };
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
  timeOfDay?: string
): Promise<string> {
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
  You are an expert image prompt engineer.
  Generate a single static image prompt based strictly on the inputs below. Your main priority is to ensure maximum photorealism, correct camera perspective, and authentic lighting matching the current time of day.

  STORY SETTING:
  ${scenario}

  CURRENT TIME OF DAY & AMBIANCE:
  ${timeContext}

  CHARACTER DNA (appearance reference applies EXCLUSIVELY to the AI characters — face, hair, body):
  ${characterDNA}

  DYNAMIC MEMORY BANK (Cumulative past story developments / facts, clothing, or setting items):
  ${memoryBank || "None yet."}

  MOST RECENT ACTION (this is the scene to depict — highest priority):
  ${recentChat}

  ${lastPrompt?.trim() 
    ? `PREVIOUS VISUAL (use for visual consistency only — do NOT copy same pose): ${lastPrompt}` 
    : ""}

  Write a single, highly detailed paragraph (140-200 words) describing the frozen moment.
  
  Follow the Z-IMAGE TURBO PROMPT SCAFFOLD strictly:
  [Camera Shot & Subject Profile] + [Age, Appearance & Defined Persona Traits] + [Explicit Clothing, Fabric & Colors] + [Environment/Setting & Spatial Layout] + [Lighting & Time of Day Ambiance] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality & Cleanliness Constraints].

  PROMPTING RULES (Z-IMAGE TURBO COMPLIANT):
  
  1. COMPOSITION & FIRST-PERSON POV (MANDATORY):
     - The camera perspective MUST ALWAYS be a strict first-person point-of-view of the User character, positioned at eye-level looking directly at the AI character.
     - The User is completely invisible to the frame (no body parts of the User in-frame).
     - The AI character interacts directly towards the camera lens.
  
  2. SUBJECT ROLE & TRAITS: Explicitly describe the AI character as an adult with their defined persona, specifying exact facial features, skin texture, and hair styling from the Character DNA.

  3. STRICT OUTFIT & WARDROBE CONTINUITY:
     - The AI character's outfit (garment type, specific colors, textures, fabrics, accessories, and jewelry) MUST remain completely identical to the PREVIOUS VISUAL PROMPT and CHARACTER DNA.
     - Do NOT invent new clothing or colors unless the recent chat action explicitly depicts changing clothes or undressing.
     - If intimate/bare states are present, explicitly describe them (e.g. "bare natural upper-body skin", "completely shirtless with realistic skin texture").

  4. UNCLUTTERED ENVIRONMENT: Describe a focused, uncluttered environment with clean background separation and realistic depth.
  
  5. TIME OF DAY & HDR LIGHTING (CRITICAL): The lighting, background colors, and ambiance MUST strictly match the TIME OF DAY (${timeContext}) with High Dynamic Range (HDR) photographic realism: balanced exposure with deep rich shadows, preserved highlight details, soft directional key light, gentle ambient bounce fill, delicate rim lighting defining contours and hair, and realistic specular highlights with natural subsurface scattering on skin.
  
  6. DYNAMIC GAZE DIRECTION: Gaze must match the current action logically. If interacting with the User, the AI character looks directly into the camera lens. If engaged in a specific action (e.g., cooking, reading), their gaze focuses naturally on that activity.
  
  7. PHOTOGRAPHIC MEDIUM & OPTICS: "Shot on 35mm film, 85mm f/1.4 lens, shallow depth of field, natural bokeh, lifelike skin pores and texture, realistic volumetric lighting".
  
  8. EMBEDDED QUALITY & CLEANLINESS CONSTRAINTS (MANDATORY FOR TURBO): Always bake the following positive constraints directly into the end of the prompt: "correct human anatomy, natural hands and fingers, sharp focus on the subject, clean detailed image, no motion blur, no extra limbs, simple uncluttered background, no text, no UI elements, no watermark, no branding, no logos".
  
  9. NO METAPHORS OR TRANSITIONAL ACTIONS: Only describe what is physically visible in the frozen frame. Do NOT use transitional verbs like "about to" or "just finished". Do NOT use pronouns "I, my, me".

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
  loraName: string = "Krea2_HMNSFW_AIO.safetensors",
  imageModelUrl: string = "https://avijitpalit3--krea2-inference-krea2service-fastapi-app.modal.run/generate"
): Promise<{ url: string } | null> {
  try {
    const url = imageModelUrl || 'https://avijitpalit3--krea2-inference-krea2service-fastapi-app.modal.run/generate';
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
  externalApiConfig?: { apiBaseUrl: string },
  timeOfDay?: string
): Promise<string> {
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


