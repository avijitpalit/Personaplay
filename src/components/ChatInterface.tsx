import React, { useState, useRef, useEffect } from 'react';
import { Message, getChatResponse, generateImage, generateCharacterDNA, generateVisualPrompt, generateInitialSetup, getUserAutomatedReply } from '../lib/gemini';
import { Send, ArrowLeft, Loader2, User, Sparkles, Image as ImageIcon, Eye, EyeOff, Save, CheckCircle2, Settings, Info, Clock, FileText, X, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { Session, saveSession as persistSession } from '../lib/storage';

interface ChatInterfaceProps {
  scenario: string;
  initialSession?: Session | null;
  initialApiBaseUrl: string;
  initialUseInternalApi: boolean;
  onBack: () => void;
}

export default function ChatInterface({ scenario, initialSession, initialApiBaseUrl, initialUseInternalApi, onBack }: ChatInterfaceProps) {
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
  const [imageWidth, setImageWidth] = useState<number>(initialSession?.imageWidth || 720);
  const [imageHeight, setImageHeight] = useState<number>(initialSession?.imageHeight || 1280);
  const [imageSteps, setImageSteps] = useState<number>(initialSession?.imageSteps || 9);
  const [showChat, setShowChat] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [statusBarMessage, setStatusBarMessage] = useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<{ type: 'info' | 'error' | 'warn'; message: string; timestamp: string }[]>(() => {
    return (window as any).__captured_logs || [];
  });
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

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
    if (!isAutoReplyEnabled || isLoading || isGeneratingAutoReply || isGeneratingPrompt || isGeneratingImage) return;

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

          if (result.updatedMemories) {
            setMemoryBank(result.updatedMemories);
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
          setIsLoading(false);
          setStatusBarMessage(null);
        }
      };
      triggerAiReply();
    }
  }, [isAutoReplyEnabled, messages, isLoading, isGeneratingAutoReply, isGeneratingPrompt, isGeneratingImage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

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
        imageWidth,
        imageHeight,
        imageSteps
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
  }, [messages, characterDNA, bgImage, currentVisualPrompt, apiBaseUrl, imageWidth, imageHeight, imageSteps, memoryBank]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', text: input.trim() };
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

    if (result.updatedMemories) {
      setMemoryBank(result.updatedMemories);
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
      const result = await generateImage(apiBaseUrl, currentVisualPrompt, imageWidth, imageHeight, imageSteps);
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
              <span className="text-[9px] uppercase tracking-[0.2em] text-accent font-bold mt-1">Mature & Immersive</span>
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
                  <div className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider text-white/40 font-bold">API Mode</span>
                      <span className="text-xs text-white/60">{useInternalApi ? "Internal (Gemini API)" : "External (Custom URL)"}</span>
                    </div>
                    <button
                      onClick={() => setUseInternalApi(!useInternalApi)}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-300 focus:outline-none ${useInternalApi ? 'bg-accent' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${useInternalApi ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {!useInternalApi && (
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">API Base URL</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={apiBaseUrl}
                          onChange={e => setApiBaseUrl(e.target.value)}
                          placeholder="http://your-api-base-url"
                          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent/50"
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
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Height</label>
                    <input 
                      type="number"
                      value={imageHeight}
                      onChange={e => setImageHeight(parseInt(e.target.value) || 1280)}
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Steps</label>
                    <input 
                      type="number"
                      value={imageSteps}
                      onChange={e => setImageSteps(parseInt(e.target.value) || 9)}
                      className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/50"
                    />
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
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="flex flex-col gap-2 items-start">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center border bg-white/5 border-white/20">
                <Sparkles size={14} className="text-accent md:w-[18px] md:h-[18px]" />
              </div>
              <div className="flex gap-4 items-center glass-panel px-5 py-4 rounded-2xl md:rounded-[1.75rem] border border-white/10 shadow-lg shadow-accent/5 backdrop-blur-xl">
                <div className="flex items-center gap-1.5 justify-center">
                  <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></span>
                  <span className="w-2 h-2 rounded-full bg-accent/80 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}></span>
                  <span className="w-2 h-2 rounded-full bg-accent/50 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}></span>
                </div>
                <div className="w-[1px] h-4 bg-white/10" />
                <span className="text-xs md:text-sm italic text-white/60 animate-pulse tracking-wide font-serif">
                  Choosing words carefully...
                </span>
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
