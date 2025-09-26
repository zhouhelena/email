import Link from 'next/link';

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation */}
      <nav className="flex justify-between items-center p-6">
        <Link
          href="/dashboard"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          ← back to dashboard
        </Link>
        <div className="flex gap-4">
          <Link
            href="/api/auth/signout"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            sign out
          </Link>
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            open gcal
          </a>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-6 pb-12">
        <div className="space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-light text-gray-900 tracking-tight mb-4">
              about
            </h1>
            <p className="text-lg text-gray-600">
              Automatically turn your emails into calendar events
            </p>
          </div>

          <div className="space-y-6">
            <section>
              <h2 className="text-xl font-medium text-gray-900 mb-3">Automated Processing</h2>
              <div className="text-gray-700 space-y-2">
                <p>
                  The app runs automatically every 5 minutes using <strong>Vercel Cron Jobs</strong>,
                  scanning your Gmail inbox for new emails containing meeting or event information.
                </p>
                <p>
                  In development, a custom interval-based system replicates the production cron behavior,
                  ensuring consistent functionality across environments.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium text-gray-900 mb-3">AI-Powered Event Detection</h2>
              <div className="text-gray-700 space-y-2">
                <p>
                  Uses <strong>OpenAI GPT-4</strong> via the Vercel AI SDK to intelligently parse email content
                  and extract event details like dates, times, locations, and attendees.
                </p>
                <p>
                  All AI interactions are tracked with <strong>Langfuse observability</strong> for
                  monitoring performance, costs, and debugging.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium text-gray-900 mb-3">Smart Duplicate Prevention</h2>
              <div className="text-gray-700 space-y-2">
                <p>
                  Advanced duplicate detection using multiple algorithms:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li><strong>Gmail Thread Tracking</strong> - Links events to specific email threads</li>
                  <li><strong>Title Similarity Analysis</strong> - Levenshtein distance + word overlap matching</li>
                  <li><strong>Smart Text Normalization</strong> - Handles prefixes (Re:, Fwd:) and formatting</li>
                  <li><strong>Temporal Filtering</strong> - Only checks recently created events</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium text-gray-900 mb-3">Technical Architecture</h2>
              <div className="text-gray-700 space-y-2">
                <p>Built with modern serverless architecture:</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li><strong>Next.js 15</strong> with App Router and Turbopack</li>
                  <li><strong>NextAuth.js</strong> for secure Google OAuth with encrypted token storage</li>
                  <li><strong>Google APIs</strong> - Gmail (read-only) and Calendar (full access)</li>
                  <li><strong>Vercel Deployment</strong> with cron jobs and edge functions</li>
                  <li><strong>TypeScript</strong> for type safety and better developer experience</li>
                  <li><strong>Tailwind CSS</strong> for responsive, utility-first styling</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium text-gray-900 mb-3">Session Management</h2>
              <div className="text-gray-700 space-y-2">
                <p>
                  Uses file-based session tracking in development to enable automatic processing
                  without a database. Sessions are automatically cleaned up after 24 hours.
                </p>
                <p>
                  The manual "check recent emails" button provides on-demand processing and
                  integrates seamlessly with the automated cron system.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium text-gray-900 mb-3">Privacy & Security</h2>
              <div className="text-gray-700 space-y-2">
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Gmail access is read-only with minimal required scopes</li>
                  <li>No email content is stored permanently on servers</li>
                  <li>OAuth tokens are encrypted using NextAuth.js security standards</li>
                  <li>All API calls use secure HTTPS with proper authentication</li>
                  <li>Access can be revoked anytime through Google account settings</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-medium text-gray-900 mb-3">Event Intelligence</h2>
              <div className="text-gray-700 space-y-2">
                <p>
                  Smart event creation with context-aware defaults:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Automatic duration setting (30min calls, 1hr meetings, 1.5hr meals)</li>
                  <li>Timezone detection and proper ISO datetime formatting</li>
                  <li>Attendee inference from email To/Cc fields when not specified</li>
                  <li>Enhanced descriptions with Gmail thread links for reference</li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}