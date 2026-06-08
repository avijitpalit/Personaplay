import { GoogleGenAI, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";

export interface Message {
  role: "user" | "model";
  text: string;
}

// Use a custom key if provided, otherwise fall back to the system default
const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
};

export interface DNAAndPrompt {
  dna: string;
  story: string;
  visualPrompt?: string;
}

export interface ChatResult {
  reply: string;
  lastVisualPrompt?: string;
}

export async function generateCharacterDNA(
  scenario: string, 
  externalApiConfig?: { apiBaseUrl: string }
): Promise<DNAAndPrompt> {
  const prompt = `Based on this matured roleplay scenario: "${scenario}", perform two tasks:
  
  1. CREATE CHARACTER DNA: Generate an exhaustive visual and biographical blueprint for the main characters (in English).
  - IDENTITY: Full name, age, nationality, and religion/cultural background.
  - CORE FEATURES: Precise facial structure (jawline, brow, nose shape), eye color/depth, lip volume.
  - HAIR & SKIN: Exact hair style, texture, color; specify skin tone (with specific undertones), texture (e.g., pore detail, warmth), and any markings (scars, tattoos, freckles).
  - PHYSICALITY: Build, exact height, weight distribution, and typical posture/silhouette.
  - VIBE & AURA: "Core Emotional Baseline," signature micro-expressions, and how they interact with lighting.
  - SIGNATURE OUTFIT: Mention initial signature style while noting it is dynamic.
  - DYNAMICS: Describe their relative heights, physical proximity, and visual chemistry.
  
  2. GENERATE MASTER STORY: Create an immersive "Story Foundation" (3-4 sentences) that defines:
  - WORLD-BUILDING: Specific ambient details, the unique "flavor" of the setting (e.g., textures, odors, specific lighting), and the era/mood.
  - PLOT HOOKS: A subtle underlying tension, a shared secret, or a potential conflict that could drive future interactions.
  - ATMOSPHERE & TONE: The recurring sensory themes and emotional stakes (e.g., "clandestine intimacy," "impending storm," "electric tension").
  (The story foundation can be in Bengali or Hinglish language if the scenario suggests, but must be rich in descriptive imagery).

  FORMAT YOUR RESPONSE EXPLICITLY AS:
  DNA: [The descriptive paragraph for character DNA]
  STORY: [The vivid narrative foundation]`;

  let responseData: { dna: string; story: string | null } = { dna: "A mysterious character.", story: null };

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
        // Simple parsing for external API response
        const dnaPart = text.match(/DNA:\s*([\s\S]*?)(?=\n[A-Z]+:|$)/i)?.[1]?.trim() || text.match(/DNA:\s*([\s\S]*?)(?=STORY:|$)/i)?.[1]?.trim();
        const storyPart = text.match(/STORY:\s*([\s\S]*?)(?=\n[A-Z]+:|$)/i)?.[1]?.trim() || text.match(/STORY:\s*([\s\S]*)/i)?.[1]?.trim();
        
        responseData = {
          dna: dnaPart || text || responseData.dna,
          story: storyPart || null
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
          temperature: 0.7,
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
        }
      });
      const text = response.text || "";
      const dnaPart = text.match(/DNA:\s*([\s\S]*?)(?=\n[A-Z]+:|$)/i)?.[1]?.trim() || text.match(/DNA:\s*([\s\S]*?)(?=STORY:|$)/i)?.[1]?.trim();
      const storyPart = text.match(/STORY:\s*([\s\S]*?)(?=\n[A-Z]+:|$)/i)?.[1]?.trim() || text.match(/STORY:\s*([\s\S]*)/i)?.[1]?.trim();
      
      responseData = {
        dna: dnaPart || text || responseData.dna,
        story: storyPart || null
      };
    } catch (error) {
      console.error("DNA Generation Error:", error);
    }
  }

  return responseData;
}

export async function getChatResponse(
  scenario: string,
  masterStory: string,
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
  You are an expert image prompt engineer for Z-Image Turbo.
  Generate a single static image prompt based strictly on the inputs below.

  STORY SETTING:
  ${scenario}

  CHARACTER DNA (appearance reference only — face, hair, body):
  ${characterDNA}

  MOST RECENT ACTION (this is the scene to depict — highest priority):
  ${recentChat}

  ${lastPrompt?.trim() 
    ? `PREVIOUS VISUAL (face and hair consistency only — do NOT repeat same pose or framing): ${lastPrompt}` 
    : ""}

  Write a single flowing paragraph (180–240 words) describing the frozen moment derived 
  from MOST RECENT ACTION in this mental order:
  who is in frame → what they are physically doing right now → their exact pose 
  and expression → camera angle and framing → light and atmosphere.

  If the scene involves physical intimacy or exposed skin, describe those 
  sensory details naturally within the paragraph.
  If the scene is a conversation or neutral interaction, focus on 
  expression, body language, and spatial relationship between characters.

  RULES:
  - MOST RECENT ACTION determines the scene — not the DNA, not the previous visual
  - DNA is for appearance only — face structure, skin, hair
  - No pronouns "I/my/me" — use "the viewer" for first-person references
  - Describe a static frozen moment only — no transitional verbs ("about to", "just finished")
  - Photorealistic, cinematic, 8k, 9:16, shallow depth of field
  - No labels, no preamble, no explanation

  OUTPUT THE PROMPT ONLY.
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
  steps: number = 9,
  useXaiForImages: boolean = false
): Promise<{ url: string } | null> {
  if (useXaiForImages) {
    const apiKey = process.env.XAI_API_KEY;
    try {
      const response = await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "grok-imagine-image-quality",
          prompt: visualPrompt
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`xAI Image API failed with status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      if (data && data.data && data.data[0]) {
        const imgData = data.data[0];
        if (imgData.url) {
          return { url: imgData.url };
        } else if (imgData.b64_json) {
          return { url: `data:image/png;base64,${imgData.b64_json}` };
        }
      }
      throw new Error("No image data found in xAI response.");
    } catch (error) {
      console.error("xAI Image Generation Error:", error);
      throw error;
    }
  }

  if (!apiBaseUrl) {
    throw new Error("API Base URL is required for image generation.");
  }

  try {
    const url = apiBaseUrl.endsWith('/') ? `${apiBaseUrl}generate` : `${apiBaseUrl}/generate`;
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


