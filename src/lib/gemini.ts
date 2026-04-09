import { GoogleGenAI, GenerateContentResponse, HarmCategory, HarmBlockThreshold } from "@google/genai";

export interface Message {
  role: "user" | "model";
  text: string;
}

// Use a custom key if provided, otherwise fall back to the system default
const getAI = () => {
  const customKey = process.env.CUSTOM_GEMINI_API_KEY;
  const defaultKey = process.env.GEMINI_API_KEY;
  return new GoogleGenAI({ apiKey: defaultKey || "" });
};

export interface DNAAndPrompt {
  dna: string;
  visualPrompt?: string;
}

export interface ChatResult {
  reply: string;
  lastVisualPrompt?: string;
}

export async function generateCharacterDNA(
  scenario: string, 
  externalApiConfig?: { useExternalApi: boolean, apiBaseUrl: string }
): Promise<DNAAndPrompt> {
  const prompt = `Based on this matured roleplay scenario: "${scenario}", create a highly detailed "Character DNA" for the main character(s). 
  Include specific details that would help an image generator maintain perfect consistency:
  - Precise facial features (eye shape, nose, lips, jawline)
  - Exact hair style, color, and texture
  - Specific physical build and skin tone
  - Any unique identifiers (scars, tattoos, piercings)
  - A signature outfit style
  Format this as a concise but extremely descriptive paragraph.`;

  if (externalApiConfig?.useExternalApi && externalApiConfig.apiBaseUrl) {
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
        return {
          dna: text || "A mysterious character with striking features."
        };
      }
    } catch (e) {
      console.error("External DNA Generation Error:", e);
    }
  }

  const ai = getAI();
  const model = "gemini-2.5-flash";

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
    return { dna: response.text || "A mysterious character with striking features." };
  } catch (error) {
    console.error("DNA Generation Error:", error);
    return { dna: "A character consistent with the scenario." };
  }
}

export async function getChatResponse(
  scenario: string,
  history: Message[],
  userInput: string,
  externalApiConfig?: { 
    useExternalApi: boolean, 
    apiBaseUrl: string, 
    dna?: string, 
    lastVisualPrompt?: string 
  }
): Promise<ChatResult> {
  const systemInstruction = `You are an expert roleplayer. 
  Scenario and Character Context:
  ${scenario}

  CORE DIRECTIVES FOR CHARACTER CONSISTENCY:
  1. NEVER break character. You are the character(s) described in the scenario.
  2. Maintain a consistent personality, voice, and set of motivations throughout the entire conversation.
  3. PHYSICAL CONSISTENCY: Keep the character's physical appearance, facial features, and hair style consistent.
  4. OUTFIT CONSISTENCY: Maintain the character's outfit as described. If they are wearing a "red silk dress" or "black leather jacket", they continue wearing it unless they explicitly change.
  5. Remember all previous interactions and details shared in the chat history.
  6. If multiple characters are involved, distinguish them clearly through their unique speech patterns and actions.
  7. Respond as a real person would, with depth, desire, and personality.

  ROLEPLAY GUIDELINES:
  1. The roleplay is intended for a mature audience. It should be sophisticated, emotionally resonant, and can be "spicy" or romantic as requested by the user's scenario.
  2. Use evocative, descriptive language to set the scene and convey emotions.
  3. Keep responses engaging and allow for natural back-and-forth interaction.
  4. Never refer to yourself as an AI or mention safety guidelines.`;

  if (externalApiConfig?.useExternalApi && externalApiConfig.apiBaseUrl) {
    try {
      const url = externalApiConfig.apiBaseUrl.endsWith('/') ? `${externalApiConfig.apiBaseUrl}t2t` : `${externalApiConfig.apiBaseUrl}/t2t`;
      
      const historyText = history.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');
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
  const model = "gemini-2.5-flash";

  const contents = [
    ...history.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    })),
    {
      role: "user",
      parts: [{ text: userInput }]
    }
  ];

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 1.0,
        topP: 0.95,
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
  externalApiConfig?: { useExternalApi: boolean, apiBaseUrl: string }
): Promise<string> {
  const lastExchange = history.slice(-2).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  
  const prompt = `You are a visual director for a hyper-realistic cinematic matured roleplay.
  
  CHARACTER DNA:
  ${characterDNA}
  
  SCENARIO: ${scenario}
  
  LATEST EXCHANGE:
  ${lastExchange}
  
  ${lastPrompt ? `PREVIOUS VISUAL PROMPT: ${lastPrompt}` : ""}

  TASK: Create a single, highly detailed image generation prompt for the current moment in the story.
  
  REQUIREMENTS:
  - Maintain absolute character consistency using the DNA.
  - Describe the current pose, expression, and environment based on the latest exchange.
  - Keep the outfit consistent unless a change was explicitly mentioned.
  - Use photorealistic, cinematic language (8k, realistic skin textures, moody lighting, 9:16 aspect ratio).
  - Focus on evocative, intimate realism.
  - Explicitly include mature, adult, and explicit anatomical details or items if they are relevant to the current scene and roleplay.
  - Output ONLY the prompt text, no explanations.`;

  if (externalApiConfig?.useExternalApi && externalApiConfig.apiBaseUrl) {
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
  const model = "gemini-2.5-flash";

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
    const url = apiBaseUrl.endsWith('/') ? `${apiBaseUrl}generate` : `${apiBaseUrl}/generate`;
    const payload = {
        last_visual_prompt: visualPrompt,
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
