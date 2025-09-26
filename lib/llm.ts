import { z } from 'zod';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';

const provider = openai({ apiKey: process.env.OPENAI_API_KEY });
const modelId = process.env.AI_MODEL || 'gpt-4o-mini';

export const createCalendarEventTool = tool({
  name: 'create_calendar_event',
  description: 'Create a Google Calendar event with the provided details.',
  parameters: z.object({
    title: z.string(),
    description: z.string().optional(),
    startISO: z.string().describe('ISO 8601 date-time string including date and time.'),
    endISO: z.string().optional().describe('ISO 8601 date-time string for end time; omit if unknown.'),
    timezone: z.string().describe('IANA timezone, e.g., America/Los_Angeles.'),
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

export type CalendarEventProposal = z.infer<typeof createCalendarEventTool.parameters>;

export async function proposeCalendarEvent(args: {
  subject: string;
  text: string;
  timezone: string;
  attendees: { email: string; name?: string }[];
  gmailThreadId: string;
}): Promise<{ proposal: CalendarEventProposal | null; usage?: { promptTokens?: number; completionTokens?: number } }>
{
  const { subject, text, timezone, attendees, gmailThreadId } = args;

  const now = new Date();
  const system = `You are an assistant that reads email subjects and bodies and determines if the thread implies a meeting to schedule today or in the future. Only when confident and when a concrete date/time can be parsed should you create one calendar event by calling the create_calendar_event tool. If the email does not clearly request/schedule a meeting, or the date/time is ambiguous, abstain and do not call the tool.`;

  const instruction = [
    `- Prefer explicit ISO-like datetimes when extracting.`,
    `- Use the provided timezone strictly: ${timezone}.`,
    `- Only include attendees from the provided candidate list; do not invent emails.`,
    `- Exclude the current user if present.`,
    `- If start time is known but end time is not, omit endISO.`,
    `- If no reliable time/date is present, do NOT call the tool.`,
  ].join('\n');

  const prompt = [
    `Current datetime: ${now.toISOString()}`,
    `User timezone: ${timezone}`,
    `Subject: ${subject}`,
    `Candidates (To/Cc minus user): ${attendees.map(a => a.name ? `${a.name} <${a.email}>` : a.email).join(', ') || '(none)'}`,
    `Email body:`,
    text.slice(0, 8000),
  ].join('\n\n');

  const result = await generateText({
    model: provider(modelId),
    system,
    tools: { create_calendar_event: createCalendarEventTool },
    prompt: `${instruction}\n\n${prompt}`,
  });

  const usage = result.usage;

  const toolCalls = result.toolCalls || [];
  const call = toolCalls.find(c => c.toolName === 'create_calendar_event');
  if (!call) return { proposal: null, usage };

  // The AI SDK validates tool params against Zod, so .args should be typed
  const proposal = call.args as CalendarEventProposal;
  return { proposal, usage };
}
