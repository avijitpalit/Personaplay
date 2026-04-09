import { Message } from './gemini';

export interface Session {
  id: string;
  name: string;
  scenario: string;
  history: Message[];
  characterDNA: string | null;
  bgImage: string | null;
  lastVisualPrompt: string | undefined;
  apiBaseUrl: string;
  useExternalApi?: boolean;
  imageWidth: number;
  imageHeight: number;
  imageSteps: number;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'roleplay_sessions';

export function saveSession(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Session {
  const sessions = getSessions();
  const now = Date.now();
  
  let updatedSession: Session;
  
  if (session.id) {
    const index = sessions.findIndex(s => s.id === session.id);
    if (index !== -1) {
      updatedSession = {
        ...sessions[index],
        ...session,
        id: session.id,
        updatedAt: now
      };
      sessions[index] = updatedSession;
    } else {
      updatedSession = {
        ...session,
        id: session.id,
        createdAt: now,
        updatedAt: now
      } as Session;
      sessions.push(updatedSession);
    }
  } else {
    updatedSession = {
      ...session,
      id: Math.random().toString(36).substring(2, 11),
      createdAt: now,
      updatedAt: now
    } as Session;
    sessions.push(updatedSession);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  return updatedSession;
}

export function getSessions(): Session[] {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('Failed to parse sessions', e);
    return [];
  }
}

export function getSession(id: string): Session | undefined {
  return getSessions().find(s => s.id === id);
}

export function deleteSession(id: string): void {
  const sessions = getSessions().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}
