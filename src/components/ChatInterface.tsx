import React, { useState, useRef, useEffect } from 'react';
import { Message, getChatResponse, generateImage, generateCharacterDNA, generateVisualPrompt, generateInitialSetup, getUserAutomatedReply, setGlobalModel } from '../lib/gemini';
import { Send, ArrowLeft, Loader2, User, Sparkles, Image as ImageIcon, Eye, EyeOff, Save, CheckCircle2, Settings, Info, Clock, FileText, X, Play, Pause, Brain, Heart, Sun, Moon, Sunset, Sunrise } from 'lucide-react';
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
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<string>('Auto');
  const [expandedThoughts, setExpandedThoughts] = useState<Record<number, boolean>>({});
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

  const getTimeOfDayString = () => {
    if (selectedTimeOfDay !== 'Auto') return selectedTimeOfDay;
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Morning';
    if (hour >= 12 && hour < 17) return 'Afternoon';
    if (hour >= 17 && hour < 21) return 'Sunset / Dusk';
    return 'Late Night / Midnight';
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
        useInternalApi ? undefined : { apiBaseUrl },
        getTimeOfDayString()
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
            getTimeOfDayString()
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
              result.updatedMemories || memoryBank,
              getTimeOfDayString()
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
  }, [isAutoReplyEnabled, messages, isLoading, isGeneratingAutoReply, isGeneratingPrompt, isGeneratingImage, lastSendFailed, selectedTimeOfDay]);

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
      const setup = await generateInitialSetup(scenario, useInternalApi ? undefined : { apiBaseUrl }, getTimeOfDayString());
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
        loraStrength
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
    if (!input.trim() || isLoading) return;

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
      getTimeOfDayString()
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
        result.updatedMemories || memoryBank,
        getTimeOfDayString()
      );
      setCurrentVisualPrompt(nextPrompt);
      setIsGeneratingPrompt(false);
      setStatusBarMessage(null);
    }
  };

  const handleRetry = async () => {
    if (messages.length === 0 || isLoading) return;
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
      currentVisualPrompt,
      getTimeOfDayString()
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
            </div>
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
                  <div className="flex flex-col gap-2 p-3 bg-black/30 rounded-xl border border-white/10">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-1.5">
                      <Clock size={12} className="text-accent" /> Time of Day & Ambiance
                    </label>
                    <select
                      value={selectedTimeOfDay}
                      onChange={(e) => setSelectedTimeOfDay(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent/50 text-white cursor-pointer font-medium"
                    >
                      <option value="Auto" className="bg-neutral-900 text-white">Auto System Local Time ({getTimeOfDayString()})</option>
                      <option value="Morning" className="bg-neutral-900 text-white">🌅 Morning (Fresh dawn sunlight)</option>
                      <option value="Afternoon" className="bg-neutral-900 text-white">☀️ Afternoon (Bright daylight)</option>
                      <option value="Sunset / Dusk" className="bg-neutral-900 text-white">🌇 Sunset / Dusk (Golden hour)</option>
                      <option value="Late Night / Midnight" className="bg-neutral-900 text-white">🌙 Late Night / Midnight (Cozy nocturnal mood)</option>
                    </select>
                    <p className="text-[10px] text-white/40 italic">Influences the character's energy, dialogue, and photo lighting.</p>
                  </div>

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
                <div className="flex flex-col gap-2 w-full">
                  {msg.role === 'model' && (msg.emotions || msg.thoughts) && (
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {msg.emotions && (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-pink-500/15 border border-pink-500/30 rounded-full text-[11px] text-pink-200 font-medium shadow-sm">
                          <Heart size={12} className="text-pink-400 fill-pink-400/30" />
                          <span>{msg.emotions}</span>
                        </div>
                      )}
                      {msg.thoughts && (
                        <button
                          onClick={() => setExpandedThoughts(prev => ({ ...prev, [i]: !prev[i] }))}
                          className="flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-100 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/30 px-3 py-1 rounded-full transition-all cursor-pointer font-medium shadow-sm"
                        >
                          <Brain size={12} className="text-purple-400 animate-pulse" />
                          <span>{expandedThoughts[i] ? "Hide Private Thoughts" : "Read Private Thoughts"}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {msg.role === 'model' && msg.thoughts && expandedThoughts[i] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3.5 mb-2 bg-purple-950/40 border border-purple-500/30 rounded-2xl text-xs text-purple-200/95 italic font-serif leading-relaxed shadow-lg shadow-purple-950/40 flex gap-2.5 items-start max-w-[90%]"
                    >
                      <Sparkles size={14} className="text-purple-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="text-[10px] uppercase font-sans font-bold tracking-wider text-purple-400/80 mb-1">Character Inner Monologue</div>
                        "{msg.thoughts}"
                      </div>
                    </motion.div>
                  )}

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
