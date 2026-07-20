import React, { useState } from 'react';
import CharacterSetup from './components/CharacterSetup';
import ChatInterface from './components/ChatInterface';
import { Session } from './lib/storage';

export default function App() {
  const [scenario, setScenario] = useState<string | null>(null);
  const [loadedSession, setLoadedSession] = useState<Session | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState('https://odorful-hsiu-unmaledictory.ngrok-free.dev');
  const [useInternalApi, setUseInternalApi] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemma-4-26b-a4b-it');
  const [loraStrength, setLoraStrength] = useState<number>(1.8);

  const handleStart = (newScenario: string, internalMode: boolean, baseUrl: string, model: string, strength: number) => {
    setScenario(newScenario);
    setUseInternalApi(internalMode);
    setApiBaseUrl(baseUrl);
    setSelectedModel(model);
    setLoraStrength(strength);
    setLoadedSession(null);
  };

  const handleLoadSession = (session: Session) => {
    setScenario(session.scenario);
    setUseInternalApi(session.useInternalApi || false);
    setApiBaseUrl(session.apiBaseUrl || 'https://odorful-hsiu-unmaledictory.ngrok-free.dev');
    setSelectedModel((session as any).selectedModel || 'gemma-4-26b-a4b-it');
    setLoraStrength(session.loraStrength !== undefined ? session.loraStrength : 1.8);
    setLoadedSession(session);
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <div className="atmosphere" />
      
      <main className="relative z-10">
        {!scenario ? (
          <CharacterSetup 
            onStart={handleStart} 
            onLoadSession={handleLoadSession} 
            initialApiBaseUrl={apiBaseUrl}
          />
        ) : (
          <ChatInterface 
            scenario={scenario} 
            initialSession={loadedSession}
            initialApiBaseUrl={apiBaseUrl}
            initialUseInternalApi={useInternalApi}
            selectedModel={selectedModel}
            initialLoraStrength={loraStrength}
            onBack={() => {
              setScenario(null);
              setLoadedSession(null);
            }} 
          />
        )}
      </main>

      {/* Subtle footer */}
      {!scenario && (
        <footer className="relative z-10 py-8 text-center text-white/20 text-[10px] uppercase tracking-[0.2em]">
          Powered by Gemini AI • PersonaPlay Mature
        </footer>
      )}
    </div>
  );
}
