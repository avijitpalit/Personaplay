import React, { useState, useRef, useEffect } from 'react';
import { Message, getChatResponse, generateImage, generateCharacterDNA, generateVisualPrompt, generateInitialSetup, getUserAutomatedReply, setGlobalModel } from '../lib/gemini';
import { Send, ArrowLeft, Loader2, User, Sparkles, Image as ImageIcon, Eye, EyeOff, Save, CheckCircle2, Settings, Info, Clock, FileText, X, Play, Pause, Thermometer, AlertTriangle, Lock, Unlock, RotateCcw, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Session, saveSession as persistSession } from '../lib/storage';

interface ChatInterfaceProps {
  scenario: string;
  initialSession?: Session | null;
  initialApiBaseUrl: string;
  initialUseInternalApi: boolean;
  selectedModel: string;
  initialLoraStrength?: number;
  onBack: () => void;
}

export default function ChatInterface({ 
  scenario, 
  initialSession, 
  initialApiBaseUrl, 
  initialUseInternalApi, 
  selectedModel, 
  initialLoraStrength = 1.5,
  onBack 
}: ChatInterfaceProps) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSession?.id);
  const [messages, setMessages] = useState<Message[]>(initialSession?.history || []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [bgImage, setBgImage] = useState<string | null>(initialSession?.bgImage || null);
  const [currentVisualPrompt, setCurrentVisualPrompt] = useState<string | undefined>(initialSession?.lastVisualPrompt);
  const [characterDNA, setCharacterDNA] = useState<string | null>(initialSession?.characterDNA || null);
  const [memoryBank, setMemoryBank] = useState<string>(initialSession?.memoryBank || '');
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(initialSession?.apiBaseUrl || initialApiBaseUrl);
  const [useInternalApi, setUseInternalApi] = useState<boolean>(initialSession?.useInternalApi ?? initialUseInternalApi);
  const [currentSelectedModel, setCurrentSelectedModel] = useState<string>(initialSession?.selectedModel || selectedModel);
  const [imageWidth, setImageWidth] = useState<number>(initialSession?.imageWidth || 720);
  const [imageHeight, setImageHeight] = useState<number>(initialSession?.imageHeight || 1280);
  const [imageSteps, setImageSteps] = useState<number>(initialSession?.imageSteps || 8);
  const [enableLora, setEnableLora] = useState<boolean>(initialSession?.enableLora ?? true);
  const [loraName, setLoraName] = useState<string>(initialSession?.loraName || 'Krea2_HMNSFW_AIO.safetensors');
  const [loraStrength, setLoraStrength] = useState<number>(initialSession?.loraStrength ?? initialLoraStrength);
  const [temperature, setTemperature] = useState<number>(initialSession?.temperature ?? 0.0);
  const [pervertScore, setPervertScore] = useState<number>(initialSession?.pervertScore ?? 0.0);
  const [characterPatienceLimit, setCharacterPatienceLimit] = useState<number>(initialSession?.characterPatienceLimit ?? 0.65);
  const [isGameOver, setIsGameOver] = useState<boolean>((initialSession?.temperature ?? 0.0) > 0.8 || (initialSession?.pervertScore ?? 0.0) >= (initialSession?.characterPatienceLimit ?? 0.65));
  const [isPrivateThought, setIsPrivateThought] = useState<boolean>(false);
  const [showDnaModal, setShowDnaModal] = useState<boolean>(false);
  const [lastThoughts, setLastThoughts] = useState<string>('');
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Parse patience limit from DNA if provided
  useEffect(() => {
    if (characterDNA) {
      const match = characterDNA.match(/patience\s*limit:\s*(0\.\d+)/i);
      if (match && match[1]) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val > 0 && val <= 1) {
          setCharacterPatienceLimit(val);
        }
      }
    }
  }, [characterDNA]);

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

  const [isAutoReplyEnabled, setIsAutoReplyEnabled] = useState(false);
  const [isGeneratingAutoReply, setIsGeneratingAutoReply] = useState(false);

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
        setStatusBarMessage("AI is replying...");
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
            currentVisualPrompt
          );

          if (result.error) {
            setLastSendFailed(true);
            setIsLoading(false);
            setStatusBarMessage(null);
            return;
          }

          if (result.thoughts) {
            setLastThoughts(result.thoughts);
          }

          if (result.updatedMemories) {
            setMemoryBank(result.updatedMemories);
          }

          if (result.pervertDelta !== undefined) {
            setPervertScore(prev => {
              const nextScore = Math.max(0, Math.min(1.0, prev + (result.pervertDelta || 0)));
              const rounded = parseFloat(nextScore.toFixed(2));
              if (rounded >= characterPatienceLimit) {
                setIsGameOver(true);
              }
              return rounded;
            });
          }

          if (result.temperatureDelta !== undefined) {
            setTemperature(prev => {
              const nextTemp = Math.max(0, Math.min(1.0, prev + (result.temperatureDelta || 0)));
              const rounded = parseFloat(nextTemp.toFixed(2));
              if (rounded > 0.8) {
                setIsGameOver(true);
              }
              return rounded;
            });
          }

          if (result.gameOver) {
            setIsGameOver(true);
          }

          const finalMessages: Message[] = [...messages, { role: 'model', text: result.reply }];
          setMessages(finalMessages);
          setIsLoading(false);
          setStatusBarMessage(null);

          // Update visual prompt
          if (result.lastVisualPrompt) {
            setCurrentVisualPrompt(result.lastVisualPrompt);
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
  }, [isAutoReplyEnabled, messages, isLoading, isGeneratingAutoReply, isGeneratingPrompt, isGeneratingImage, lastSendFailed]);

  useEffect(() => {
    setGlobalModel(currentSelectedModel);
  }, [currentSelectedModel]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isGeneratingAutoReply]);

  // Generate DNA and initial visual prompt in a single unified API call when the component mounts
  useEffect(() => {
    if (initialSession) return; // Skip if loading existing session

    const initSession = async () => {
      setStatusBarMessage("Initializing scene & character setup...");
      setIsGeneratingPrompt(true);
      const setup = await generateInitialSetup(scenario, useInternalApi ? undefined : { apiBaseUrl });
      setCharacterDNA(setup.dna);
      setCurrentVisualPrompt(setup.visualPrompt);
      setIsGeneratingPrompt(false);
      setStatusBarMessage(null);
    };
    initSession();
  }, [scenario, initialSession, apiBaseUrl, useInternalApi]);

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
        imageWidth,
        imageHeight,
        imageSteps,
        enableLora,
        loraName,
        loraStrength,
        temperature,
        pervertScore,
        characterPatienceLimit
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
  }, [messages, characterDNA, bgImage, currentVisualPrompt, apiBaseUrl, imageWidth, imageHeight, imageSteps, enableLora, loraName, loraStrength, memoryBank]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || isGameOver) return;

    setLastSendFailed(false);
    const userMessage: Message = { 
      role: 'user', 
      text: input.trim(),
      isPrivate: isPrivateThought
    };
    const updatedMessages: Message[] = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setStatusBarMessage("AI is replying...");

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
      currentVisualPrompt
    );

    if (result.error) {
      setLastSendFailed(true);
      setIsLoading(false);
      setStatusBarMessage(null);
      return;
    }

    if (result.thoughts) {
      setLastThoughts(result.thoughts);
    }

    if (result.updatedMemories) {
      setMemoryBank(result.updatedMemories);
    }

    if (result.pervertDelta !== undefined) {
      setPervertScore(prev => {
        const nextScore = Math.max(0, Math.min(1.0, prev + (result.pervertDelta || 0)));
        const rounded = parseFloat(nextScore.toFixed(2));
        if (rounded >= characterPatienceLimit) {
          setIsGameOver(true);
        }
        return rounded;
      });
    }

    // Process Temperature Delta
    if (result.temperatureDelta !== undefined) {
      setTemperature(prev => {
        const nextTemp = Math.max(0, Math.min(1.0, prev + (result.temperatureDelta || 0)));
        const rounded = parseFloat(nextTemp.toFixed(2));
        if (rounded > 0.8) {
          setIsGameOver(true);
        }
        return rounded;
      });
    }

    if (result.gameOver) {
      setIsGameOver(true);
    }

    const finalMessages: Message[] = [...updatedMessages, { role: 'model', text: result.reply }];
    
    setMessages(finalMessages);
    setIsLoading(false);
    setStatusBarMessage(null);

    // Update visual prompt
    if (result.lastVisualPrompt) {
      setCurrentVisualPrompt(result.lastVisualPrompt);
      setStatusBarMessage(null);
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
    }
  };

  const handleRetry = async () => {
    if (messages.length === 0 || isLoading || isGameOver) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return;

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

    if (result.thoughts) {
      setLastThoughts(result.thoughts);
    }

    if (result.updatedMemories) {
      setMemoryBank(result.updatedMemories);
    }

    if (result.pervertDelta !== undefined) {
      setPervertScore(prev => {
        const nextScore = Math.max(0, Math.min(1.0, prev + (result.pervertDelta || 0)));
        const rounded = parseFloat(nextScore.toFixed(2));
        if (rounded >= characterPatienceLimit) {
          setIsGameOver(true);
        }
        return rounded;
      });
    }

    if (result.temperatureDelta !== undefined) {
      setTemperature(prev => {
        const nextTemp = Math.max(0, Math.min(1.0, prev + (result.temperatureDelta || 0)));
        const rounded = parseFloat(nextTemp.toFixed(2));
        if (rounded > 0.8) {
          setIsGameOver(true);
        }
        return rounded;
      });
    }

    if (result.gameOver) {
      setIsGameOver(true);
    }

    const finalMessages: Message[] = [...messages, { role: 'model', text: result.reply }];
    setMessages(finalMessages);
    setIsLoading(false);
    setStatusBarMessage(null);

    // Update visual prompt
    if (result.lastVisualPrompt) {
      setCurrentVisualPrompt(result.lastVisualPrompt);
      setStatusBarMessage(null);
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
    }
  };

  const [error, setError] = useState<string | null>(null);

  const handleGenerateImage = async () => {
    if (isGeneratingImage || !currentVisualPrompt) return;
    
    if (!apiBaseUrl) {
      setShowSettings(true);
      setError("Please provide an API Base URL first.");
      return;
    }

    setIsGeneratingImage(true);
    setStatusBarMessage("Creating image...");
    setError(null);

    try {
      const result = await generateImage(apiBaseUrl, currentVisualPrompt, imageWidth, imageHeight, imageSteps, loraStrength, enableLora, loraName);
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
              <span className="text-[9px] uppercase tracking-[0.2em] text-accent font-bold mt-1">Bengali Roleplay Game</span>
            </div>

            {/* Temperature Meter */}
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 rounded-2xl ml-auto md:ml-4">
              <Thermometer size={16} className={temperature > 0.7 ? "text-red-400 animate-pulse" : temperature > 0.4 ? "text-yellow-400" : "text-emerald-400"} />
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase font-bold text-white/40 tracking-wider">Temp:</span>
                  <span className={`text-xs font-mono font-bold ${temperature > 0.7 ? "text-red-400" : temperature > 0.4 ? "text-yellow-400" : "text-emerald-400"}`}>
                    {(temperature * 100).toFixed(0)}%
                  </span>
                  {temperature > 0.8 && (
                    <span className="text-[8px] bg-red-500/30 text-red-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">Limit Exceeded</span>
                  )}
                </div>
                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden mt-0.5">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${temperature > 0.7 ? "bg-red-500" : temperature > 0.4 ? "bg-yellow-400" : "bg-emerald-400"}`}
                    style={{ width: `${Math.min(100, temperature * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Pervert Score Meter */}
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 rounded-2xl">
              <ShieldAlert size={16} className={pervertScore >= characterPatienceLimit ? "text-red-400 animate-pulse" : pervertScore > characterPatienceLimit * 0.6 ? "text-yellow-400" : "text-purple-400"} />
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase font-bold text-white/40 tracking-wider">Pervert:</span>
                  <span className={`text-xs font-mono font-bold ${pervertScore >= characterPatienceLimit ? "text-red-400" : pervertScore > characterPatienceLimit * 0.6 ? "text-yellow-400" : "text-purple-300"}`}>
                    {pervertScore.toFixed(2)} / {characterPatienceLimit.toFixed(2)}
                  </span>
                </div>
                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden mt-0.5">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${pervertScore >= characterPatienceLimit ? "bg-red-500" : pervertScore > characterPatienceLimit * 0.6 ? "bg-yellow-400" : "bg-purple-500"}`}
                    style={{ width: `${Math.min(100, (pervertScore / characterPatienceLimit) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Character DNA & Behavioral Traits Button */}
            <button
              onClick={() => setShowDnaModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold text-accent transition-all cursor-pointer"
              title="Inspect Character Behavioral DNA & Personality Traits"
            >
              <Sparkles size={14} className="text-accent" />
              <span className="hidden sm:inline">Traits</span>
            </button>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setShowLog(!showLog)}
                className={`p-2 rounded-lg transition-colors ${showLog ? 'bg-accent text-white' : 'hover:bg-white/5 text-white/60'}`}
                title="View Logs"
              >
                <FileText size={24} />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-accent text-white' : 'hover:bg-white/5 text-white/60'}`}
                title="Settings"
              >
                <Settings size={24} />
              </button>
            </div>
          </div>
        </div>

        

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
                    <div className="text-white/40 uppercase tracking-widest font-bold">Character DNA</div>
                    <div className="bg-white/5 p-3 rounded-lg text-white/70 whitespace-pre-wrap border border-white/10">
                      {characterDNA || "Not generated yet."}
                    </div>
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
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${saveSuccess ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-accent text-white hover:bg-accent/90 shadow-lg shadow-accent/20'}`}
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={14} /> : <Save size={14} />}
                    {saveSuccess ? "Saved" : "Save Session"}
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Roleplay Model</label>
                    <select
                      value={currentSelectedModel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCurrentSelectedModel(val);
                        if (val === 'custom') {
                          setUseInternalApi(false);
                        } else {
                          setUseInternalApi(true);
                        }
                      }}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent/50 text-white cursor-pointer"
                    >
                      <option value="gemma-4-31b-it" className="bg-neutral-900">gemma 31b</option>
                      <option value="gemma-4-26b-a4b-it" className="bg-neutral-900">gemma 24b a4b</option>
                      <option value="custom" className="bg-neutral-900">custom</option>
                    </select>
                  </div>

                  {currentSelectedModel === 'custom' && (
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">API Base URL</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={apiBaseUrl}
                          onChange={e => setApiBaseUrl(e.target.value)}
                          placeholder="https://odorful-hsiu-unmaledictory.ngrok-free.dev"
                          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent/50 text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Width</label>
                    <input 
                      type="number"
                      value={imageWidth}
                      onChange={e => setImageWidth(parseInt(e.target.value) || 720)}
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Height</label>
                    <input 
                      type="number"
                      value={imageHeight}
                      onChange={e => setImageHeight(parseInt(e.target.value) || 1280)}
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Steps</label>
                    <input 
                      type="number"
                      value={imageSteps}
                      onChange={e => setImageSteps(parseInt(e.target.value) || 8)}
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white"
                    />
                  </div>
                </div>

                {/* Temperature Controls & Debugging */}
                <div className="flex flex-col gap-3 p-4 bg-red-950/20 border border-red-500/20 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Thermometer size={16} className="text-red-400" />
                      <span className="text-xs font-bold uppercase tracking-wider text-white">Temperature Controls (Debug)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTemperature(0.0);
                        setIsGameOver(false);
                      }}
                      className="flex items-center gap-1.5 text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold px-2.5 py-1 rounded-lg border border-red-500/30 transition-all cursor-pointer"
                    >
                      <RotateCcw size={12} />
                      Reset to 0.0
                    </button>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-white/60">Current Temperature:</span>
                      <span className={`font-mono font-bold ${temperature > 0.8 ? 'text-red-400 animate-pulse' : temperature > 0.5 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                        {temperature.toFixed(2)} / 1.00 ({Math.round(temperature * 100)}%)
                      </span>
                    </div>
                    <input 
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.02"
                      value={temperature}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        setTemperature(val);
                        if (val > 0.8) {
                          setIsGameOver(true);
                        } else {
                          setIsGameOver(false);
                        }
                      }}
                      className="w-full accent-red-500 h-2 bg-black/40 rounded-lg cursor-pointer"
                    />
                    <p className="text-[9px] text-white/30 italic">If temperature exceeds 0.8, the game over limit is triggered.</p>
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
                        onChange={e => setLoraName(e.target.value)}
                        disabled={!enableLora}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white cursor-pointer"
                      >
                        <option value="Krea2_HMNSFW_AIO.safetensors" className="bg-neutral-900">Krea2_HMNSFW_AIO.safetensors</option>
                        <option value="Krea2-realism-V2.safetensors" className="bg-neutral-900">Krea2-realism-V2.safetensors</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">LoRA Strength</label>
                      <input 
                        type="number"
                        step="0.1"
                        min="0.0"
                        max="5.0"
                        value={loraStrength}
                        onChange={e => setLoraStrength(parseFloat(e.target.value) || 1.5)}
                        disabled={!enableLora}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50 text-white disabled:opacity-50"
                      />
                    </div>
                  </div>
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

      {/* Status Bar */}
      <AnimatePresence>
        {statusBarMessage && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-accent/10 border-t border-white/5 px-6 py-2 flex items-center gap-3"
          >
            <Loader2 size={12} className="animate-spin text-accent" />
            <span className="text-[8px] uppercase tracking-wider text-white/60 font-bold">{statusBarMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Buttons - Water Drop Style */}
      <div className="fixed bottom-[30%] right-0 z-30 flex flex-col gap-2">
        <button 
          onClick={() => setIsAutoReplyEnabled(!isAutoReplyEnabled)}
          className={`p-4 pl-6 bg-white/10 backdrop-blur-3xl border-y border-l border-white/20 rounded-l-full text-white hover:bg-white/20 transition-all shadow-2xl relative z-10 ${
            isAutoReplyEnabled ? 'bg-green-500/20 border-green-500/30' : ''
          }`}
          title={isAutoReplyEnabled ? "Pause Auto-Reply" : "Play Auto-Reply"}
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
            <p className="text-sm max-w-md">Your scenario is active. Take the first step and begin the roleplay.</p>
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
                <div className="flex items-center gap-3">
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
                      ? msg.isPrivate
                        ? 'bg-purple-950/80 border border-purple-500/40 text-purple-100 shadow-lg'
                        : 'bg-accent text-white' 
                      : 'glass-panel text-white/90'
                  }`}>
                    {msg.isPrivate && (
                      <div className="flex items-center gap-1.5 text-[10px] text-purple-300 font-bold uppercase tracking-wider mb-2 pb-1 border-b border-purple-500/30 select-none">
                        <Lock size={12} className="text-purple-400" />
                        <span>Private Internal Thought (AI Cannot Read This)</span>
                      </div>
                    )}
                    <div className="markdown-body text-sm md:text-base leading-snug md:leading-relaxed">
                      <Markdown>{msg.text}</Markdown>
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
        {/* Input Header Tools */}
        <div className="flex items-center justify-between mb-2.5 px-2">
          <button
            type="button"
            onClick={() => setIsPrivateThought(!isPrivateThought)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isPrivateThought
                ? 'bg-purple-950/90 border border-purple-500/50 text-purple-200 shadow-md shadow-purple-950/40'
                : 'bg-white/5 border border-white/10 text-white/60 hover:text-white'
            }`}
          >
            {isPrivateThought ? <Lock size={14} className="text-purple-400 animate-pulse" /> : <Unlock size={14} />}
            <span>{isPrivateThought ? "Private Thought Mode ON (AI Cannot Read)" : "Public Action Mode"}</span>
          </button>

          {lastThoughts && (
            <button
              type="button"
              onClick={() => setShowDnaModal(true)}
              className="text-[10px] text-white/40 hover:text-accent font-mono truncate max-w-[200px] hidden sm:inline"
              title={lastThoughts}
            >
              AI Thought: "{lastThoughts.slice(0, 30)}..."
            </button>
          )}
        </div>
        
        <form 
          onSubmit={handleSend}
          className="relative flex items-center"
        >
          <input 
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isAutoReplyEnabled || isLoading || isGeneratingAutoReply}
            placeholder={
              isAutoReplyEnabled 
                ? "Auto-playing roleplay... Click Pause to type" 
                : isPrivateThought
                  ? "Type your private thought (e.g., thinking she looks pretty)..."
                  : "Type your action or dialogue..."
            }
            className={`w-full bg-white/5 border border-white/10 rounded-[2rem] px-8 py-5 pr-20 focus:outline-none focus:border-accent/50 transition-all glass-panel text-lg ${
              (isAutoReplyEnabled || isLoading || isGeneratingAutoReply) ? 'opacity-50 cursor-not-allowed' : ''
            } ${isPrivateThought ? 'border-purple-500/40 bg-purple-950/20 text-purple-100 placeholder:text-purple-300/40' : ''}`}
          />
          <button 
            type="submit"
            disabled={!input.trim() || isLoading || isAutoReplyEnabled || isGeneratingAutoReply}
            className={`absolute right-4 p-4 text-white rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg ${
              isPrivateThought 
                ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30' 
                : 'bg-accent hover:bg-accent/90 shadow-accent/20'
            }`}
          >
            <Send size={24} />
          </button>
        </form>
      </footer>

      {/* Character DNA & Traits Modal */}
      <AnimatePresence>
        {showDnaModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-2xl w-full bg-neutral-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2 text-accent">
                  <Sparkles size={20} />
                  <h3 className="font-serif font-bold text-lg text-white">Character DNA & Behavioral Traits</h3>
                </div>
                <button
                  onClick={() => setShowDnaModal(false)}
                  className="p-1 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-white/40">Pervert Score</span>
                  <span className="text-lg font-mono font-bold text-purple-300 mt-1">{pervertScore.toFixed(2)}</span>
                </div>
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl flex flex-col">
                  <span className="text-[10px] uppercase font-bold text-white/40">Patience Limit</span>
                  <span className="text-lg font-mono font-bold text-amber-300 mt-1">{characterPatienceLimit.toFixed(2)}</span>
                </div>
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl flex flex-col col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase font-bold text-white/40">Temperature</span>
                  <span className="text-lg font-mono font-bold text-red-300 mt-1">{temperature.toFixed(2)} / 1.00</span>
                </div>
              </div>

              {/* Character Thoughts */}
              {lastThoughts && (
                <div className="bg-purple-950/30 border border-purple-500/20 p-4 rounded-2xl space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-purple-300 flex items-center gap-1.5">
                    <Sparkles size={12} /> Recent AI Internal Monologue
                  </span>
                  <p className="text-xs text-purple-100/90 italic leading-relaxed">{lastThoughts}</p>
                </div>
              )}

              {/* Character DNA Blueprint & Traits */}
              <div className="space-y-2">
                <span className="text-xs uppercase font-bold tracking-wider text-white/40">Full Character DNA & Traits Configuration</span>
                <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-xs font-mono text-white/80 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                  {characterDNA || "No character DNA configured yet."}
                </div>
              </div>

              <button
                onClick={() => setShowDnaModal(false)}
                className="w-full py-3 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-all cursor-pointer text-xs uppercase tracking-wider"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over Modal */}
      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full bg-neutral-900 border border-red-500/40 rounded-3xl p-6 shadow-2xl text-center space-y-4"
            >
              <div className="w-16 h-16 bg-red-500/20 border border-red-500/40 rounded-full flex items-center justify-center mx-auto text-red-400">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-wide">Story Ended — Boundary Exceeded</h2>
              <p className="text-xs text-white/70 leading-relaxed">
                The AI character recognized perverted behavior or reached her character patience limit (Patience Limit: {characterPatienceLimit.toFixed(2)}). She has cut off or confronted the interaction.
              </p>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setTemperature(0.0);
                    setPervertScore(0.0);
                    setIsGameOver(false);
                  }}
                  className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-red-600/20 text-xs uppercase tracking-wider"
                >
                  Forgive & Reset Game State
                </button>
                <button
                  onClick={onBack}
                  className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white/80 font-bold rounded-xl transition-all cursor-pointer text-xs uppercase tracking-wider"
                >
                  Back to Main Menu
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
