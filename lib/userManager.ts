// Simple way to get authenticated users for dev cron
// In development, we'll use a file-based approach to track who has logged in

import { promises as fs } from 'fs';
import path from 'path';

const USERS_FILE = '/tmp/claude/authenticated-users.json';

interface AuthenticatedUser {
  email: string;
  accessToken: string;
  refreshToken: string;
  lastSeen: Date;
}

export async function saveAuthenticatedUser(email: string, accessToken: string, refreshToken: string) {
  try {
    await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });

    let users: AuthenticatedUser[] = [];
    try {
      const data = await fs.readFile(USERS_FILE, 'utf-8');
      users = JSON.parse(data);
    } catch {
      // File doesn't exist or is invalid, start fresh
    }

    // Remove existing user and add updated one
    users = users.filter(u => u.email !== email);
    users.push({
      email,
      accessToken,
      refreshToken,
      lastSeen: new Date()
    });

    // Keep only the last 10 users and remove users older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    users = users
      .filter(u => new Date(u.lastSeen) > oneDayAgo)
      .slice(-10);

    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(`[USER-MANAGER] Saved authenticated user: ${email}`);
  } catch (error) {
    console.error('[USER-MANAGER] Failed to save authenticated user:', error);
  }
}

export async function getAuthenticatedUsers(): Promise<AuthenticatedUser[]> {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    const users = JSON.parse(data);

    // Filter out users older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return users
      .filter((u: any) => new Date(u.lastSeen) > oneDayAgo)
      .map((u: any) => ({
        ...u,
        lastSeen: new Date(u.lastSeen)
      }));
  } catch {
    return [];
  }
}