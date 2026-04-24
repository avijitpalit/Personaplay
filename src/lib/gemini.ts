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
  
  1. CREATE CHARACTER DNA: Generate highly detailed visual descriptors for the main characters.
  - Precise facial features, hair style/color, build, skin tone, and unique identifiers (scars/tattoos).
  - Signature outfit styles (outfit is dynamic, can be changed if recent chats suggests) and "Core Emotional Baseline".
  
  2. GENERATE MASTER STORY: Create a vivid, descriptive "Story Foundation" (2-3 sentences) that expands on the scenario's atmosphere, recurring themes, and ambient details. This story foundation can be used later for image generation.

  FORMAT YOUR RESPONSE AS FOLLOWS:
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
  } /*else {
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
  }*/

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
  const systemInstruction = `You are an expert roleplayer. 
  STORY FOUNDATION:
  ${masterStory}

  CHARACTER DNA:
  ${dna}

  CORE DIRECTIVES FOR CHARACTER CONSISTENCY:
  1. You are the character(s) described in the scenario.
  2. Maintain a consistent personality throughout the entire conversation.
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

  if (externalApiConfig?.apiBaseUrl) {
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

  /*const ai = getAI();
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
  }*/
}

export async function generateVisualPrompt(
  scenario: string,
  history: Message[],
  characterDNA: string,
  lastPrompt?: string,
  externalApiConfig?: { apiBaseUrl: string },
  masterStory?: string
): Promise<string> {
  const lastExchange = history.slice(-2).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  
  const prompt = `You are a visual director for a hyper-realistic cinematic matured roleplay.
  
  STORY FOUNDATION:
  ${masterStory || scenario}

  CHARACTER DNA:
  ${characterDNA}
  
  LATEST EXCHANGE (PRIORITY 1):
  ${lastExchange}
  
  ${lastPrompt ? `PREVIOUS VISUAL PROMPT (PRIORITY 2): ${lastPrompt}` : ""}

  TASK: Create a single, highly detailed image generation prompt for z-image turbo model for the current moment in the story.
  
  CORE REQUIREMENTS:
  1. FOCUS ON THE LATEST EXCHANGE: The prompt MUST reflect the physical actions, emotional intensity, and specific location described in the "LATEST EXCHANGE" first and foremost. Use the previous visual prompt only as a secondary reference for positional continuity.
  2. REALISM & NO CAMERA AWARENESS: Characters MUST NOT look at the camera. They should be completely engrossed in their actions, looking at each other, or looking at their environment. Use terms like "candid, cinematic perspective," "voyeuristic angle," "unaware of observer," and "natural interaction."
  3. CHARACTER CONSISTENCY: Strictly follow the DNA descriptors for facial features, hair, and build.
  4. ATMOSPHERE: Use the "STORY FOUNDATION" to ground the overall aesthetic and mood.
  5. TECHNICAL STYLE: Photorealistic, 8k, realistic skin textures, cinematic lighting, 9:16 aspect ratio.
  6. MATURITY: Must include relevant mature details like "wardrobe malfunctions" items if the story foundation suggests.
  7. Third Person View: Image prompt can include User character's hands if the latest exchange suggests.

  Output ONLY the prompt text, no explanations.`;

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

  /*const ai = getAI();
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
  }*/
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

export async function getQuickReplies(
  scenario: string,
  history: Message[],
  externalApiConfig?: { apiBaseUrl: string }
): Promise<string[]> {
  const prompt = `You are suggesting context-aware "Quick Reply" options for the HUMAN USER in a mature roleplay.
  
  TASK: Suggest 4 short, immersive phrases that the human user would likely say or do next to the AI character.
  
  The suggestions MUST:
  - Be from the USER's perspective (The human playing the story).
  - Match the current chemistry and mood of the interaction.
  - Include: 1 standard dialogue, 1 action/gesture, and 2 "spicy" or provocative advances.
  - Be concise (3-8 words).
  - Use direct speech or *actions in asterisks*.

  SCENARIO: ${scenario}
  LAST 4 TURNS OF HISTORY:
  ${history.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n')}

  Format your response as a simple JSON array of strings: ["suggestion 1", "suggestion 2", "suggestion 3", "suggestion 4"]
  Return ONLY the JSON array.`;

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
        try {
          const cleaned = text.replace(/```json|```/g, '').trim();
          return JSON.parse(cleaned);
        } catch (e) {
          return ["Tell me more.", "I'm listening.", "What's next?", "Come closer."];
        }
      }
    } catch (e) {
      console.error("External Quick Replies Error:", e);
    }
  }

  const ai = getAI();
  const model = "gemini-2.5-flash";

  try {
    const response = await ai.models.generateContent({
      model,
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

    const text = response.text || "";
    try {
      const cleaned = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      return ["Tell me more.", "I'm listening.", "What's next?", "Come closer."];
    }
  } catch (error) {
    console.error("Quick Replies Error:", error);
    return ["Go on...", "Stay here with me.", "What happens now?", "Touch me."];
  }
}
