import { promises as fs } from 'fs';
import path from 'path';

interface CronLogEntry {
  timestamp: string;
  status: 'success' | 'error';
  message: string;
  processed?: number;
  results?: any[];
}

const LOG_FILE = '/tmp/claude/cron-log.json';

export async function addCronLog(entry: CronLogEntry) {
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });

    let logs: CronLogEntry[] = [];
    try {
      const data = await fs.readFile(LOG_FILE, 'utf-8');
      logs = JSON.parse(data);
    } catch {
      // File doesn't exist or is invalid, start fresh
    }

    logs.push(entry);

    // Keep only the last 50 entries
    if (logs.length > 50) {
      logs = logs.slice(-50);
    }

    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Failed to write cron log:', error);
  }
}

export async function getCronLogs(): Promise<CronLogEntry[]> {
  try {
    const data = await fs.readFile(LOG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}