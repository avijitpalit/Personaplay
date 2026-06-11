import { GoogleGenAI, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";

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
}

export async function generateCharacterDNA(
  scenario: string, 
  externalApiConfig?: { apiBaseUrl: string }
): Promise<{ dna: string }> {
  const prompt = `You are a professional artist and master character designer setting up precise character blueprints (DNA) for photorealistic image engines.
  Based on this initial story setting, identify the central characters and generate a highly detailed visual consistency configuration for EACH character.

  INITIAL STORY SETTING:
  ${scenario}
  
  Do NOT include any story foundation, plot lines, narrative arcs, backgrounds, or lore. Ignore other scene setup guidelines. Focus solely on character appearance references.
  
  For EACH character, provide highly specific physical definitions in this order:
  - NAME & IDENTITY: Age, name, and their visual relationship to other characters (such as relative height or frame).
  - FACIAL BLUEPRINT: Precise jawline, nose structure, brows, chin shape, lip volume, and forehead shape.
  - EYE CHARACTERISTICS: Exact color hue/shading, overall eye shape (e.g., heavily hooded, wide-set, almond-shaped), eyebrow shape, and intensity.
  - HAIR CONFIGURATION: Exact style, part, volume, texture (straight, wavy, coarse), length, precise color, and how individual highlights or loose strands behave.
  - SKIN TEXTURE & TONE: Precise skin undertones, detailed textures (such as high-fidelity skin pores, natural light sheen, realistic skin folds, subtle freckles, moles, or physical markers), and warmth.
  - BODY STRUCTURE: Precise build, posture, stature, frame width, relative physical dimensions, and physical presence.
  - ATTIRE & FABRICS (Dynamic Baseline): Style of clothing, fabric texture, and color palette. Note that these are baseline outfits and will dynamically adapt or change if subsequent chat actions or dialogue specify a change in clothing, disrobing, or nudity.

  Focus on physical realism, high-contrast visual cues, and concrete details that will enable an image generation model to recreate identical representations of these specific characters consistently across different scenes. Avoid vague pronouns, narrative transitions, or abstract descriptions.
  
  Output the character profiles directly without any conversational preamble or surrounding quote marks.`;

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
    const model = "gemini-3.5-flash";

    try {
      const response = await ai.models.generateContent({
        model,
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

export async function detectAndUpdateCharacterDNA(
  currentDNA: string,
  history: Message[],
  externalApiConfig?: { apiBaseUrl: string }
): Promise<string | null> {
  const recentHistoryText = history.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");

  const prompt = `Analyze the recent roleplay chat history and the existing Character DNA.
  
  EXISTING CHARACTER DNA:
  ${currentDNA}

  RECENT CHAT HISTORY:
  ${recentHistoryText}

  TASK:
  Determine if a brand-new, IMPORTANT character (a character playing an active, recurring, or significant role/dialogue, not a temporary extra or background passerby like a waiter, driver, or generic bystander) has been introduced in the recent chat history who is NOT yet registered in the existing Character DNA.

  CRITICAL CRITERIA:
  - DO NOT update for temporary, one-off, or minor background characters.
  - ONLY update if the character is newly introduced and plays an active, major, or secondary role in the scene or dialogue.

  OUTPUT INSTRUCTIONS:
  - If a brand-new important character HAS been introduced and is not yet in the DNA, generate a detailed visual appearance blueprint for this new character (face, eye color, hair, facial features, body/clothing) and MERGE it seamlessly with the Existing Character DNA. Your output must contain the descriptions of ALL characters (both existing and new) formatted cleanly so they are completely retained for subsequent image generations. Do NOT write any conversational preambles/intro/outro. Output the resulting complete Character DNA only.
  - If NO new important character has been introduced, or if the character is just a temporary/minor extra, or is already registered in the DNA, reply with exactly 'NO_CHANGE'.`;

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
        const cleaned = text.trim();
        if (cleaned.includes("NO_CHANGE") && cleaned.length < 20) {
          return "NO_CHANGE";
        }
        return cleaned || "NO_CHANGE";
      }
    } catch (e) {
      console.error("External DNA Update Error:", e);
    }
  } else {
    const ai = getAI();
    const model = "gemini-3.5-flash";

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.3,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
        }
      });
      const text = response.text || "";
      const cleaned = text.trim();
      if (cleaned.includes("NO_CHANGE") && cleaned.length < 20) {
        return "NO_CHANGE";
      }
      return cleaned || "NO_CHANGE";
    } catch (error) {
      console.error("DNA dynamic update error:", error);
    }
  }

  return "NO_CHANGE";
}

