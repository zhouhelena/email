'use client';

import { useState } from 'react';

interface ProcessResult {
  threadId: string;
  subject: string;
  status: 'created' | 'skipped' | 'error' | 'already_created';
  eventId?: string;
  eventLink?: string;
  title?: string;
  reason?: string;
  error?: string;
}

interface ProcessResponse {
  ok: boolean;
  processed: number;
  results: ProcessResult[];
  error?: string;
}

export function ProcessEmailsButton() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ProcessResponse | null>(null);

  const processEmails = async () => {
    setIsProcessing(true);
    setResults(null);

    try {
      const response = await fetch('/api/process-emails', { method: 'POST' });
      const data: ProcessResponse = await response.json();
      setResults(data);
    } catch (error) {
      setResults({
        ok: false,
        processed: 0,
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <button
        onClick={processEmails}
        disabled={isProcessing}
        className="px-8 py-4 bg-black text-white text-lg font-light rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing ? 'checking...' : 'check recent emails'}
      </button>

      {results && (
        <div className="mt-8 p-6 border border-gray-200 rounded-lg bg-gray-50">
          <h3 className="text-lg font-light text-gray-900 mb-4">results</h3>

          {results.ok ? (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                processed {results.processed} emails
              </p>

              {results.results.length > 0 && (
                <ul className="space-y-3">
                  {results.results.map((result, index) => (
                    <li key={index} className="flex justify-between items-start py-2 border-b border-gray-200 last:border-b-0">
                      <div className="flex-1 mr-4">
                        <div className="font-medium text-gray-900 text-sm">{result.subject}</div>
                        {result.status === 'created' && result.title && (
                          <div className="text-xs text-gray-500 mt-1">
                            created: {result.title}
                          </div>
                        )}
                        {result.status === 'already_created' && result.title && (
                          <div className="text-xs text-blue-500 mt-1">
                            already exists: {result.title}
                          </div>
                        )}
                        {result.status === 'skipped' && result.reason && (
                          <div className="text-xs text-gray-500 mt-1">
                            {result.reason}
                          </div>
                        )}
                        {result.status === 'error' && result.error && (
                          <div className="text-xs text-red-500 mt-1">
                            {result.error}
                          </div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-light ${
                        result.status === 'created'
                          ? 'bg-green-100 text-green-700'
                          : result.status === 'already_created'
                          ? 'bg-blue-100 text-blue-700'
                          : result.status === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-200 text-gray-700'
                      }`}>
                        {result.status === 'already_created' ? 'already created' : result.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-red-500">
              error: {results.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}