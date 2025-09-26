import { createOpenAI } from "@ai-sdk/openai";
import { generateText, tool } from "ai";
import { z } from "zod";
import { observeOpenAI } from "langfuse";

// Initialize Langfuse
const langfuse = observeOpenAI(createOpenAI({
  apiKey: process.env.OPENAI_API_KEY
}), {
  clientInitParams: {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_HOST!,
  }
});

const provider = langfuse;
const modelId = process.env.AI_MODEL || "gpt-4o-mini";

export const createCalendarEventTool = tool({
  description: "Create a Google Calendar event with the provided details.",
  parameters: z.object({
    title: z.string(),
    description: z.string().optional(),
    startISO: z
      .string()
      .describe("ISO 8601 date-time string including date and time."),
    endISO: z
      .string()
      .optional()
      .describe("ISO 8601 date-time string for end time; omit if unknown."),
    timezone: z.string().describe("IANA timezone, e.g., America/Los_Angeles."),
    attendees: z
      .array(
        z.object({
          email: z.string(),
          name: z.string().optional(),
        })
      )
      .default([]),
    source: z.object({
      gmailThreadId: z.string(),
      subject: z.string(),
    }),
  }),
});

export type CalendarEventProposal = z.infer<
  typeof createCalendarEventTool.parameters
>;

export async function proposeCalendarEvent(args: {
  subject: string;
  text: string;
  timezone: string;
  attendees: { email: string; name?: string }[];
  gmailThreadId: string;
}): Promise<{
  proposal: CalendarEventProposal | null;
  usage?: { promptTokens?: number; completionTokens?: number };
}> {
  const { subject, text, timezone, attendees, gmailThreadId } = args;

  console.log(`[LLM] 📊 Analyzing email with Langfuse observability: "${subject.slice(0, 50)}..."`);

  const now = new Date();
  const system = `You are an assistant that reads email subjects and bodies and determines if the thread implies a meeting, event, or social gathering to schedule. You should be liberal in detecting these - they include meetings, lunches, dinners, appointments, calls, hangouts, study sessions, etc. When you detect such an event and can parse a date/time, create a calendar event by calling the create_calendar_event tool.

EXAMPLES of what to detect:
- "lunch tomorrow at 2pm"
- "meeting Friday at 10am"
- "coffee this afternoon"
- "dinner plans Saturday"
- "study session Tuesday 7pm"
- "call me tomorrow morning"
- "let's meet up next week"

If the email mentions any time-based social or professional activity, try to create an event.

IMPORTANT TIME PARSING RULES:
- Always use the provided timezone for all dates/times
- For relative dates like "tomorrow", "next week", calculate from current datetime
- Convert all times to the user's timezone before creating ISO strings
- Use 24-hour format for startISO and endISO
- Include seconds in ISO format (e.g., "2024-01-15T14:00:00")
- Default meeting durations: 30min for calls, 1hr for meetings, 1.5hr for meals
- Morning = 9am, Afternoon = 2pm, Evening = 7pm if no specific time given`;

  const instruction = [
    `- Be liberal in detecting meetings, meals, appointments, and social events.`,
    `- For relative times like "tomorrow", "next week", use the current datetime to calculate the actual date.`,
    `- For incomplete times like "afternoon", use reasonable defaults (2pm for afternoon, 9am for morning, 7pm for evening).`,
    `- Use the provided timezone strictly: ${timezone}.`,
    `- CRITICAL: All startISO and endISO must be in format "YYYY-MM-DDTHH:MM:SS" (include seconds).`,
    `- CRITICAL: Times must be converted to ${timezone} timezone before creating ISO strings.`,
    `- Only include attendees from the provided candidate list; do not invent emails.`,
    `- Exclude the current user if present.`,
    `- If start time is known but end time is not, omit endISO.`,
    `- Default meeting duration: 30min for calls, 1hr for meetings, 1.5hr for meals.`,
    `- Double-check that dates make sense (not in the past unless explicitly mentioned).`,
  ].join("\n");

  const prompt = [
    `Current datetime: ${now.toISOString()}`,
    `User timezone: ${timezone}`,
    `Subject: ${subject}`,
    `Candidates (To/Cc minus user): ${
      attendees
        .map((a) => (a.name ? `${a.name} <${a.email}>` : a.email))
        .join(", ") || "(none)"
    }`,
    `Email body:`,
    text.slice(0, 8000),
  ].join("\n\n");

  const result = await generateText({
    model: provider(modelId),
    system,
    tools: { create_calendar_event: createCalendarEventTool },
    prompt: `${instruction}\n\n${prompt}`,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'proposeCalendarEvent',
      metadata: {
        gmailThreadId,
        subject: subject.slice(0, 100), // Truncate for privacy
        timezone,
        attendeeCount: attendees.length,
        textLength: text.length,
        operation: 'email-to-calendar-analysis'
      }
    }
  });

  const usage = result.usage;

  const toolCalls = result.toolCalls || [];
  const call = toolCalls.find((c) => c.toolName === "create_calendar_event");

  if (!call) {
    console.log(`[LLM] ❌ No calendar event detected in email: "${subject.slice(0, 50)}..."`);
    return { proposal: null, usage };
  }

  // The AI SDK validates tool params against Zod, so .args should be typed
  const proposal = call.args as CalendarEventProposal;
  console.log(`[LLM] ✅ Calendar event proposed: "${proposal.title}" (tracked in Langfuse)`);
  return { proposal, usage };
}
