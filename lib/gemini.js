// Server-side Gemini client. The API key is read from the environment and
// never sent to the browser.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class AIError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export function geminiConfigured() { return Boolean(process.env.GEMINI_API_KEY); }
export function geminiModel() { return process.env.GEMINI_MODEL || 'gemini-2.5-flash'; }

/**
 * Calls Gemini with a JSON response schema and returns the parsed object.
 * Throws AIError on missing config, timeouts, HTTP errors and malformed JSON.
 */
export async function generateJSON({ system, prompt, schema, temperature = 0.3, timeoutMs = 30000 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AIError('not_configured', 'Gemini is not configured on the server.', 503);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema }
      })
    });
  } catch (e) {
    throw new AIError(e.name === 'AbortError' ? 'timeout' : 'network', e.name === 'AbortError' ? 'Gemini took too long to respond.' : 'Could not reach Gemini.');
  } finally { clearTimeout(timer); }

  if (!res.ok) {
    // Do not echo the upstream body: it can contain request details.
    const code = res.status === 429 ? 'rate_limited' : res.status === 400 ? 'bad_request' : res.status === 403 ? 'forbidden' : 'upstream';
    throw new AIError(code, res.status === 429 ? 'Gemini rate limit reached. Try again in a minute.' : `Gemini returned an error (${res.status}).`, res.status === 429 ? 429 : 502);
  }

  const data = await res.json().catch(() => null);
  const cand = data?.candidates?.[0];
  if (!cand) throw new AIError('empty', data?.promptFeedback?.blockReason ? 'Gemini declined to answer this request.' : 'Gemini returned an empty response.');
  const text = (cand.content?.parts || []).map(p => p.text || '').join('').trim();
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { throw new AIError('malformed', 'Gemini returned a response that was not valid JSON.'); }
}