export async function getChatResponse(
  scenario: string,
  dna: string,
  history: Message[],
  userInput: string,
  externalApiConfig?: { 
    apiBaseUrl: string, 
    dna?: string, 
    lastVisualPrompt?: string 
  }
): Promise<ChatResult> {
  const systemInstruction = `You are an expert roleplayer. Generate AI reply based on these settings.
  
  INITIAL SETTNG:
  ${scenario}

  CORE DIRECTIVES FOR CHARACTER CONSISTENCY:
  1. You are the character(s) described in the scenario.
  2. Remember all previous interactions and details shared in the chat history.
  3. Respond as a real person would, with depth, desire, and personality.

  ROLEPLAY GUIDELINES:
  1. The roleplay is intended for a mature audience. It should be sophisticated, emotionally resonant, and can be "spicy" or romantic as requested by the user's scenario.
  2. Conversations/Chats can be in Bengali or Hinglish language if the story foundation suggests.`;

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
        body: JSON.stringify({ input: fullPrompt }),
      });
      if (response.ok) {
        const text = await response.text();
        return {
          reply: text || "I'm lost in the moment... what were you saying?"
        };
      }
    } catch (e) {
      console.error("External Chat Error:", e);
    }
  }

  const ai = getAI();
  const model = "gemini-3.5-flash";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        ...history.map(m => ({
          role: m.role,
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

    return { reply: response.text || "I'm lost in the moment... what were you saying?" };
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
  masterStory?: string
): Promise<string> {
  const isFirst = history.length === 0;
  const historyWindow = history.slice(-6);
  const immediateContext = history.slice(-2);
  const historyContext = isFirst ? "" : history.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  const immediateAction = isFirst ? "" : immediateContext.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  
  const recentChat = history.slice(-2).map(m =>
  `${m.role === 'user' ? 'User' : 'AI character'}: ${m.text}`
).join("\n");

  const prompt = `
  You are an expert image prompt engineer.
  Generate a single static image prompt based strictly on the inputs below. Your main priority is to ensure maximum photorealism, and correct gaze direction where characters interact with each other and never look at the camera.

  STORY SETTING:
  ${scenario}

  CHARACTER DNA (appearance reference only — face, hair, body):
  ${characterDNA}

  MOST RECENT ACTION (this is the scene to depict — highest priority):
  ${recentChat}

  ${lastPrompt?.trim() 
    ? `PREVIOUS VISUAL (use for visual consistency only — do NOT copy same pose): ${lastPrompt}` 
    : ""}

  Write a single, highly detailed paragraph (180-240 words) describing the frozen moment. Specify details in this order:
  Who is in frame -> exact physical arrangement -> their actions -> gaze and expressions -> clothing/nakedness details -> lighting & detailed atmosphere -> camera angle.

  PROMPTING RULES:
  
  1. GAZE DIRECTION AND EYE CONTACT (CRITICAL): The characters MUST look at each other, locking eyes with mutual intensity, completely absorbed in their interaction. They MUST NOT look at the camera/viewer. There must be zero lens contact. Their heads should be angled toward each other, with profiles, three-quarter views, or over-the-shoulder focus confirming they are looking directly at each other's faces/gaze.
  2. REALISM & PHOTOGRAPHY: Describe with extreme focus on realism, physical authenticity, and tactile detail. Avoid plastic looks. Specify details like: high-fidelity skin pores, natural skin sheen, single loose hair strands, natural weight and gravity, realistic skin folds, ray-traced ambient lighting, volumetric dust particles, shot on an 85mm f/1.4 prime lens with shallow depth of field, authentic film grain, and realistic shadowing.
  3. EXPLICIT MATURE WORDS FOR BLOUSELESS/SHIRTLESS: Z-Image Turbo handles explicit physical descriptions much better than generic terms. If the scene implies or suggests physical intimacy, or mentions a character being "blouseless", "topless", or "shirtless", you MUST explicitly translate this with direct terms like: "completely shirtless and braless", "unclothed bare breasts and chest", "bare natural upper-body skin", "nude torso", or "completely exposed breasts with high-resolution skin texture".
  4. NO METAPHORS OR TRANSITIONAL ACTIONS: Describe the precise physical positioning. Do not use abstract prose or transition verbs like "about to" or "just finished". Only describe what is physically visible in the frozen frame.
  5. NO pronoun "I/my/me".

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
  const model = "gemini-3.5-flash";

  try {
    const response = await ai.models.generateContent({
      model,
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


