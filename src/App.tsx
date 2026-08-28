import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import CharacterSetup from './components/CharacterSetup';
import ChatInterface from './components/ChatInterface';
import { Session, getSession, getSessions } from './lib/storage';

function SetupPage({ 
  apiBaseUrl, 
  setApiBaseUrl, 
  setSelectedModel 
}: { 
  apiBaseUrl: string; 
  setApiBaseUrl: (url: string) => void;
  setSelectedModel: (m: string) => void;
}) {
  const navigate = useNavigate();

  const handleStart = (newScenario: string, internalMode: boolean, baseUrl: string, model: string) => {
    setApiBaseUrl(baseUrl);
    setSelectedModel(model);
    navigate('/chat', {
      state: {
        scenario: newScenario,
        useInternalApi: internalMode,
        apiBaseUrl: baseUrl,
        selectedModel: model,
      }
    });
  };

  const handleLoadSession = (session: Session) => {
    setApiBaseUrl(session.apiBaseUrl || 'https://odorful-hsiu-unmaledictory.ngrok-free.dev');
    setSelectedModel((session as any).selectedModel || 'gemma-4-31b-it');
    navigate(`/chat?session=${encodeURIComponent(session.id)}`, {
      state: {
        session,
        scenario: session.scenario,
        useInternalApi: session.useInternalApi || false,
        apiBaseUrl: session.apiBaseUrl || 'https://odorful-hsiu-unmaledictory.ngrok-free.dev',
        selectedModel: (session as any).selectedModel || 'gemma-4-31b-it',
      }
    });
  };

  return (
    <>
      <CharacterSetup 
        onStart={handleStart} 
        onLoadSession={handleLoadSession} 
        initialApiBaseUrl={apiBaseUrl}
      />
      <footer className="relative z-10 py-8 text-center text-white/20 text-[10px] uppercase tracking-[0.2em]">
        Powered by Gemini AI • PersonaPlay Mature
      </footer>
    </>
  );
}

function ChatPage({ 
  defaultApiBaseUrl, 
  defaultModel 
}: { 
  defaultApiBaseUrl: string; 
  defaultModel: string; 
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const sessionId = searchParams.get('session');
  const state = (location.state as any) || {};

  // Resolve session from state, query param, or fallback to storage
  const loadedSession: Session | null = state.session || (sessionId ? getSession(sessionId) || null : null);
  const scenario: string | null = state.scenario || loadedSession?.scenario || null;
  const apiBaseUrl: string = state.apiBaseUrl || loadedSession?.apiBaseUrl || defaultApiBaseUrl;
  const useInternalApi: boolean = state.useInternalApi ?? loadedSession?.useInternalApi ?? false;
  const selectedModel: string = state.selectedModel || (loadedSession as any)?.selectedModel || defaultModel;

  // If there is no scenario and no session found, try the most recent session or redirect to setup
  if (!scenario && !loadedSession) {
    const recent = getSessions();
    if (recent.length > 0) {
      return (
        <ChatInterface 
          scenario={recent[0].scenario} 
          initialSession={recent[0]}
          initialApiBaseUrl={recent[0].apiBaseUrl || defaultApiBaseUrl}
          initialUseInternalApi={recent[0].useInternalApi || false}
          selectedModel={(recent[0] as any).selectedModel || defaultModel}
          onBack={() => navigate('/')} 
        />
      );
    }
    return <Navigate to="/" replace />;
  }

  return (
    <ChatInterface 
      scenario={scenario!} 
      initialSession={loadedSession}
      initialApiBaseUrl={apiBaseUrl}
      initialUseInternalApi={useInternalApi}
      selectedModel={selectedModel}
      onBack={() => navigate('/')} 
    />
  );
}

export default function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState('https://odorful-hsiu-unmaledictory.ngrok-free.dev');
  const [selectedModel, setSelectedModel] = useState('gemma-4-31b-it');

  return (
    <BrowserRouter>
      <div className="min-h-screen relative overflow-x-hidden">
        <div className="atmosphere" />
        
        <main className="relative z-10">
          <Routes>
            <Route 
              path="/" 
              element={
                <SetupPage 
                  apiBaseUrl={apiBaseUrl} 
                  setApiBaseUrl={setApiBaseUrl} 
                  setSelectedModel={setSelectedModel} 
                />
              } 
            />
            <Route 
              path="/chat" 
              element={
                <ChatPage 
                  defaultApiBaseUrl={apiBaseUrl} 
                  defaultModel={selectedModel} 
                />
              } 
            />
            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
