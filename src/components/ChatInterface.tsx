import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Message, 
  getChatResponse, 
  generateImage, 
  generateCharacterDNA, 
  generateVisualPrompt, 
  generateInitialSetup, 
  getUserAutomatedReply, 
  setGlobalModel,
  getAutonomousCharacterAction,
  parseCharacterEmotions,
  CharacterLivingState
} from '../lib/gemini';
import { 
  Send, 
  ArrowLeft, 
  Loader2, 
  User, 
  Sparkles, 
  Image as ImageIcon, 
  Eye, 
  EyeOff, 
  Save, 
  CheckCircle2, 
  Settings, 
  Info, 
  FileText, 
  X, 
  Play, 
  Pause, 
  Brain, 
  Heart, 
  Copy, 
  Check,
  Activity,
  Zap,
  Radio,
  ChevronDown,
  ChevronUp,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Session, saveSession as persistSession } from '../lib/storage';
import PwaInstallButton from './PwaInstallButton';

const KREA2_URL = 'https://avijitpalit3--krea2-inference-krea2service-fastapi-app.modal.run/generate';
const ZIT_URL = 'https://avijitpalit3--z-image-turbo-zimageservice-fastapi-app.modal.run/generate';

interface ChatInterfaceProps {
  scenario: string;
  initialSession?: Session | null;
  initialApiBaseUrl: string;
  initialUseInternalApi: boolean;
  selectedModel: string;
  initialLoraStrength?: number;
  initialImageModelUrl?: string;
  onBack: () => void;
}

