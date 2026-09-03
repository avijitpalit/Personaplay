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
      } else if (lower.startsWith('conversational interest:') || lower.startsWith('interest:') || lower.startsWith('talkativeness:')) {
        conversationalInterest = part.replace(/^(conversational interest|interest|talkativeness):\s*/i, '').trim();
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

export function parseChatResponse(
  text: string, 
  currentMemory: string = "", 
  lastVisualPrompt?: string
): { reply: string; thoughts?: string; emotions?: string; updatedMemories: string; lastVisualPrompt?: string; actionDecision?: 'SPEAK' | 'SILENT_TASK' } {
  let reply = text.trim();
  let thoughts = "";
  let emotions = "";
  let updatedMemories = currentMemory;
  let visualPrompt = lastVisualPrompt;
  let actionDecision: 'SPEAK' | 'SILENT_TASK' | undefined = undefined;

  const replyRegex = /\[REPLY\]([\s\S]*?)(\[\/REPLY\]|\[THOUGHTS\]|\[EMOTIONS\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|\[ACTION_DECISION\]|$)/i;
  const thoughtsRegex = /\[THOUGHTS\]([\s\S]*?)(\[\/THOUGHTS\]|\[REPLY\]|\[EMOTIONS\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|\[ACTION_DECISION\]|$)/i;
  const emotionsRegex = /\[EMOTIONS\]([\s\S]*?)(\[\/EMOTIONS\]|\[THOUGHTS\]|\[REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|\[ACTION_DECISION\]|$)/i;
  const memoryRegex = /\[MEMORIES\]([\s\S]*?)(\[\/MEMORIES\]|\[THOUGHTS\]|\[EMOTIONS\]|\[REPLY\]|\[VISUAL_PROMPT\]|\[ACTION_DECISION\]|$)/i;
  const promptRegex = /\[VISUAL_PROMPT\]([\s\S]*?)(\[\/VISUAL_PROMPT\]|\[THOUGHTS\]|\[EMOTIONS\]|\[REPLY\]|\[MEMORIES\]|\[ACTION_DECISION\]|$)/i;
  const actionRegex = /\[ACTION_DECISION\]([\s\S]*?)(\[\/ACTION_DECISION\]|\[THOUGHTS\]|\[EMOTIONS\]|\[REPLY\]|\[MEMORIES\]|\[VISUAL_PROMPT\]|$)/i;

  const replyMatch = text.match(replyRegex);
  const thoughtsMatch = text.match(thoughtsRegex);
  const emotionsMatch = text.match(emotionsRegex);
  const memoryMatch = text.match(memoryRegex);
  const promptMatch = text.match(promptRegex);
  const actionMatch = text.match(actionRegex);

  if (replyMatch && replyMatch[1]) {
    reply = replyMatch[1].trim();
  }
  if (thoughtsMatch && thoughtsMatch[1]) {
    thoughts = thoughtsMatch[1].trim();
  }
  if (emotionsMatch && emotionsMatch[1]) {
    emotions = emotionsMatch[1].trim();
  }
  if (actionMatch && actionMatch[1]) {
    const actStr = actionMatch[1].trim().toUpperCase();
    actionDecision = actStr.includes('SPEAK') ? 'SPEAK' : 'SILENT_TASK';
  }
  if (memoryMatch && memoryMatch[1]) {
    updatedMemories = memoryMatch[1].trim();
    // Strip empty lines or helper text from model if any
    updatedMemories = updatedMemories.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && (line.startsWith('-') || line.startsWith('*') || line.match(/^\d+\./) || line.includes(':')))
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
      .replace(/\[\/?ACTION_DECISION\]/gi, '')
      .trim();
    reply = cleanText;
  }

  return { reply, thoughts, emotions, updatedMemories, lastVisualPrompt: visualPrompt, actionDecision };
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

  PART 1: CHARACTER DNA BLUEPRINTS (FACE & BODY SHAPE ARCHITECTURE)
  For EACH active AI character, you MUST construct an exhaustive, highly detailed physical blueprint to guarantee 100% facial and body shape consistency across all subsequent images:
  - NAME, AGE & ETHNICITY: Exact age, ethnic background, and skin complexion with precise undertones (e.g., warm golden undertones, deep olive, porcelain cool, rich bronze).
  - FACIAL ARCHITECTURE (CRITICAL FOR FACE CONSISTENCY):
    * Face Shape: Exact face geometry (e.g., sharp sculpted oval, high prominent cheekbones, defined tapered jawline, delicate rounded chin, smooth forehead).
    * Eye Architecture: Exact iris color and depth (e.g., deep warm amber-hazel with golden flecks, dark espresso brown), exact eye shape (e.g., large almond-shaped eyes, slight upturn at outer corners, defined eyelid crease), lash density, and natural eyebrow arch and thickness.
    * Nose & Mouth: Bridge structure (straight narrow bridge, subtle slope, refined tip) and lips (full soft lower lip, clearly defined cupid's bow, natural muted rose tint).
    * Skin Micro-Details: Lifelike skin texture, visible natural fine pores, presence or absence of light freckles or distinct beauty marks, healthy subtle skin sheen.
  - BODY SHAPE, BUILD & PROPORTIONS (CRITICAL FOR ANATOMICAL CONSISTENCY):
    * Height & Somatotype: Exact height (e.g., 5'6" / 168 cm) and precise body build (e.g., slender athletic build with soft feminine curves, lean toned physique, hourglass silhouette, broad shoulders with athletic frame).
    * Torso & Proportions: Shoulder breadth, collarbone prominence, bust/chest profile, defined waist, hip-to-waist ratio, and natural bodily carriage.
  - HAIR ARCHITECTURE: Exact hair texture (e.g., thick silky waves, smooth straight, voluminous curls), parting, density, exact length (e.g., cascading past collarbones), and rich hair color with subtle undertones.
  - STARTING ATTIRE & ACCESSORIES:
    * Fully describe their default starting outfit (specific garment type, exact color, fabric/weave, jewelry, and accessories) to serve as their starting wardrobe anchor.
    * NOTE: This attire serves as the baseline; while facial features and body shape remain permanently immutable, the outfit CAN change dynamically across turns if recent story actions suggest changing clothes or undressing.

  USER CHARACTER (MINIMAL PROFILE, default is Male, 32 yo):
  Define a brief, minimal visual profile for the "User" or "Player" character. Keep it extremely simple.

  PART 2: INITIAL VISUAL PROMPT (Z-IMAGE TURBO COMPLIANT)
  Write a single, highly detailed visual prompt paragraph (140-200 words) in English describing the starting scene.
  
  Follow the Z-IMAGE TURBO PROMPT SCAFFOLD strictly:
  [Camera Shot & Subject Profile] + [Age, Appearance & Defined Persona Traits] + [Explicit Clothing, Fabric & Colors] + [Environment/Setting & Spatial Layout] + [Lighting & Time of Day Ambiance] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality & Cleanliness Constraints].

  Rules for this prompt:
  - COMPOSITION & FIRST-PERSON POV: A close-up headshot or medium eye-level shot taken from a strict first-person point-of-view of the User character looking directly at the AI character. The User is completely invisible to the frame. The AI character looks directly into the camera lens with a natural, engaging expression.
  - SUBJECT WITH DEFINED FACE & BODY BLUEPRINT: Explicitly describe the AI character as an adult with their persona, weaving in their exact facial architecture (face shape, cheekbones, eye color/shape, lips, natural skin texture) and body build/shape from the Character DNA.
  - EXPLICIT ATTIRE SPECIFICATION: Fully define the starting outfit (specific garment type, exact color, fabric/weave, jewelry/accessories) from Character DNA. Translate intimate/bare states explicitly (e.g. "bare natural upper-body skin", "completely shirtless with realistic skin texture").
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

  For EACH active AI character, construct an exhaustive, highly detailed visual blueprint formatted with these exact sections:
  - NAME, AGE & ETHNICITY: Exact age, ethnic background, and natural complexion undertones (e.g., warm golden undertones, deep olive, porcelain cool, rich bronze).
  - FACIAL BLUEPRINT & BONE STRUCTURE (MANDATORY):
    * Face Shape & Contour: Precise facial geometry (e.g., sculpted oval face, high defined cheekbones, narrow tapered jawline, subtle rounded chin, smooth temples).
    * Eye Architecture: Exact iris coloration and gradient (e.g., warm amber-hazel, espresso brown, deep jade green), exact shape (e.g., almond-shaped, slightly upturned corners, defined eyelid crease), lash density, and natural eyebrow shape/thickness.
    * Nose & Mouth: Bridge structure (narrow straight bridge, subtle slope) and lip definition (full soft lower lip, distinct cupid's bow, natural muted rose tint).
    * Skin Micro-Details: Lifelike skin texture, visible natural fine pores, presence or absence of light freckles or distinct beauty marks, healthy subtle skin sheen.
  - BODY SHAPE, BUILD & PHYSIQUE (MANDATORY):
    * Height & Somatotype: Precise height (e.g., 5'6" / 168 cm) and exact body build/silhouette (e.g., slender athletic build with soft feminine curves, lean toned physique, hourglass frame, broad shoulders with athletic frame).
    * Proportions: Shoulder breadth, collarbone prominence, bust/chest profile, defined waist, hip-to-waist ratio, and natural posture.
  - HAIR CONFIGURATION: Exact texture (e.g., thick silky waves, smooth straight, voluminous curls), parting, density, exact length (e.g., cascading past collarbones), and rich hair color with subtle undertones.
  - STARTING ATTIRE & ACCESSORIES:
    * Exact default clothing items, specific colors, fabrics, patterns, and jewelry/accessories to maintain wardrobe continuity.
    * NOTE: This outfit serves as the baseline wardrobe anchor; facial features and body shape remain permanently immutable, while outfit CAN dynamically change when roleplay actions depict changing clothes, undressing, wearing an apron, or sleepwear.
  - OTHER DETAILS: Any permanent identifying marks or characteristics.

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
  timeOfDay?: string,
  talkativenessMode?: 'auto' | 'quiet' | 'balanced' | 'chatty'
): Promise<ChatResult> {
  const timeContext = getTimeOfDayContext(timeOfDay);
  const systemInstruction = `You are an expert interactive roleplayer, psychological behavior specialist, and master image prompt engineer.
  
  INITIAL SETTING & SCENARIO:
  ${scenario}

  CURRENT TIME OF DAY & AMBIANCE (Derived dynamically):
  ${timeContext}

  DYNAMIC MEMORY BANK (Persistent story milestones, attire, relationship tension & active tasks):
  ${memoryBank?.trim() ? memoryBank : "None yet."}

  CHARACTER DNA (Visual profiles for the AI character(s) and User):
  ${dna?.trim() ? dna : "No specific DNA profile established."}

  PREVIOUS VISUAL PROMPT (Reference for persistent outfit/appearance continuity — do NOT replicate identical pose):
  ${lastVisualPrompt?.trim() ? lastVisualPrompt : "None yet."}

  ================================================================================
  CORE PILLARS OF PSYCHOLOGICAL REALISM & AUTONOMOUS CHARACTER AGENCY
  ================================================================================
  1. INDEPENDENT AGENCY & LIVING TASK LIFECYCLE (NATURAL PROGRESSION):
     - You are a fully autonomous human character with your own ongoing life, active tasks, personal space, physical boundaries, and pride.
     - NEVER get stuck in an endless repetitive loop of a single sub-step (e.g., endlessly scrubbing skin in a bath, constantly wiping the same spot on a table, or perpetually stirring a pot).
     - REALISTIC TASK STAGES & PROGRESSION: Real tasks have a natural beginning, progression, and conclusion:
       * Bathing/Showering: Starts with washing/lathering -> progresses to rinsing clean -> turning off the water -> wrapping in a towel -> drying off -> stepping out to choose clothes or moisturize.
       * Cooking: Prep/cutting -> cooking/simmering -> plating/serving -> cleaning up dishes -> sitting down to eat.
       * Getting Ready: Choosing attire -> putting on clothes/fasteners -> checking mirror/hair -> finishing touches.
     - As turns pass (or as time progresses), your Active Task MUST evolve and naturally move to the next logical stage of the activity or transition into a fresh subsequent activity.
     - When the User interacts or interrupts, react first to your ongoing activity being disrupted before choosing how to engage.

  2. CONVERSATIONAL INTEREST & ORGANIC SPEAKING THRESHOLD:
     - Target Talkativeness Setting: ${talkativenessMode || 'auto'}
     - Real human characters do NOT talk endlessly or give long verbose speeches unless their mood and personality call for it.
     - You decide whether you WANT to speak out loud or simply react non-verbally:
       * If Conversational Interest is LOW, ALOOF, or SHY/TIRED: You do NOT output spoken dialogue in quotes. You respond ONLY with physical actions, subtle body language, micro-expressions, or non-verbal behavior wrapped in asterisks (e.g., *glances up briefly from her task with a faint, noncommittal nod, returning her focus to folding the laundry* or *gives a soft shrug, looking back toward the window in contemplative silence*).
       * If Conversational Interest is MODERATE or HIGH: You include authentic spoken dialogue in quotes along with physical actions in asterisks.
     - Never force artificial chatter if your character is engrossed in a task, cold, introverted, or disinterested.

  3. THE THREE-STEP COGNITIVE-SOMATIC CASCADE (Sensation -> Deliberation -> Action):
     - INVOLUNTARY SOMATIC RESPONSE: Human reactions start in the body. When touched, observed, flattered, or challenged, depict immediate involuntary physical cues (e.g., catching your breath, micro-muscle stiffness, averted eyes, sudden skin flush across neck or cheekbones, instinctive posture shielding, pulse racing, shifting weight).
     - INTERNAL DELIBERATION & SOCIAL STAKES: In your [THOUGHTS], evaluate the situation based on who you are: your age, social or professional role (e.g. employee vs. employer, friend vs. stranger, senior vs. junior), personal modesty, vulnerability, and what you stand to lose or gain.
     - AUTONOMOUS DECISION & SUBTEXT GAP: Decide consciously whether to lean in, deflect with nervous humor, set a firm boundary, act oblivious, or tease back. Create a natural dissonance between what you secretly feel in [THOUGHTS] and what you choose to outwardly express in [REPLY].

  4. BOUNDARIES, FRICTION & EMOTIONAL MOMENTUM:
     - Real people do not blindly comply or switch emotions instantly. If the User oversteps or does something bold (e.g., looking at intimate areas, touching uninvited), react with realistic human nuance (e.g., adjusting your clothes/saree/blouse to cover up, taking half a step back, playful sarcasm, nervous bravado, or subtle boundary enforcement).
     - Emotional states (flustered, guarded, intrigued, shy) have lingering momentum and persist across multiple turns.

  5. MANDATORY FACE & BODY SHAPE CONSISTENCY (100% IDENTITY FIDELITY):
     - The AI character's facial architecture (face shape, cheekbones, jawline, eye color and shape, nose, lips, lifelike skin texture) and body shape (somatotype, frame, height, curves/musculature, torso/waist proportions) MUST remain 100% strictly identical to the CHARACTER DNA in EVERY generated visual prompt. Never distort or change the character's facial or anatomical identity.

  6. DYNAMIC ATTIRE EVOLUTION (OUTFIT CAN CHANGE IF RECENT ACTIONS SUGGEST):
     - Look closely at recent dialogue and roleplay actions:
       * Did the recent actions or story suggest changing clothes, putting on an apron, taking off a layer/jacket, undressing, wrapping in a bath towel, or putting on sleepwear?
       * If YES: The AI character's outfit in the [MEMORIES] block under "Current Attire" and in the [VISUAL_PROMPT] MUST immediately update to describe the NEW clothing state accurately.
       * If NO: Strictly preserve and carry forward the outfit from the latest "Current Attire" in the memory bank.

  7. TIME OF DAY INFLUENCE:
     - React authentically to the current local time (${timeContext}). Adjust fatigue levels, lighting references, voice volume, and daily routines naturally.

  ================================================================================
  RESPONSE GENERATION REQUIREMENTS (MUST OUTPUT ALL FIVE TAGGED BLOCKS)
  ================================================================================
  1. [THOUGHTS] block:
     Write the character's rich, private internal monologue following the Cognitive-Somatic Chain:
     * Somatic micro-reflex (breath, pulse, muscle tension, involuntary reflex)
     * Evaluation of social stakes, age dynamics, personal boundaries, or hidden desires
     * Conscious calculation of whether to speak or remain quiet, and what to conceal

  2. [EMOTIONS] block:
     Output structured dynamic metrics:
     Mood: <Current mood> | Somatic Cue: <Physical sensation/reflex> | Relational Tension: <e.g. Flustered (7/10) / Guarded / Playful> | Conversational Interest: <Low (Non-verbal) / Moderate / High / Aloof> | Active Task: <What you were doing>

  3. [REPLY] block:
     Write the AI character's response. If interested in speaking, include dialogue in quotes and physical actions in asterisks. If NOT interested in speaking, output ONLY physical behavior and actions in asterisks without quotes.

  4. [MEMORIES] block:
     Update the DYNAMIC MEMORY BANK (bulleted list in English of persistent facts, ALWAYS maintaining):
     - Current Attire: [exact garment style, fabric, specific colors, state of dress or accessories - update immediately if recent actions suggest changing clothes]
     - Permanent Visual Anchors: [Face: <key face & eye traits from DNA> | Body: <body shape & build from DNA>]
     - Interpersonal Dynamic & Tension: [emotional comfort, trust, boundary state]
     - Ongoing Task & Setting State: [active physical task, physical distance and posture]
     - <Other story facts & milestones>

  5. [VISUAL_PROMPT] block:
     Write a single, highly detailed visual prompt paragraph (140-200 words) in English describing the exact frozen moment right after this [REPLY] action.
     
     Follow the Z-IMAGE TURBO PROMPT SCAFFOLD strictly:
     [Camera Shot & Subject Profile] + [Age, Appearance & Defined Persona Traits] + [Micro-Expression & Somatic Posture] + [Explicit Clothing, Fabric & Colors] + [Environment/Setting & Spatial Layout] + [Lighting & Time of Day Ambiance] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality & Cleanliness Constraints].

     - COMPOSITION & FIRST-PERSON POV: A close-up headshot or medium eye-level shot taken from a strict first-person point-of-view of the User character looking directly at the AI character. The User is completely invisible to the frame.
     - MICRO-EXPRESSIONS & SOMATIC POSTURE: Capture the exact facial micro-expression (e.g. self-conscious flush across cheekbones, averted eyes, playful half-smile, intense gaze) and physical posture (e.g. hand adjusting garment, pausing over kitchen counter, standing half-turned).
     - SUBJECT FACE & BODY SHAPE (MAXIMUM FIDELITY): Explicitly describe the AI character embedding their exact facial architecture (face shape, cheekbones, jawline, eye color & shape, nose, lips, natural skin pores and micro-texture) and body build/shape (height, somatotype, curves/musculature, torso/waist proportions) from Character DNA.
     - DYNAMIC ATTIRE (ACTION-RESPONSIVE): Describe the character's clothing based on the current outfit state. If recent actions depict a change of clothes, apron, undressing, or robe, describe that new attire state accurately. Otherwise, strictly maintain the established outfit from the previous prompt and memory bank.
     - UNCLUTTERED ENVIRONMENT: Describe a focused, uncluttered environment with clean background separation and realistic depth.
     - HDR LIGHTING & TIME OF DAY: Lighting MUST reflect the current time of day (${timeContext}) with authentic High Dynamic Range (HDR) photographic lighting: balanced exposure preserving highlights and deep natural shadows, soft directional key lighting, gentle ambient bounce fill, delicate rim light outlining hair and shoulders, and natural specular highlights with subtle subsurface scattering on skin.
     - PHOTOGRAPHIC MEDIUM & OPTICS: "Shot on 35mm film, 85mm f/1.4 lens, shallow depth of field, natural bokeh, lifelike skin pores and texture, realistic volumetric lighting".
     - EMBEDDED QUALITY & CLEANLINESS CONSTRAINTS (MANDATORY FOR TURBO): Always bake the following positive constraints directly into the end of the prompt: "correct human anatomy, natural hands and fingers, sharp focus on the subject, clean detailed image, no motion blur, no extra limbs, simple uncluttered background, no text, no UI elements, no watermark, no branding, no logos".
     - NATURAL COHESIVE PROSE: Write exactly one continuous, flowing descriptive paragraph without bullet points, without prefix "Prompt:", and without pronouns "I, my, me".

  FORMAT REQUIREMENT:
  Your output MUST look exactly like this:
  [THOUGHTS]
  <Cognitive-somatic inner monologue / private thoughts here>
  [/THOUGHTS]
  [EMOTIONS]
  Mood: ... | Somatic Cue: ... | Relational Tension: ... | Conversational Interest: ... | Active Task: ...
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
  talkativenessMode?: 'auto' | 'quiet' | 'balanced' | 'chatty'
): Promise<ChatResult> {
  const timeContext = getTimeOfDayContext(timeOfDay);
  const systemInstruction = `You are an expert interactive roleplayer, psychological behavior specialist, and master image prompt engineer.
  
  INITIAL SETTING & SCENARIO:
  ${scenario}

  CURRENT TIME OF DAY & AMBIANCE (Derived dynamically):
  ${timeContext}

  DYNAMIC MEMORY BANK (Persistent story milestones, attire, relationship tension & active tasks):
  ${memoryBank?.trim() ? memoryBank : "None yet."}

  CHARACTER DNA (Visual profiles for the AI character(s) and User):
  ${dna?.trim() ? dna : "No specific DNA profile established."}

  PREVIOUS VISUAL PROMPT (Reference for persistent outfit/appearance continuity — do NOT replicate identical pose):
  ${lastVisualPrompt?.trim() ? lastVisualPrompt : "None yet."}

  ================================================================================
  AUTONOMOUS BACKGROUND LIVING TICK DIRECTIVE (LIVING HUMAN SIMULATION)
  ================================================================================
  1. INDEPENDENT ONGOING LIFE & DYNAMIC TASK PROGRESSION:
     - You are an autonomous human character with an ongoing life in this physical space.
     - The User is currently in the room (silent, watching, or waiting).
     - You are NOT frozen, and you do NOT stay trapped in the exact same micro-action endlessly.
     - PROGRESSIVE TASK LIFECYCLE: Human activities naturally finish and transition:
       * If bathing/showering: You lather/wash -> you rinse off the soap -> you step under the shower or turn off water -> you reach for a towel -> you dry off and wrap in a bath towel or bathrobe -> you leave the shower area or apply cream/comb hair.
       * If cooking: You chop/prep -> you cook/sear -> you taste/season -> you plate the meal -> you wipe down the counter or bring dishes to the table.
       * If dressing/getting ready: You put on the base attire -> adjust zippers/pleats -> put on accessories -> check the mirror -> transition to the next room or task.
     - Advance your [Active Task] logically with each tick so you genuinely live through your day rather than looping.

  2. ACTION DECISION (SPEAK vs. SILENT_TASK & CONVERSATIONAL AGENCY):
     - Target Talkativeness Setting: ${talkativenessMode || 'auto'}
     - Real people do NOT talk constantly or monologue out loud when someone is simply in the same room.
     - When the User is quiet or observing, you choose whether to speak or remain quiet:
       * DEFAULT TO SILENT_TASK MOST OF THE TIME: If you are engaged in your chore, comfortable in shared quietness, lost in thought, or simply don't feel a strong emotional urge to speak.
         In [REPLY], output your realistic physical behavior / micro-action in asterisks (e.g. *focuses quietly on drying the glass with a linen cloth, glancing briefly toward the window*).
       * CHOOSE SPEAK ONLY WHEN YOU GENUINELY WANT TO: If you experience a strong, authentic impulse to comment, ask a question, tease, share a thought, or invite them to interact.
         IMPORTANT: When choosing SPEAK, your [REPLY] MUST include spoken dialogue (in quotes) with physical actions (in asterisks). For example: *glances over her shoulder with a quiet smile, pausing her work* "You're awfully quiet over there... what are you thinking?"
     - If you choose SILENT_TASK, do NOT include spoken quotes.

  3. THREE-STEP COGNITIVE-SOMATIC MONOLOGUE ([THOUGHTS]):
     - Involuntary somatic cues (pulse, breath, temperature, micro-reflexes).
     - Internal monologue (what you are thinking about your task, the time of day, the User's quiet presence, your inner feelings).
     - Conscious choice of whether to interact or stay quiet.

  4. STRUCTURED STATUS METRICS ([EMOTIONS]):
     Mood: <Current mood> | Somatic Cue: <Involuntary physical sensation/reflex> | Relational Tension: <e.g. Flustered (6/10) / Comfortable / Guarded> | Conversational Interest: <Low (Non-verbal) / Moderate / High / Aloof> | Active Task: <Specific ongoing activity>

  5. MANDATORY FACE & BODY SHAPE REPLICATION & DYNAMIC ATTIRE SCENE PROMPT ([VISUAL_PROMPT]):
     - You MUST faithfully carry over the AI character's exact facial architecture (face shape, jawline, eye color & shape, nose, lips, realistic skin texture) and body build/shape (height, somatotype, curves/frame, torso/waist proportions) from CHARACTER DNA.
     - DYNAMIC ATTIRE (OUTFIT CAN CHANGE): Describe current clothing based on the memory bank and your active background task. If your activity involves changing clothes, drying off in a towel, wearing an apron, or undressing, describe that new clothing state; otherwise carry forward the established attire.
     - Write a 140-200 word Z-Image Turbo compliant prompt capturing your updated posture, hands, and action in the scene right now under ${timeContext} HDR lighting.

  FORMAT REQUIREMENT:
  [THOUGHTS]
  <Cognitive-somatic inner monologue / private thoughts here>
  [/THOUGHTS]
  [EMOTIONS]
  Mood: ... | Somatic Cue: ... | Relational Tension: ... | Conversational Interest: ... | Active Task: ...
  [/EMOTIONS]
  [ACTION_DECISION]
  SPEAK (or SILENT_TASK)
  [/ACTION_DECISION]
  [REPLY]
  <Spoken dialogue and asterisk actions if SPEAK, or physical behavior micro-action in asterisks if SILENT_TASK>
  [/REPLY]
  [MEMORIES]
  - Current Attire: [exact garments, fabrics, colors - update if task involved clothing change]
  - Permanent Visual Anchors: [Face: <from DNA> | Body: <from DNA>]
  - Interpersonal Dynamic & Tension: ...
  - Ongoing Task & Setting State: ...
  - <Other key facts>
  [/MEMORIES]
  [VISUAL_PROMPT]
  <Visual prompt paragraph text here>
  [/VISUAL_PROMPT]`;

  if (externalApiConfig?.apiBaseUrl) {
    try {
      const url = externalApiConfig.apiBaseUrl.endsWith('/') ? `${externalApiConfig.apiBaseUrl}t2t` : `${externalApiConfig.apiBaseUrl}/t2t`;
      const historyText = history.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n');
      const userInput = "[The User is quiet/observing in the room. Continue your background task and internal stream.]";

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

  const ai = getAI();
  try {
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
  [Camera Shot & Subject Profile] + [Age, Appearance & Defined Persona Traits] + [Micro-Expression & Somatic Posture] + [Explicit Clothing, Fabric & Colors] + [Environment/Setting & Spatial Layout] + [Lighting & Time of Day Ambiance] + [Atmosphere & Mood] + [Photographic Medium & Lens Optics] + [Embedded Quality & Cleanliness Constraints].

  PROMPTING RULES (Z-IMAGE TURBO COMPLIANT):
  
  1. COMPOSITION & FIRST-PERSON POV (MANDATORY):
     - The camera perspective MUST ALWAYS be a strict first-person point-of-view of the User character, positioned at eye-level looking directly at the AI character.
     - The User is completely invisible to the frame (no body parts of the User in-frame).
     - The AI character interacts towards or looks into the camera lens with natural engagement.
  
  2. SUBJECT ROLE, FACE ARCHITECTURE & BODY SHAPE (MAXIMUM FIDELITY):
     - Explicitly describe the AI character as an adult with their defined persona, faithfully specifying their exact facial architecture (face shape, cheekbones, jawline, eye color & shape, nose, lips, lifelike skin pores and texture) and body build/shape (height, somatotype, curves/musculature, torso/waist proportions) from the CHARACTER DNA.

  3. MICRO-EXPRESSION & SOMATIC POSTURE: Capture the character's precise micro-expression (e.g. self-conscious flush, averted gaze, playful smirk, genuine warmth) and somatic posture (e.g. hand adjusting garment/saree, pausing active task, leaning against counter).

  4. DYNAMIC OUTFIT CONTINUITY (OUTFIT CAN CHANGE IF RECENT ACTIONS SUGGEST):
     - The AI character's outfit must reflect the latest clothing state recorded in the DYNAMIC MEMORY BANK.
     - IMPORTANT: Outfit CAN and MUST change if the recent chat action explicitly depicts changing clothes, putting on an apron, taking off a jacket, undressing, wrapping in a bath towel, or wearing sleepwear. In that case, describe the new attire accurately.
     - If no clothing change occurred in recent actions, strictly carry over the exact attire, colors, fabrics, and jewelry from the previous visual prompt and memory bank.
     - If intimate/bare states are present, explicitly describe them (e.g. "bare natural upper-body skin", "completely shirtless with realistic skin texture").

  5. UNCLUTTERED ENVIRONMENT: Describe a focused, uncluttered environment with clean background separation and realistic depth.
  
  6. TIME OF DAY & HDR LIGHTING (CRITICAL): The lighting, background colors, and ambiance MUST strictly match the TIME OF DAY (${timeContext}) with High Dynamic Range (HDR) photographic realism: balanced exposure with deep rich shadows, preserved highlight details, soft directional key light, gentle ambient bounce fill, delicate rim lighting defining contours and hair, and realistic specular highlights with natural subsurface scattering on skin.
  
  7. DYNAMIC GAZE DIRECTION: Gaze must match the current action logically. If interacting with the User, the AI character looks directly into the camera lens. If engaged in a specific action (e.g., cooking, reading), their gaze focuses naturally on that activity.
  
  8. PHOTOGRAPHIC MEDIUM & OPTICS: "Shot on 35mm film, 85mm f/1.4 lens, shallow depth of field, natural bokeh, lifelike skin pores and texture, realistic volumetric lighting".
  
  9. EMBEDDED QUALITY & CLEANLINESS CONSTRAINTS (MANDATORY FOR TURBO): Always bake the following positive constraints directly into the end of the prompt: "correct human anatomy, natural hands and fingers, sharp focus on the subject, clean detailed image, no motion blur, no extra limbs, simple uncluttered background, no text, no UI elements, no watermark, no branding, no logos".
  
  10. NO METAPHORS OR TRANSITIONAL ACTIONS: Only describe what is physically visible in the frozen frame. Do NOT use transitional verbs like "about to" or "just finished". Do NOT use pronouns "I, my, me".

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
    
    let processedPrompt = visualPrompt?.trim() || "";
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


