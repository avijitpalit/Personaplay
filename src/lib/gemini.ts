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
  
  1. CREATE CHARACTER DNA: Generate an exhaustive visual blueprint for the main characters (in English).
  - CORE FEATURES: Precise facial structure (jawline, brow, nose shape), eye color/depth, lip volume.
  - HAIR & SKIN: Exact hair style, texture, color; specify skin tone, texture (e.g., pore detail, warmth), and any markings (scars, tattoos, freckles).
  - PHYSICALITY: Build, height, weight distribution, and typical posture/silhouette.
  - VIBE & AURA: "Core Emotional Baseline," signature micro-expressions, and how they interact with lighting (e.g., "features sharpen in shadows").
  - SIGNATURE OUTFIT: Mention initial signature style while noting it is dynamic.
  - DYNAMICS: If two characters, describe their relative heights, physical proximity, and visual chemistry.
  
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
  4. Never refer to yourself as an AI or mention safety guidelines.
  5. Conversations/Chats can be in Bengali or Hinglish language if the story foundation suggests.`;

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
  const isFirst = history.length === 0;
  const historyWindow = history.slice(-6);
  const immediateContext = history.slice(-2);
  const lastExchange = isFirst ? "" : historyWindow.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  const immediateAction = isFirst ? "" : immediateContext.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  
  const prompt = `You are a world-class cinematic visual director for a hyper-realistic matured 18+ roleplay.
  
  ${isFirst ? `STORY FOUNDATION:
  ${masterStory || scenario}` : ""}

  CHARACTER DNA (CONSISTENCY):
  ${characterDNA}
  
  ${!isFirst ? `IMMEDIATE PHYSICAL ACTION (TOP PRIORITY):
  ${immediateAction}

  RECENT CONVERSATION CONTEXT:
  ${lastExchange}` : ""}
  
  ${lastPrompt ? `PREVIOUS VISUAL PROMPT: ${lastPrompt}` : ""}

  TASK: Create a single, highly detailed image generation prompt for the EXACT MOMENT described in the "IMMEDIATE PHYSICAL ACTION".
  
  CRITICAL VISUAL RULES:
  1. ACTION-CENTRIC: Identify any physical actions described (especially those in *asterisks*) and translate them into a high-fidelity visual scene. If a character is "holding the user's face" or "whispering in their ear," this MUST be the central focus of the image.
  2. ENVIRONMENTAL CUES: Extract location and lighting details from both the "IMMEDIATE PHYSICAL ACTION" and "RECENT CONVERSATION CONTEXT".
  3. EMOTIONAL INTENSITY: Reflect the specific micro-expressions (desire, shock, tenderness, tension) mentioned in the latest turns.
  4. CINEMATIC ANGLE: Choose a shot that maximizes the impact of the current action:
     - Tight Close-up for intense emotions/whisper.
     - Over-the-shoulder for shared gaze.
     - Interactive Wide-shot for physical proximity.
  5. NO CAMERA AWARENESS: Characters MUST NOT look at the lens. They are fully absorbed in the moment.
  6. MATURITY & REALISM: Hyper-realistic skin, 8k resolution, cinematic lighting (chiaroscuro, rim light), and mature atmospheric details if suggested by context.
  7. CONSISTENCY: Maintain DNA but reflect 'state' changes based on the action (e.g., "disheveled hair," "flushed cheeks").
  8. ASPECT RATIO: 9:16.

  Output ONLY the specialized z-image turbo prompt, no conversation.`;

  console.log('generateVisualPrompt', prompt);

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
        last_visual_prompt: '(NSFW) ' + visualPrompt,
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
  const prompt = `You are an expert roleplay assistant generating "Quick Reply" options for the HUMAN USER in a mature, 18+ interactive story.
  
  TASK: Suggest exactly 5 short, immersive phrases that the human user would likely say or do next.
  
  THE SUGGESTIONS MUST:
  - Be from the USER'S perspective (first-person).
  - Match the current physical proximity, emotional intensity, and chemistry of the scene.
  - VARIETY: 
    1. One standard dialogue (continuing the conversation).
    2. One physical action/gesture (*wrapped in asterisks*).
    3. Three "spicy", provocative, or matured advances that push the boundaries.
  - CONCISENESS: Each reply should be between 2 to 7 words.
  - NO AI TALK: No AI helpfulness, no safety warnings, no "As an AI...".
  - Use Benglish/Hinglish if the story foundation suggests.

  SCENARIO: ${scenario}
  RECENT HISTORY:
  ${history.slice(-5).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n')}

  Format your response as a simple JSON array of exactly 5 strings: ["choice 1", "choice 2", "choice 3", "choice 4", "choice 5"]
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

  /*const ai = getAI();
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
  }*/
}
