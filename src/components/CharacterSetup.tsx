import React, { useState, useEffect } from 'react';
import { Sparkles, Wand2, Flame, History, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Session, getSessions, deleteSession } from '../lib/storage';

interface CharacterSetupProps {
  onStart: (scenario: string, useExternalApi: boolean, apiBaseUrl: string) => void;
  onLoadSession: (session: Session) => void;
  initialApiBaseUrl?: string;
}

export default function CharacterSetup({ onStart, onLoadSession, initialApiBaseUrl = 'https://odorful-hsiu-unmaledictory.ngrok-free.dev' }: CharacterSetupProps) {
  const [scenario, setScenario] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [apiBaseUrl, setApiBaseUrl] = useState(initialApiBaseUrl);

  useEffect(() => {
    setSessions(getSessions());
  }, []);

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteSession(id);
    setSessions(getSessions());
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-20 min-h-screen flex flex-col justify-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-full bg-accent/10 text-accent border border-accent/20">
            <Flame size={40} />
          </div>
        </div>
        <h1 className="text-6xl font-serif italic mb-4 text-white tracking-tight">Set the Scene</h1>
        <p className="text-xl text-white/60 font-light">Describe the character, the setting, and the mood of your roleplay.</p>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-panel p-8 rounded-[2.5rem] shadow-2xl mb-12"
      >
        <div className="space-y-6">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.3em] text-white/40 mb-4 font-bold">Roleplay Scenario & Character Details</label>
            <textarea 
              value={scenario}
              onChange={e => setScenario(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 focus:outline-none focus:border-accent/50 min-h-[250px] text-lg leading-relaxed placeholder:text-white/20 transition-all resize-none"
              placeholder="Example: I'm meeting a mysterious stranger at a dimly lit jazz club for our first date. They are sophisticated, slightly dangerous, and very charming. The air is thick with the smell of rain and expensive perfume..."
            />
          </div>

          <div className="space-y-4 pt-2 border-t border-white/5">
            <div className="flex flex-col gap-2 p-4 bg-white/5 rounded-2xl border border-white/10">
              <label className="text-[10px] uppercase tracking-wider text-white/40 font-bold">API Base URL</label>
              <input 
                type="text"
                value={apiBaseUrl}
                onChange={e => setApiBaseUrl(e.target.value)}
                placeholder="http://your-api-base-url"
                className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent/50"
              />
              <p className="text-[9px] text-white/30 italic">Endpoints used: /t2t and /generate</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 text-xs text-white/30 italic px-2">
            <Sparkles size={14} className="text-accent" />
            <span>The AI will adapt to your tone and the complexity of your description.</span>
          </div>

          <button 
            disabled={!scenario.trim() || scenario.length < 10 || !apiBaseUrl.trim()}
            onClick={() => onStart(scenario, true, apiBaseUrl)}
            className="w-full bg-accent text-white py-5 rounded-2xl font-bold text-lg hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-3 group"
          >
            Enter the Story
            <Wand2 size={20} className="group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      </motion.div>

      {/* Saved Sessions Section */}
      <AnimatePresence>
        {sessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 px-2">
              <History size={18} className="text-accent" />
              <h2 className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-bold">Continue a Previous Story</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.sort((a, b) => b.updatedAt - a.updatedAt).map((session) => (
                <motion.div
                  key={session.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onLoadSession(session)}
                  className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-accent/30 text-left transition-all group relative overflow-hidden cursor-pointer"
                >
                  <div className="flex flex-col gap-2 relative z-10">
                    <div className="flex justify-between items-start">
                      <span className="text-white font-serif italic text-lg truncate pr-8">{session.name}</span>
                      <button 
                        onClick={(e) => handleDeleteSession(e, session.id)}
                        className="p-2 text-white/20 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-white/40 text-xs line-clamp-2 italic">"{session.scenario}"</p>
                    <div className="flex items-center gap-2 mt-2 text-[9px] text-white/20 uppercase tracking-widest font-bold">
                      <Calendar size={10} />
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  {/* Background preview if available */}
                  {session.bgImage && (
                    <div className="absolute inset-0 z-0 opacity-10 group-hover:opacity-20 transition-opacity">
                      <img src={session.bgImage} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-r from-black to-transparent" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4 opacity-40 hover:opacity-100 transition-opacity">
        <div className="p-4 border border-white/10 rounded-2xl text-xs">
          <strong className="text-accent block mb-1">Mature Content</strong>
          This app supports mature, sophisticated roleplay. Be descriptive about the mood and chemistry you desire.
        </div>
        <div className="p-4 border border-white/10 rounded-2xl text-xs">
          <strong className="text-accent block mb-1">Pro Tip</strong>
          Mention specific personality traits, physical descriptions, and the immediate surroundings for the best experience.
        </div>
      </div>
    </div>
  );
}
