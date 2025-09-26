interface UserSession {
  email: string;
  accessToken: string;
  refreshToken: string;
  lastSeen: Date;
}

// In-memory store for active user sessions (dev only)
const activeSessions = new Map<string, UserSession>();

export function addActiveSession(email: string, accessToken: string, refreshToken: string) {
  activeSessions.set(email, {
    email,
    accessToken,
    refreshToken,
    lastSeen: new Date()
  });
  console.log(`[SESSION-STORE] Added active session for ${email}`);
}

export function getActiveSessions(): UserSession[] {
  // Remove sessions older than 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (const [email, session] of activeSessions.entries()) {
    if (session.lastSeen < oneDayAgo) {
      activeSessions.delete(email);
      console.log(`[SESSION-STORE] Removed expired session for ${email}`);
    }
  }

  return Array.from(activeSessions.values());
}

export function updateSessionActivity(email: string) {
  const session = activeSessions.get(email);
  if (session) {
    session.lastSeen = new Date();
  }
}