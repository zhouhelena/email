"use client";

import { useState, useEffect } from "react";

interface CronLogEntry {
  timestamp: string;
  status: "success" | "error";
  message: string;
  processed?: number;
  results?: any[];
}

interface CronStatusResponse {
  ok: boolean;
  logs: CronLogEntry[];
  lastRun: string | null;
  isHealthy: boolean;
  error?: string;
}

export function CronStatus() {
  const [cronStatus, setCronStatus] = useState<CronStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCronStatus = async () => {
    try {
      const response = await fetch("/api/cron-status");
      const data: CronStatusResponse = await response.json();
      setCronStatus(data);
    } catch (error) {
      setCronStatus({
        ok: false,
        logs: [],
        lastRun: null,
        isHealthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCronStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchCronStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
        <div className="text-sm text-gray-500">loading cron status...</div>
      </div>
    );
  }

  if (!cronStatus || !cronStatus.ok) {
    return (
      <div className="mt-8 p-6 border border-red-200 rounded-lg bg-red-50">
        <h3 className="text-lg font-light text-gray-900 mb-2">cron status</h3>
        <div className="text-sm text-red-600">
          error: {cronStatus?.error || "Failed to fetch cron status"}
        </div>
      </div>
    );
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getTimeSince = (timestamp: string) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    window.location.hostname === "localhost";
  const showHealthyInDev = isDevelopment && cronStatus.logs.length === 0;

  return (
    <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-light text-gray-900">cron status</h3>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              showHealthyInDev
                ? "bg-yellow-500"
                : cronStatus.isHealthy
                ? "bg-green-500"
                : "bg-red-500"
            }`}
          ></div>
          <span className="text-xs text-gray-600">
            {showHealthyInDev
              ? "dev mode"
              : cronStatus.isHealthy
              ? "healthy"
              : "unhealthy"}
          </span>
        </div>
      </div>

      {cronStatus.lastRun && (
        <div className="text-sm text-gray-600 mb-4">
          last run: {formatTime(cronStatus.lastRun)} (
          {getTimeSince(cronStatus.lastRun)})
        </div>
      )}

      <div className="text-xs text-gray-500 mb-3">
        runs every 5 minutes • automatically processes emails
      </div>

      {cronStatus.logs.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700">
            recent activity
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {cronStatus.logs.slice(0, 5).map((log, index) => (
              <div
                key={index}
                className="flex justify-between items-start text-xs"
              >
                <div className="flex-1 mr-2">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${
                      log.status === "success" ? "bg-green-400" : "bg-red-400"
                    }`}
                  ></span>
                  <span className="text-gray-700">{log.message}</span>
                </div>
                <span className="text-gray-500">
                  {getTimeSince(log.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-500">No recent activity</div>
      )}
    </div>
  );
}