export default function ChatInterface({ 
  scenario, 
  initialSession, 
  initialApiBaseUrl, 
  initialUseInternalApi, 
  selectedModel, 
  initialLoraStrength = 1.5,
  initialImageModelUrl,
  onBack 
}: ChatInterfaceProps) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSession?.id);
  const [messages, setMessages] = useState<Message[]>(initialSession?.history || []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isLivingThinking, setIsLivingThinking] = useState(false);
  const [isLivingEngineActive, setIsLivingEngineActive] = useState(true);
  const [showActivityPanel, setShowActivityPanel] = useState(false);

  const [bgImage, setBgImage] = useState<string | null>(initialSession?.bgImage || null);
  const [currentVisualPrompt, setCurrentVisualPrompt] = useState<string | undefined>(initialSession?.lastVisualPrompt);
  const [characterDNA, setCharacterDNA] = useState<string | null>(initialSession?.characterDNA || null);
  const [memoryBank, setMemoryBank] = useState<string>(initialSession?.memoryBank || '');
  
  // Real-time Living Character State
  const [characterLivingState, setCharacterLivingState] = useState<CharacterLivingState>(() => {
    const lastModel = initialSession?.history?.slice().reverse().find(m => m.role === 'model');
    return parseCharacterEmotions(lastModel?.emotions, lastModel?.thoughts);
  });

  const [apiBaseUrl, setApiBaseUrl] = useState<string>(initialSession?.apiBaseUrl || initialApiBaseUrl);
  const [useInternalApi, setUseInternalApi] = useState<boolean>(initialSession?.useInternalApi ?? initialUseInternalApi);
  const [currentSelectedModel, setCurrentSelectedModel] = useState<string>(() => {
    const sModel = initialSession?.selectedModel || selectedModel;
    return sModel === 'custom' ? 'gemma-4-31b-it' : sModel;
  });
  const [imageModelUrl, setImageModelUrl] = useState<string>(
    initialSession?.imageModelUrl || initialImageModelUrl || KREA2_URL
  );
  const [customImageModelUrl, setCustomImageModelUrl] = useState<string>(() => {
    if (initialSession?.imageModelUrl && initialSession.imageModelUrl !== KREA2_URL && initialSession.imageModelUrl !== ZIT_URL) {
      return initialSession.imageModelUrl;
    }
    if (initialImageModelUrl && initialImageModelUrl !== KREA2_URL && initialImageModelUrl !== ZIT_URL) {
      return initialImageModelUrl;
    }
    return initialSession?.apiBaseUrl || initialApiBaseUrl || 'https://odorful-hsiu-unmaledictory.ngrok-free.dev/generate';
  });

  const currentImageModelSelection = (imageModelUrl === KREA2_URL) 
    ? KREA2_URL 
    : (imageModelUrl === ZIT_URL) 
      ? ZIT_URL 
      : 'custom';
  const [imageWidthInput, setImageWidthInput] = useState<string>(String(initialSession?.imageWidth || 720));
  const [imageHeightInput, setImageHeightInput] = useState<string>(String(initialSession?.imageHeight || 1280));
  const [imageStepsInput, setImageStepsInput] = useState<string>(String(initialSession?.imageSteps || 8));
  const [enableLora, setEnableLora] = useState<boolean>(initialSession?.enableLora ?? true);
  const [loraName, setLoraName] = useState<string>(initialSession?.loraName || 'Krea2_HMNSFW_AIO.safetensors');
  const [loraStrengthInput, setLoraStrengthInput] = useState<string>(
    initialSession?.loraStrength !== undefined ? String(initialSession.loraStrength) : String(initialLoraStrength)
  );

  const imageWidth = parseInt(imageWidthInput) || 720;
  const imageHeight = parseInt(imageHeightInput) || 1280;
  const imageSteps = parseInt(imageStepsInput) || 8;
  const parsedLoraStrength = parseFloat(loraStrengthInput);
  const loraStrength = isNaN(parsedLoraStrength) ? 1.0 : parsedLoraStrength;

  const [talkativenessMode, setTalkativenessMode] = useState<'auto' | 'quiet' | 'balanced' | 'chatty'>((initialSession as any)?.talkativenessMode || 'auto');
  const [showChat, setShowChat] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [statusBarMessage, setStatusBarMessage] = useState<string | null>(null);
  const [lastSendFailed, setLastSendFailed] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<{ type: 'info' | 'error' | 'warn'; message: string; timestamp: string }[]>(() => {
    return (window as any).__captured_logs || [];
  });
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isAutoReplyEnabled, setIsAutoReplyEnabled] = useState(false);
  const [isGeneratingAutoReply, setIsGeneratingAutoReply] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserInteractionTime = useRef<number>(Date.now());
  const hasInitializedRef = useRef<boolean>(Boolean(initialSession));
  const isGeneratingImageRef = useRef<boolean>(false);

  // Keep live references so background async timers never stale
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const memoryBankRef = useRef(memoryBank);
  memoryBankRef.current = memoryBank;
  const characterDNARef = useRef(characterDNA);
  characterDNARef.current = characterDNA;
  const currentVisualPromptRef = useRef(currentVisualPrompt);
  currentVisualPromptRef.current = currentVisualPrompt;
  const isLivingThinkingRef = useRef(isLivingThinking);
  isLivingThinkingRef.current = isLivingThinking;
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;
  const isGeneratingAutoReplyRef = useRef(isGeneratingAutoReply);
  isGeneratingAutoReplyRef.current = isGeneratingAutoReply;
  const isGeneratingPromptRef = useRef(isGeneratingPrompt);
  isGeneratingPromptRef.current = isGeneratingPrompt;
  const talkativenessModeRef = useRef(talkativenessMode);
  talkativenessModeRef.current = talkativenessMode;

  // Trigger background image generation smoothly without interrupting the chat UI
  const triggerBackgroundImage = useCallback(async (promptText?: string) => {
    const targetPrompt = promptText || currentVisualPrompt;
    if (!targetPrompt || !imageModelUrl || isGeneratingImageRef.current) return;

    isGeneratingImageRef.current = true;
    setIsGeneratingImage(true);
    try {
      const result = await generateImage(
        imageModelUrl,
        targetPrompt,
        imageWidth,
        imageHeight,
        imageSteps,
        loraStrength,
        enableLora,
        loraName
      );
      if (result?.url) {
        setBgImage(result.url);
      }
    } catch (err) {
      console.warn("Background scene visualization warning:", err);
    } finally {
      isGeneratingImageRef.current = false;
      setIsGeneratingImage(false);
    }
  }, [imageModelUrl, currentVisualPrompt, imageWidth, imageHeight, imageSteps, loraStrength, enableLora, loraName]);

  const handleCopyMessage = async (text: string, index: number) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  useEffect(() => {
    const registerListener = (window as any).__register_log_listener;
    if (registerListener) {
      const unsubscribe = registerListener(() => {
        setConsoleLogs([...((window as any).__captured_logs || [])]);
      });
      return unsubscribe;
    }
  }, []);

  const handleClearLogs = () => {
    (window as any).__captured_logs = [];
    setConsoleLogs([]);
  };

  const filteredLogs = consoleLogs.filter(log => {
    if (logFilter === 'all') return true;
    return log.type === logFilter;
  });

  const triggerUserAutoReply = async (currentMessages: Message[]) => {
    if (isGeneratingAutoReply || isLoading || isGeneratingPrompt) return;
    setIsGeneratingAutoReply(true);
    setStatusBarMessage("Generating automated User turn...");

    try {
      const userReplyText = await getUserAutomatedReply(
        scenario,
        characterDNA || "",
        currentMessages,
        memoryBank,
        useInternalApi ? undefined : { apiBaseUrl }
      );

      if (userReplyText) {
        setMessages(prev => [...prev, { role: 'user', text: userReplyText }]);
        lastUserInteractionTime.current = Date.now();
      }
    } catch (e) {
      console.error("Auto-reply generation failed:", e);
    } finally {
      setIsGeneratingAutoReply(false);
      setStatusBarMessage(null);
    }
  };

  // Trigger automatic replies state machine
  useEffect(() => {
    if (!isAutoReplyEnabled || isLoading || isGeneratingAutoReply || isGeneratingPrompt || isGeneratingImage || lastSendFailed) return;

    if (messages.length === 0) {
      triggerUserAutoReply(messages);
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'model') {
      triggerUserAutoReply(messages);
    } else if (lastMessage.role === 'user') {
      const triggerAiReply = async () => {
        setIsLoading(true);
        setStatusBarMessage("AI is thinking & replying...");
        try {
          const previousHistory = messages.slice(0, -1);
          const result = await getChatResponse(
            scenario, 
            characterDNA || "", 
            previousHistory, 
            lastMessage.text, 
            memoryBank,
            useInternalApi ? undefined : { 
              apiBaseUrl,
              dna: characterDNA || undefined,
              lastVisualPrompt: currentVisualPrompt
            },
            currentVisualPrompt,
            undefined,
            talkativenessModeRef.current
          );

          if (result.error) {
            setLastSendFailed(true);
            setIsLoading(false);
            setStatusBarMessage(null);
            return;
          }

          if (result.updatedMemories) {
            setMemoryBank(result.updatedMemories);
          }

          // Update living state in status bar
          const livingState = parseCharacterEmotions(result.emotions, result.thoughts);
          setCharacterLivingState(livingState);

          const modelMessage: Message = { 
            role: 'model', 
            text: result.reply,
            thoughts: result.thoughts,
            emotions: result.emotions
          };
          const finalMessages: Message[] = [...messages, modelMessage];
          setMessages(finalMessages);
          setIsLoading(false);
          setStatusBarMessage(null);

          // Update visual prompt & trigger background image right after thoughts
          if (result.lastVisualPrompt) {
            setCurrentVisualPrompt(result.lastVisualPrompt);
            if (imageModelUrl) {
              triggerBackgroundImage(result.lastVisualPrompt);
            }
          } else if (characterDNA) {
            setStatusBarMessage("Creating visual prompt...");
            setIsGeneratingPrompt(true);
            const nextPrompt = await generateVisualPrompt(
              scenario, 
              finalMessages, 
              characterDNA, 
              currentVisualPrompt, 
              useInternalApi ? undefined : { apiBaseUrl }, 
              undefined,
              result.updatedMemories || memoryBank
            );
            setCurrentVisualPrompt(nextPrompt);
            setIsGeneratingPrompt(false);
            setStatusBarMessage(null);
            if (imageModelUrl) {
              triggerBackgroundImage(nextPrompt);
            }
          }
        } catch (e) {
          console.error("AI trigger failed:", e);
          setLastSendFailed(true);
          setIsLoading(false);
          setStatusBarMessage(null);
        }
      };
      triggerAiReply();
    }
  }, [isAutoReplyEnabled, messages, isLoading, isGeneratingAutoReply, isGeneratingPrompt, isGeneratingImage, lastSendFailed, scenario, characterDNA, memoryBank, useInternalApi, apiBaseUrl, currentVisualPrompt, triggerBackgroundImage]);

  useEffect(() => {
    setGlobalModel(currentSelectedModel);
  }, [currentSelectedModel]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isGeneratingAutoReply]);

  // Execute an autonomous background living tick
  const executeAutonomousLivingTick = useCallback(async () => {
    if (isLoadingRef.current || isGeneratingAutoReplyRef.current || isGeneratingPromptRef.current || isLivingThinkingRef.current) return;
    setIsLivingThinking(true);

    try {
      const currentMsgs = messagesRef.current;
      const currentMem = memoryBankRef.current;
      const currentDNA = characterDNARef.current;
      const currentPrompt = currentVisualPromptRef.current;

      const result = await getAutonomousCharacterAction(
        scenario,
        currentDNA || "",
        currentMsgs,
        currentMem,
        useInternalApi ? undefined : {
          apiBaseUrl,
          dna: currentDNA || undefined,
          lastVisualPrompt: currentPrompt
        },
        currentPrompt,
        undefined,
        talkativenessModeRef.current
      );

      if (!result.error) {
        if (result.updatedMemories) {
          setMemoryBank(result.updatedMemories);
        }

        const livingState = parseCharacterEmotions(result.emotions, result.thoughts);
        setCharacterLivingState(livingState);

        // Update visual prompt & trigger background image right after thoughts/monologue generation
        if (result.lastVisualPrompt && result.lastVisualPrompt !== currentPrompt) {
          setCurrentVisualPrompt(result.lastVisualPrompt);
          if (imageModelUrl) {
            triggerBackgroundImage(result.lastVisualPrompt);
          }
        }

        // If character spoke or performed a physical action/behavior, render it to the chat stream
        if (result.reply && result.reply.trim()) {
          const lastMsg = currentMsgs[currentMsgs.length - 1];
          const isDuplicate = lastMsg && lastMsg.text.trim() === result.reply.trim();
          if (!isDuplicate) {
            const newAiMsg: Message = {
              role: 'model',
              text: result.reply,
              thoughts: result.thoughts,
              emotions: result.emotions
            };
            setMessages(prev => [...prev, newAiMsg]);
          }
        }
      }
    } catch (err) {
      console.warn("Autonomous living action error:", err);
    } finally {
      setIsLivingThinking(false);
    }
  }, [scenario, useInternalApi, apiBaseUrl, triggerBackgroundImage]);

  // Generate DNA, initial visual prompt, and start background living processes once at app start
  useEffect(() => {
    if (initialSession) {
      hasInitializedRef.current = true;
      return;
    }
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initSession = async () => {
      setIsLivingThinking(true);
      setStatusBarMessage("Initializing living world & character foundation...");
      setIsGeneratingPrompt(true);

      try {
        const setup = await generateInitialSetup(scenario, useInternalApi ? undefined : { apiBaseUrl });
        setCharacterDNA(setup.dna);
        let finalPrompt = setup.visualPrompt;
        setCurrentVisualPrompt(setup.visualPrompt);
        setIsGeneratingPrompt(false);

        // Start initial background character action/thoughts immediately after story foundation
        setStatusBarMessage("Character is starting active routine in background...");
        const firstLivingAction = await getAutonomousCharacterAction(
          scenario,
          setup.dna,
          [],
          "",
          useInternalApi ? undefined : { apiBaseUrl },
          setup.visualPrompt
        );

        if (!firstLivingAction.error) {
          if (firstLivingAction.updatedMemories) {
            setMemoryBank(firstLivingAction.updatedMemories);
          }
          const livingState = parseCharacterEmotions(firstLivingAction.emotions, firstLivingAction.thoughts);
          setCharacterLivingState(livingState);

          if (firstLivingAction.lastVisualPrompt) {
            finalPrompt = firstLivingAction.lastVisualPrompt;
            setCurrentVisualPrompt(firstLivingAction.lastVisualPrompt);
          }

          // If character has an opening line, post it as the single initial greeting
          if (firstLivingAction.reply && firstLivingAction.reply.trim()) {
            const initialModelMessage: Message = {
              role: 'model',
              text: firstLivingAction.reply,
              thoughts: firstLivingAction.thoughts,
              emotions: firstLivingAction.emotions
            };
            setMessages([initialModelMessage]);
          }
        }

        // Render the scene image ONCE for the initial state
        if (imageModelUrl && finalPrompt) {
          triggerBackgroundImage(finalPrompt);
        }
      } catch (err) {
        console.error("Initial session start error:", err);
      } finally {
        setIsLivingThinking(false);
        setStatusBarMessage(null);
      }
    };

    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autonomous background timer: runs periodically when idle to keep character living, working, and speaking
  useEffect(() => {
    if (!isLivingEngineActive) return;

    const interval = setInterval(() => {
      const idleTimeMs = Date.now() - lastUserInteractionTime.current;
      // If user hasn't sent a message for over 24 seconds, perform background living cycle
      if (
        idleTimeMs >= 24000 &&
        !isLoadingRef.current && 
        !isGeneratingAutoReplyRef.current && 
        !isGeneratingPromptRef.current && 
        !isLivingThinkingRef.current
      ) {
        executeAutonomousLivingTick();
      }
    }, 25000);

    return () => clearInterval(interval);
  }, [isLivingEngineActive, executeAutonomousLivingTick]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const saved = persistSession({
        id: sessionId,
        name: `Session ${new Date().toLocaleString()}`,
        scenario,
        history: messages,
        characterDNA,
        memoryBank,
        bgImage,
        lastVisualPrompt: currentVisualPrompt,
        apiBaseUrl,
        useInternalApi,
        selectedModel: currentSelectedModel,
        imageModelUrl,
        imageWidth,
        imageHeight,
        imageSteps,
        enableLora,
        loraName,
        loraStrength,
        talkativenessMode
      });
      setSessionId(saved.id);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error('Failed to save session', e);
      setError("Failed to save session.");
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save when messages or other state changes
  useEffect(() => {
    if (messages.length > 0 || characterDNA || bgImage || memoryBank) {
      const timer = setTimeout(() => {
        handleSave();
      }, 5000); // Debounce auto-save
      return () => clearTimeout(timer);
    }
  }, [messages, characterDNA, bgImage, currentVisualPrompt, apiBaseUrl, imageModelUrl, imageWidth, imageHeight, imageSteps, enableLora, loraName, loraStrength, talkativenessMode, memoryBank]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    lastUserInteractionTime.current = Date.now();
    setLastSendFailed(false);
    const userMessage: Message = { role: 'user', text: input.trim() };
    const updatedMessages: Message[] = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setStatusBarMessage("AI is thinking & replying...");

    const result = await getChatResponse(
      scenario, 
      characterDNA || "", 
      messages, 
      userMessage.text, 
      memoryBank,
      useInternalApi ? undefined : { 
        apiBaseUrl,
        dna: characterDNA || undefined,
        lastVisualPrompt: currentVisualPrompt
      },
      currentVisualPrompt,
      undefined,
      talkativenessMode
    );

    if (result.error) {
      setLastSendFailed(true);
      setIsLoading(false);
      setStatusBarMessage(null);
      return;
    }

    if (result.updatedMemories) {
      setMemoryBank(result.updatedMemories);
    }

    // Update real-time living character status bar
    const livingState = parseCharacterEmotions(result.emotions, result.thoughts);
    setCharacterLivingState(livingState);

    const modelMessage: Message = { 
      role: 'model', 
      text: result.reply,
      thoughts: result.thoughts,
      emotions: result.emotions
    };
    const finalMessages: Message[] = [...updatedMessages, modelMessage];
    
    setMessages(finalMessages);
    setIsLoading(false);
    setStatusBarMessage(null);

    // Update visual prompt & trigger background image generation right after thoughts
    if (result.lastVisualPrompt) {
      setCurrentVisualPrompt(result.lastVisualPrompt);
      if (imageModelUrl) {
        triggerBackgroundImage(result.lastVisualPrompt);
      }
    } else if (characterDNA) {
      setStatusBarMessage("Creating visual prompt...");
      setIsGeneratingPrompt(true);
      const nextPrompt = await generateVisualPrompt(
        scenario, 
        finalMessages, 
        characterDNA, 
        currentVisualPrompt, 
        useInternalApi ? undefined : { apiBaseUrl }, 
        undefined,
        result.updatedMemories || memoryBank
      );
      setCurrentVisualPrompt(nextPrompt);
      setIsGeneratingPrompt(false);
      setStatusBarMessage(null);
      if (imageModelUrl) {
        triggerBackgroundImage(nextPrompt);
      }
    }
  };

  const handleRetry = async () => {
    if (messages.length === 0 || isLoading) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return;

    lastUserInteractionTime.current = Date.now();
    setLastSendFailed(false);
    setIsLoading(true);
    setStatusBarMessage("Retrying AI reply...");

    const previousHistory = messages.slice(0, -1);
    const result = await getChatResponse(
      scenario, 
      characterDNA || "", 
      previousHistory, 
      lastMessage.text, 
      memoryBank,
      useInternalApi ? undefined : { 
        apiBaseUrl,
        dna: characterDNA || undefined,
        lastVisualPrompt: currentVisualPrompt
      },
      currentVisualPrompt
    );

    if (result.error) {
      setLastSendFailed(true);
      setIsLoading(false);
      setStatusBarMessage(null);
      return;
    }

    if (result.updatedMemories) {
      setMemoryBank(result.updatedMemories);
    }

    const livingState = parseCharacterEmotions(result.emotions, result.thoughts);
    setCharacterLivingState(livingState);

    const modelMessage: Message = { 
      role: 'model', 
      text: result.reply,
      thoughts: result.thoughts,
      emotions: result.emotions
    };
    const finalMessages: Message[] = [...messages, modelMessage];
    setMessages(finalMessages);
    setIsLoading(false);
    setStatusBarMessage(null);

    // Update visual prompt & trigger background image
    if (result.lastVisualPrompt) {
      setCurrentVisualPrompt(result.lastVisualPrompt);
      if (imageModelUrl) {
        triggerBackgroundImage(result.lastVisualPrompt);
      }
    } else if (characterDNA) {
      setStatusBarMessage("Creating visual prompt...");
      setIsGeneratingPrompt(true);
      const nextPrompt = await generateVisualPrompt(
        scenario, 
        finalMessages, 
        characterDNA, 
        currentVisualPrompt, 
        useInternalApi ? undefined : { apiBaseUrl }, 
        undefined,
        result.updatedMemories || memoryBank
      );
      setCurrentVisualPrompt(nextPrompt);
      setIsGeneratingPrompt(false);
      setStatusBarMessage(null);
      if (imageModelUrl) {
        triggerBackgroundImage(nextPrompt);
      }
    }
  };

  const [error, setError] = useState<string | null>(null);

  const handleGenerateImage = async () => {
    if (isGeneratingImage || !currentVisualPrompt) return;
    
    if (!imageModelUrl) {
      setShowSettings(true);
      setError("Please select or configure an Image Generation Model.");
      return;
    }

    setIsGeneratingImage(true);
    setStatusBarMessage("Creating image...");
    setError(null);

    try {
      const result = await generateImage(imageModelUrl, currentVisualPrompt, imageWidth, imageHeight, imageSteps, loraStrength, enableLora, loraName);
      if (result) {
        setBgImage(result.url);
      }
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      setError(`Image generation failed: ${error.message || "Check console and API configuration."}`);
    } finally {
      setIsGeneratingImage(false);
      setStatusBarMessage(null);
    }
  };

  return (
    <div className="relative flex flex-col h-screen max-w-5xl mx-auto overflow-hidden">
      {/* Background Image */}
      <AnimatePresence>
        {bgImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-0 overflow-hidden"
          >
            <img 
              src={bgImage} 
              alt="Scene Background" 
              className={`w-full h-full object-cover transition-all duration-700 ease-in-out ${
                showChat ? 'blur-2xl scale-110 opacity-80' : 'blur-none scale-100 opacity-100'
              }`}
              referrerPolicy="no-referrer"
            />
            <motion.div 
              animate={{ opacity: showChat ? 0.45 : 0 }}
              className="absolute inset-0 bg-black transition-opacity duration-500" 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className={`p-4 md:p-6 flex flex-col gap-4 border-b border-white/10 glass-panel sticky top-0 z-20 transition-transform duration-500 ${showChat ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 w-full">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-white/5 rounded-full transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col">
              <h2 className="font-serif font-bold text-white text-lg leading-none">Roleplay Session</h2>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {/* Activity Panel Icon Button (Green while active, blinking yellow/orange while thinking) */}
              <button
                onClick={() => {
                  setShowActivityPanel(!showActivityPanel);
                  if (showLog) setShowLog(false);
                  if (showSettings) setShowSettings(false);
                }}
                className={`relative p-2 rounded-lg transition-all border ${
                  isLivingThinking || isLoading || isGeneratingAutoReply || isGeneratingPrompt
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse shadow-md shadow-amber-500/20'
                    : isLivingEngineActive
                    ? showActivityPanel
                      ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'text-white/40 border-transparent hover:bg-white/5'
                }`}
                title={
                  isLivingThinking || isLoading 
                    ? "Character is thinking / deliberating..." 
                    : "Activity Panel (AI Autonomous Living Status)"
                }
              >
                <Activity size={22} className={isLivingThinking || isLoading ? 'animate-pulse' : ''} />
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                    isLivingThinking || isLoading ? 'bg-amber-400' : 'bg-emerald-400'
                  } opacity-75`}></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isLivingThinking || isLoading ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}></span>
                </span>
              </button>

              <button
                onClick={() => {
                  setShowLog(!showLog);
                  if (showActivityPanel) setShowActivityPanel(false);
                  if (showSettings) setShowSettings(false);
                }}
                className={`p-2 rounded-lg transition-colors ${showLog ? 'bg-accent text-white' : 'hover:bg-white/5 text-white/60'}`}
                title="View Logs"
              >
                <FileText size={22} />
              </button>
              <button
                onClick={() => {
                  setShowSettings(!showSettings);
                  if (showActivityPanel) setShowActivityPanel(false);
                  if (showLog) setShowLog(false);
                }}
                className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-accent text-white' : 'hover:bg-white/5 text-white/60'}`}
                title="Settings"
              >
                <Settings size={22} />
              </button>
            </div>
          </div>
        </div>

        {/* Live Operational Status Toast in Header */}
        <AnimatePresence>
          {(statusBarMessage || isGeneratingImage) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-amber-500/15 border border-amber-500/30 rounded-xl px-3 py-1.5 text-xs text-amber-200 flex items-center justify-between shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin text-amber-400 flex-shrink-0" />
                <span className="font-medium">{statusBarMessage || (isGeneratingImage ? "Visualizing scene photo..." : "")}</span>
              </div>
              {isGeneratingImage && (
                <span className="text-[10px] text-amber-300/80 font-bold uppercase tracking-wider">Auto-rendering</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Activity Panel */}
        <AnimatePresence>
          {showActivityPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3.5 p-4 bg-black/40 backdrop-blur-2xl rounded-2xl border border-white/15 shadow-2xl">
                {/* Header of Activity Panel */}
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Activity size={16} className="text-emerald-400" />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Living Engine Toggle */}
                    <button
                      onClick={() => setIsLivingEngineActive(!isLivingEngineActive)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                        isLivingEngineActive 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                          : 'bg-white/5 text-white/40 border-white/10 hover:text-white'
                      }`}
                    >
                      <Radio size={12} className={isLivingEngineActive ? 'animate-pulse' : ''} />
                      <span>{isLivingEngineActive ? "Live Engine ON" : "Live Engine OFF"}</span>
                    </button>

                    {/* Manual Tick Trigger Button */}
                    <button
                      onClick={() => executeAutonomousLivingTick()}
                      disabled={isLivingThinking || isLoading}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-accent hover:bg-accent/90 text-white border border-accent/40 transition-all disabled:opacity-50 shadow-md shadow-accent/20 cursor-pointer"
                      title="Run a background thinking and task tick right now"
                    >
                      {isLivingThinking ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      <span>Live Tick Now</span>
                    </button>

                    <button onClick={() => setShowActivityPanel(false)} className="text-white/40 hover:text-white p-1">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Status Beacon & Current Task */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div className="flex items-center gap-2.5 p-3 bg-white/5 rounded-xl border border-white/10 md:col-span-2">
                    <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isLivingThinking || isLoading ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isLivingThinking || isLoading ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-white/40">Active Ongoing Task</span>
                      <span className="text-xs text-white/95 font-medium leading-tight">
                        {characterLivingState.activeTask || "Engaged in current setting routine"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-white/40">Autonomic State</span>
                      <span className={`text-xs font-bold ${isLivingThinking || isLoading ? 'text-amber-300 animate-pulse' : 'text-emerald-400'}`}>
                        {isLivingThinking || isLoading ? "Thinking & Deliberating..." : "Active in Background"}
                      </span>
                    </div>
                    {characterLivingState.lastUpdated && (
                      <span className="text-[10px] text-white/40">{characterLivingState.lastUpdated}</span>
                    )}
                  </div>
                </div>

                {/* Somatic Cue, Tension, Mood, Conversational Interest */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="flex flex-col gap-1 p-2.5 bg-pink-500/10 border border-pink-500/20 rounded-xl text-pink-200">
                    <div className="flex items-center gap-1.5 text-pink-400 font-bold text-[10px] uppercase tracking-wider">
                      <Heart size={12} className="fill-pink-400/30" />
                      <span>Somatic Cue</span>
                    </div>
                    <span className="text-[11px] leading-tight text-pink-100 font-medium">
                      {characterLivingState.somaticCue || "Steady pulse & natural breath"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-200">
                    <div className="flex items-center gap-1.5 text-purple-400 font-bold text-[10px] uppercase tracking-wider">
                      <Zap size={12} />
                      <span>Relational Tension</span>
                    </div>
                    <span className="text-[11px] leading-tight text-purple-100 font-medium">
                      {characterLivingState.relationalTension || "Comfortable"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-200">
                    <div className="flex items-center gap-1.5 text-blue-400 font-bold text-[10px] uppercase tracking-wider">
                      <Brain size={12} />
                      <span>Mood</span>
                    </div>
                    <span className="text-[11px] leading-tight text-blue-100 font-medium truncate">
                      {characterLivingState.mood || "Observant"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-200">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[10px] uppercase tracking-wider">
                      <MessageSquare size={12} />
                      <span>Speech Drive</span>
                    </div>
                    <span className="text-[11px] leading-tight text-emerald-100 font-medium truncate">
                      {characterLivingState.conversationalInterest || "Autonomous (Mood-driven)"}
                    </span>
                  </div>
                </div>

                {/* Inner Monologue & Cognitive Stream (Cleanly rendered, no accordion needed) */}
                <div className="flex flex-col gap-1.5 p-3.5 bg-purple-950/40 border border-purple-500/30 rounded-xl shadow-inner">
                  <div className="flex items-center justify-between text-[10px] text-purple-400 font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Brain size={13} className="text-purple-400" />
                      Autonomous Inner Monologue & Private Thoughts
                    </span>
                  </div>
                  <p className="text-xs font-serif italic text-purple-100/95 leading-relaxed pt-1 select-text">
                    "{characterLivingState.innerThoughts || "Observing the setting quietly, focusing on the current task and thoughts..."}"
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 text-[10px] text-red-200 flex items-center justify-between"
            >
              <span>{error}</span>
              <button onClick={() => setError(null)} className="hover:text-white">✕</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Log Panel */}
        <AnimatePresence>
          {showLog && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-6 bg-black/40 backdrop-blur-2xl space-y-6 max-h-[70vh] overflow-y-auto border border-white/10 rounded-2xl mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-accent">System Logs</h3>
                  <button onClick={() => setShowLog(false)} className="text-white/40 hover:text-white">
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4 font-mono text-[10px]">
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-white/40 uppercase tracking-widest font-bold">Character DNA</label>
                      <span className="text-[9px] text-accent/80">Editable Blueprint</span>
                    </div>
                    <textarea
                      value={characterDNA || ""}
                      onChange={(e) => setCharacterDNA(e.target.value)}
                      placeholder="Enter or customize Character DNA visual blueprints..."
                      rows={5}
                      className="w-full bg-black/30 p-3 rounded-lg text-white/90 border border-white/15 focus:outline-none focus:border-accent/50 font-mono text-[11px] leading-relaxed resize-y"
                    />
                  </section>

                  <section className="space-y-2">
                    <div className="text-white/40 uppercase tracking-widest font-bold">Dynamic Memory Bank</div>
                    <div className="bg-white/5 p-3 rounded-lg text-white/75 whitespace-pre-wrap border border-white/10 text-xs">
                      {memoryBank || "No consolidated memories yet. Chat with the AI to seed the memory bank."}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <div className="text-white/40 uppercase tracking-widest font-bold">Current Visual Prompt</div>
                    <div className="bg-white/5 p-3 rounded-lg text-accent/70 whitespace-pre-wrap border border-accent/20">
                      {currentVisualPrompt || "Not generated yet."}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-white/40 uppercase tracking-widest font-bold">Console Output Logs</div>
                      <div className="flex items-center gap-2">
                        <select 
                          value={logFilter} 
                          onChange={(e) => setLogFilter(e.target.value as any)}
                          className="bg-white/5 border border-white/10 text-white/70 text-[9px] rounded px-2 py-0.5 focus:outline-none"
                        >
                          <option value="all" className="bg-black text-white">All Logs</option>
                          <option value="info" className="bg-black text-white">Info</option>
                          <option value="warn" className="bg-black text-white font-semibold">Warning</option>
                          <option value="error" className="bg-black text-white font-semibold">Error</option>
                        </select>
                        <button 
                          onClick={handleClearLogs}
                          className="text-[9px] bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold px-2 py-0.5 rounded border border-red-500/30 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    
                    <div className="bg-black/60 border border-white/10 rounded-lg p-3 max-h-[180px] overflow-y-auto font-mono text-[9px] leading-relaxed space-y-1 select-text">
                      {filteredLogs.length === 0 ? (
                        <div className="text-white/30 italic">No console logs matching the filter. Send a message to call the models.</div>
                      ) : (
                        filteredLogs.map((log, index) => {
                          let colorClass = "text-white/70";
                          if (log.type === "error") colorClass = "text-red-400 font-semibold";
                          if (log.type === "warn") colorClass = "text-yellow-400 font-semibold";
                          
                          return (
                            <div key={index} className="flex gap-2 items-start border-b border-white/5 pb-1">
                              <span className="text-white/30 select-none">[{log.timestamp}]</span>
                              <span className="text-accent/60 font-bold uppercase select-none">[{log.type}]</span>
                              <span className={`${colorClass} whitespace-pre-wrap flex-1`}>{log.message}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Session Settings</label>
                  <div className="flex items-center gap-2">
                    <PwaInstallButton />
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${saveSuccess ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-accent text-white hover:bg-accent/90 shadow-lg shadow-accent/20'}`}
                    >
                      {isSaving ? <Loader2 size={14} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={14} /> : <Save size={14} />}
                      {saveSuccess ? "Saved" : "Save Session"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Language Model</label>
                    <select
                      value={currentSelectedModel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCurrentSelectedModel(val);
                        setUseInternalApi(true);
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent/50 text-white cursor-pointer"
                    >
                      <option value="gemma-4-31b-it" className="bg-neutral-900">gemma 31b</option>
                      <option value="gemma-4-26b-a4b-it" className="bg-neutral-900">gemma 24b a4b</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Image Generation Model</label>
                    <select
                      value={currentImageModelSelection}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          const targetUrl = (customImageModelUrl && customImageModelUrl !== KREA2_URL && customImageModelUrl !== ZIT_URL)
                            ? customImageModelUrl
                            : (apiBaseUrl || 'https://odorful-hsiu-unmaledictory.ngrok-free.dev/generate');
                          setImageModelUrl(targetUrl);
                          setCustomImageModelUrl(targetUrl);
                          setApiBaseUrl(targetUrl);
                        } else {
                          setImageModelUrl(val);
                        }
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent/50 text-white cursor-pointer font-medium"
                    >
                      <option value={KREA2_URL} className="bg-neutral-900 text-white">Krea 2</option>
                      <option value={ZIT_URL} className="bg-neutral-900 text-white">Z-image turbo (ZiT)</option>
                      <option value="custom" className="bg-neutral-900 text-white">Custom</option>
                    </select>
                  </div>

                  {currentImageModelSelection === 'custom' && (
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Custom Image Model API URL</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={customImageModelUrl}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomImageModelUrl(val);
                            setImageModelUrl(val);
                            setApiBaseUrl(val);
                          }}
                          placeholder="https://your-custom-image-service.modal.run/generate"
                          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent/50 text-white font-mono"
                        />
                      </div>
                      <p className="text-[9px] text-white/30 italic">Endpoint used for image generation: /generate</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Width</label>
                    <input 
                      type="text"
                      inputMode="numeric"
                      value={imageWidthInput}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^[0-9]*$/.test(val)) {
                          setImageWidthInput(val);
                        }
                      }}
                      onBlur={() => {
                        if (!imageWidthInput.trim() || parseInt(imageWidthInput) <= 0) {
                          setImageWidthInput('720');
                        }
                      }}
                      placeholder="720"
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Height</label>
                    <input 
                      type="text"
                      inputMode="numeric"
                      value={imageHeightInput}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^[0-9]*$/.test(val)) {
                          setImageHeightInput(val);
                        }
                      }}
                      onBlur={() => {
                        if (!imageHeightInput.trim() || parseInt(imageHeightInput) <= 0) {
                          setImageHeightInput('1280');
                        }
                      }}
                      placeholder="1280"
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Steps</label>
                    <input 
                      type="text"
                      inputMode="numeric"
                      value={imageStepsInput}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^[0-9]*$/.test(val)) {
                          setImageStepsInput(val);
                        }
                      }}
                      onBlur={() => {
                        if (!imageStepsInput.trim() || parseInt(imageStepsInput) <= 0) {
                          setImageStepsInput('8');
                        }
                      }}
                      placeholder="8"
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={enableLora}
                        onChange={e => setEnableLora(e.target.checked)}
                        className="rounded border-white/20 bg-black/40 text-accent focus:ring-accent w-4 h-4 cursor-pointer accent-accent"
                      />
                      <span className="text-xs font-bold uppercase tracking-wider text-white">Enable LoRA</span>
                    </label>
                  </div>

                  <div className={`space-y-3 transition-opacity ${enableLora ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Lora</label>
                      <select
                        value={loraName}
                        onChange={e => {
                          const val = e.target.value;
                          setLoraName(val);
                          if (val === 'famegrid_spicy.safetensors' && currentVisualPrompt) {
                            const trimmed = currentVisualPrompt.trim();
                            if (!/^famegrid\b/i.test(trimmed)) {
                              setCurrentVisualPrompt(trimmed ? `Famegrid, ${trimmed}` : 'Famegrid');
                            }
                          }
                        }}
                        disabled={!enableLora}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white cursor-pointer"
                      >
                        <option value="Krea2_HMNSFW_AIO.safetensors" className="bg-neutral-900">Krea2_HMNSFW_AIO.safetensors</option>
                        <option value="Krea2-realism-V2.safetensors" className="bg-neutral-900">Krea2-realism-V2.safetensors</option>
                        <option value="realism_engine_krea2_v3.1.safetensors" className="bg-neutral-900">realism_engine_krea2_v3.1.safetensors</option>
                        <option value="famegrid_spicy.safetensors" className="bg-neutral-900">famegrid_spicy.safetensors</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">LoRA Strength</label>
                      <input 
                        type="text"
                        inputMode="decimal"
                        value={loraStrengthInput}
                        onChange={e => {
                          const val = e.target.value;
                          // Allow empty string, numbers, leading dot, floating point numbers (e.g. .3, 0.3, 1, 1.5)
                          if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                            setLoraStrengthInput(val);
                          }
                        }}
                        onBlur={() => {
                          if (loraStrengthInput.trim() === '' || isNaN(parseFloat(loraStrengthInput))) {
                            setLoraStrengthInput('1.0');
                          }
                        }}
                        placeholder="e.g. 0.3 or 1.5"
                        disabled={!enableLora}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white disabled:opacity-50 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Character DNA</label>
                    <span className="text-[9px] text-accent/80 font-mono">Editable Visual Blueprint</span>
                  </div>
                  <textarea 
                    value={characterDNA || ""}
                    onChange={(e) => setCharacterDNA(e.target.value)}
                    placeholder="AI character appearance, traits, facial features, hair, and outfit specifications..."
                    rows={4}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-accent/50 font-mono leading-relaxed resize-y"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Initial Scenario</label>
                  <textarea 
                    readOnly
                    value={scenario}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-xs text-white/60 focus:outline-none min-h-[80px] resize-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Floating Action Buttons - Water Drop Style */}
      <div className="fixed bottom-[30%] right-0 z-30 flex flex-col gap-2">
        <button 
          onClick={() => setIsAutoReplyEnabled(!isAutoReplyEnabled)}
          className={`p-4 pl-6 bg-white/10 backdrop-blur-3xl border-y border-l border-white/20 rounded-l-full text-white hover:bg-white/20 transition-all shadow-2xl relative z-10 ${
            isAutoReplyEnabled ? 'bg-green-500/20 border-green-500/30' : ''
          }`}
          title={isAutoReplyEnabled ? "Pause Auto-Reply Loop" : "Play Auto-Reply Loop"}
        >
          {isGeneratingAutoReply ? (
            <Loader2 size={22} className="animate-spin text-green-400" />
          ) : isAutoReplyEnabled ? (
            <Pause size={22} className="text-green-400 fill-green-400/20 animate-pulse" />
          ) : (
            <Play size={22} className="text-white fill-white/15" />
          )}
        </button>
        <button 
          onClick={handleGenerateImage}
          disabled={isGeneratingImage || isGeneratingPrompt || !currentVisualPrompt}
          className={`p-4 pl-6 bg-white/10 backdrop-blur-3xl border-y border-l border-white/20 rounded-l-full text-white hover:bg-white/20 transition-all shadow-2xl relative z-10 ${isGeneratingImage || isGeneratingPrompt ? 'bg-accent/30 border-accent/40 brightness-125' : ''}`}
          title={isGeneratingImage ? "Visualizing..." : isGeneratingPrompt ? "Updating Prompt..." : "Visualize Scene"}
        >
          {isGeneratingImage || isGeneratingPrompt ? (
            <Loader2 size={22} className="animate-spin text-accent" />
          ) : (
            <ImageIcon size={22} />
          )}
        </button>
        <button 
          onClick={() => setShowChat(!showChat)}
          className={`p-4 pl-6 bg-white/10 backdrop-blur-3xl border-y border-l border-white/20 rounded-l-full text-white hover:bg-white/20 transition-all shadow-2xl ${!showChat ? 'bg-accent/30 border-accent/40' : ''}`}
          title={showChat ? "Show Image (Hide Chat)" : "Show Chat"}
        >
          {showChat ? <EyeOff size={22} /> : <Eye size={22} />}
        </button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className={`flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth z-10 transition-opacity duration-500 ${showChat ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
            <Sparkles size={48} className="mb-4 text-accent" />
            <p className="text-xl font-serif italic mb-2">The stage is set.</p>
            <p className="text-sm max-w-md">Your scenario is active and the character is active in the background. Send a message or watch the character live its routine.</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[90%] md:max-w-[85%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex-shrink-0 flex items-center justify-center border ${
                  msg.role === 'user' ? 'bg-accent/20 border-accent/40' : 'bg-white/5 border-white/20'
                }`}>
                  {msg.role === 'user' ? <User size={14} className="md:w-[18px] md:h-[18px]" /> : <Sparkles size={14} className="text-accent md:w-[18px] md:h-[18px]" />}
                </div>
                <div className="flex flex-col gap-2 w-full">
                  <div className={`flex items-center gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'user' && (
                      <button
                        onClick={() => handleCopyMessage(msg.text, i)}
                        className={`p-2 rounded-xl border transition-all cursor-pointer flex-shrink-0 flex items-center justify-center ${
                          copiedIndex === i
                            ? 'bg-green-500/20 text-green-400 border-green-500/40'
                            : 'bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border-white/10 hover:border-white/20'
                        }`}
                        title={copiedIndex === i ? "Copied to clipboard!" : "Copy user reply"}
                        aria-label="Copy user reply"
                      >
                        {copiedIndex === i ? (
                          <Check size={14} className="text-green-400" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    )}
                    {msg.role === 'user' && i === messages.length - 1 && lastSendFailed && (
                      <div className="flex items-center gap-2 mr-1">
                        <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1 bg-red-950/40 border border-red-500/20 px-2.5 py-1 rounded-lg">
                          <X size={12} className="text-red-400 animate-pulse" />
                          Flickered
                        </span>
                        <button
                          onClick={handleRetry}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 text-xs text-accent hover:text-white bg-accent/20 hover:bg-accent/40 border border-accent/30 hover:border-accent/50 px-3 py-1.5 rounded-xl transition-all font-bold shadow-md shadow-accent/10 cursor-pointer"
                        >
                          <Play size={10} className="fill-accent text-accent group-hover:fill-white" />
                          Retry
                        </button>
                      </div>
                    )}
                    <div className={`p-4 md:p-5 rounded-2xl md:rounded-3xl ${
                      msg.role === 'user' 
                        ? 'bg-accent text-white' 
                        : 'glass-panel text-white/90'
                    }`}>
                      <div className="markdown-body text-sm md:text-base leading-snug md:leading-relaxed">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex justify-start mb-4"
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex-shrink-0 flex items-center justify-center border bg-white/5 border-accent/30 shadow-md shadow-accent/10">
              <div className="flex items-center gap-1 justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-accent/80 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-accent/50 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}></span>
              </div>
            </div>
          </motion.div>
        )}

        {isGeneratingAutoReply && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex justify-end mb-4"
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex-shrink-0 flex items-center justify-center border bg-accent/20 border-accent/40 shadow-md shadow-accent/10">
              <div className="flex items-center gap-1 justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}></span>
                <span className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}></span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <footer className={`p-6 z-10 transition-transform duration-500 ${showChat ? 'translate-y-0' : 'translate-y-[200%]'}`}>
        
        <form 
          onSubmit={handleSend}
          className="relative flex items-center"
        >
          <input 
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isAutoReplyEnabled || isLoading || isGeneratingAutoReply}
            placeholder={isAutoReplyEnabled ? "Auto-playing roleplay... Click Pause to type" : "Type your action or dialogue..."}
            className={`w-full bg-white/5 border border-white/10 rounded-[2rem] px-8 py-5 pr-20 focus:outline-none focus:border-accent/50 transition-all glass-panel text-lg ${
              (isAutoReplyEnabled || isLoading || isGeneratingAutoReply) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          />
          <button 
            type="submit"
            disabled={!input.trim() || isLoading || isAutoReplyEnabled || isGeneratingAutoReply}
            className="absolute right-4 p-4 bg-accent text-white rounded-2xl hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-accent/20"
          >
            <Send size={24} />
          </button>
        </form>
      </footer>
    </div>
  );
}
