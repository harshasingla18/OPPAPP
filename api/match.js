// Explains how an opportunity relates to a student's approved profile.
// Gemini writes the explanation; the server then checks that every piece of
// cited profile evidence really exists and downgrades anything it can't find.
import { route, clip } from '../lib/http.js';
import { generateJSON, geminiModel } from '../lib/gemini.js';
import { profileCorpus, isSupported } from '../lib/grounding.js';
import { cleanProfile, cleanOpportunity, UNTRUSTED_NOTE } from '../lib/input.js';

const S = { type: 'STRING' };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: S,
    relevance: { type: 'ARRAY', items: { type: 'OBJECT', properties: { point: S, profileEvidence: S }, required: ['point', 'profileEvidence'] } },
    requirements: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      requirement: S,
      status: { type: 'STRING', enum: ['confirmed', 'possible', 'unknown', 'gap'] },
      profileEvidence: { type: 'STRING', nullable: true },
      note: S
    }, required: ['requirement', 'status', 'note'] } },
    nextSteps: { type: 'ARRAY', items: S }
  },
  required: ['summary', 'relevance', 'requirements', 'nextSteps']
};

const SYSTEM = `You help a student understand how an opportunity relates to their approved profile.
Rules:
- Use only facts in STUDENT_PROFILE. Never assume skills, experience, grades, age, citizenship, or eligibility that are not stated there.
- "profileEvidence" must quote or closely restate a specific item from STUDENT_PROFILE. If you cannot point to one, use null.
- Requirement status:
  confirmed = the opportunity states the requirement AND the profile explicitly satisfies it;
  possible = partially supported or plausibly related, but not explicit;
  unknown = the opportunity does not state it clearly, or the profile is silent;
  gap = the opportunity clearly requires it and the profile clearly lacks it.
- Eligibility facts the profile doesn't cover (citizenship, age, GPA, enrollment details) are "unknown", never "confirmed" or "gap".
- Be encouraging but honest. Don't discourage the student based on assumptions. No percentages or scores.
- nextSteps: 2-4 concrete actions, such as confirming eligibility on the official page or adding a relevant project to the profile.
- Keep "summary" to two sentences.
${UNTRUSTED_NOTE}`;

export default route(async req => {
  const profile = cleanProfile(req.body.profile);
  const opp = cleanOpportunity(req.body.opportunity);
  const raw = await generateJSON({
    system: SYSTEM,
    prompt: `STUDENT_PROFILE (approved by the student):\n${JSON.stringify(profile)}\n\n<opportunity>\n${JSON.stringify(opp)}\n</opportunity>`,
    schema: SCHEMA
  });
  const corpus = profileCorpus(profile);
  let downgraded = 0;
  const relevance = (Array.isArray(raw?.relevance) ? raw.relevance : []).slice(0, 6)
    .map(r => ({ point: clip(r?.point, 300), profileEvidence: clip(r?.profileEvidence, 300) }))
    .filter(r => r.point)
    .filter(r => { const ok = isSupported(r.profileEvidence, corpus); if (!ok) downgraded++; return ok; });
  const requirements = (Array.isArray(raw?.requirements) ? raw.requirements : []).slice(0, 12).map(r => {
    let status = ['confirmed', 'possible', 'unknown', 'gap'].includes(r?.status) ? r.status : 'unknown';
    let note = clip(r?.note, 300);
    const ev = r?.profileEvidence ? clip(r.profileEvidence, 300) : null;
    if ((status === 'confirmed' || status === 'possible') && !isSupported(ev, corpus)) {
      status = 'unknown'; downgraded++;
      note = (note ? note + ' ' : '') + '(Gemini cited evidence that isn’t in your profile, so this was marked unknown.)';
    }
    return { requirement: clip(r?.requirement, 200), status, profileEvidence: ev, note };
  }).filter(r => r.requirement);
  return {
    summary: clip(raw?.summary, 500),
    relevance, requirements,
    nextSteps: (Array.isArray(raw?.nextSteps) ? raw.nextSteps : []).slice(0, 4).map(s => clip(s, 240)).filter(Boolean),
    downgraded, model: geminiModel()
  };
});
