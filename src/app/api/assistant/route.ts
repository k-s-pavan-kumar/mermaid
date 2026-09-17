import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSessionEmail } from '@/lib/auth/session';
import { TOOL_SPECS, runTool } from '@/features/assistant/tools';
import { todayIso, HOME_TZ } from '@/lib/tz/today';

export const runtime = 'nodejs';

/**
 * Meri, the in-app assistant.
 *
 * Talks to any OpenAI-compatible chat-completions endpoint — Groq by
 * default (see .env.example) — and is given the same tools the UI exposes,
 * so "raise an invoice for SRRD Labs for 12 hours at ₹1500" ends up as a
 * real draft invoice rather than a paragraph describing one.
 *
 * Deliberate constraints:
 *  - The API key is read server-side only; the browser never sees it.
 *  - The tool loop is capped (MAX_TURNS) so a confused model can't spin.
 *  - Tools run as the logged-in owner, never with an id the model supplies.
 */

const MAX_TURNS = 5;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

function systemPrompt(): string {
  return [
    'You are Meri, the assistant inside Meridian — a one-person studio OS for a security engineer in Hyderabad who freelances, ships side projects and teaches.',
    `Today is ${todayIso()} in ${HOME_TZ}. Currency is INR (₹) unless told otherwise.`,
    'Use the tools for anything involving real records: reading the day, creating tasks, projects, clients, invoices, quotations or meetings.',
    'Never invent data. If a tool returns nothing, say so plainly.',
    'Anything you create through a tool is saved as a DRAFT the user can edit — say what you created and where it went.',
    'Be brief. Short sentences, no preamble, no bullet-point walls. Amounts as ₹1,23,456.',
  ].join(' ');
}

export async function POST(req: Request) {
  const owner = await getSessionEmail();
  if (!owner) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const apiKey = process.env.GROQ_API_KEY;
  const baseUrl = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
  const model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';

  if (!apiKey) {
    return NextResponse.json(
      { error: 'The assistant is not configured. Set GROQ_API_KEY (and optionally GROQ_BASE_URL / GROQ_MODEL) in .env, then restart the dev server.' },
      { status: 503 }
    );
  }

  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request body.' }, { status: 400 });
  }

  const history = (body.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-12)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt() }, ...history];
  const effects: { label: string; href?: string }[] = [];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, tools: TOOL_SPECS, tool_choice: 'auto', temperature: 0.2 }),
      });

      if (!res.ok) {
        const detail = await res.text();
        return NextResponse.json(
          { error: `The model endpoint returned ${res.status}.`, detail: detail.slice(0, 400) },
          { status: 502 }
        );
      }

      const data = await res.json();
      const choice = data.choices?.[0]?.message as ChatMessage | undefined;
      if (!choice) return NextResponse.json({ error: 'Empty response from the model.' }, { status: 502 });

      messages.push(choice);

      const calls = choice.tool_calls ?? [];
      if (calls.length === 0) {
        return NextResponse.json({ reply: choice.content ?? '', effects });
      }

      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          // A malformed argument blob is the model's problem to fix; hand
          // the error back rather than throwing the whole request away.
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Arguments were not valid JSON.' }) });
          continue;
        }

        try {
          const result = await runTool(call.function.name, args, owner);
          if (result.effect) effects.push(result.effect);
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result.data) });
        } catch (err) {
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ error: err instanceof Error ? err.message : 'Tool failed.' }),
          });
        }
      }

      // Anything the tools wrote is now stale in the RSC cache.
      if (effects.length > 0) revalidatePath('/', 'layout');
    }

    return NextResponse.json({ reply: "I got stuck going back and forth on that one — try asking for one thing at a time.", effects });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'The assistant request failed.' },
      { status: 500 }
    );
  }
}
