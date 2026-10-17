// Drafts application materials grounded in the student's approved profile.
// Each factual claim must cite profile evidence; the server verifies those
// citations and scans the text for unsupported skills, credentials and figures.
import { route, bad, clip } from '../lib/http.js';
import { generateJSON, geminiModel } from '../lib/gemini.js';
import { profileCorpus, isSupported, findUnsupported } from '../lib/grounding.js';
import { cleanProfile, cleanOpportunity, oppText, UNTRUSTED_NOTE } from '../lib/input.js';

const DOCS = {
  outreach_email: 'a short outreach email (150-220 words) to the contact for this opportunity, with a subject line',
  research_inquiry: 'a research inquiry email (150-220 words) to a professor or lab manager asking about joining the lab, with a subject line',
  statement_of_interest: 'a statement of interest (200-300 words) explaining why the student wants this opportunity',
  experience_summary: 'a relevant-experience summary (100-180 words) highlighting the profile items most related to this opportunity',
  form_answer: 'an answer to the application question given in QUESTION (stay within any word limit it mentions; default 150 words)'
};

const S = { type: 'STRING' };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    subject: { type: 'STRING', nullable: true },
    body: S,
    claims: { type: 'ARRAY', items: { type: 'OBJECT', properties: { claim: S, profileEvidence: S }, required: ['claim', 'profileEvidence'] } },
    missingInfo: { type: 'ARRAY', items: S }
  },
  required: ['body', 'claims', 'missingInfo']
};

const SYSTEM = `You write application materials for a student, in the student's own voice.
Rules:
- Use ONLY facts in STUDENT_PROFILE. Never invent or upgrade skills, courses, grades, GPA, awards, publications, papers read, research experience, years of experience, titles, or outcomes.
- If something useful is missing from the profile, leave it out and list it in "missingInfo" as a short question for the student.
- List every factual statement about the student in "claims", each with "profileEvidence" quoting or closely restating the profile item that supports it.
- You may mention a skill the opportunity asks for that the student lacks only as something they are eager to learn.
- If eligibility for the student's education level is not stated in the opportunity, politely ask about it.
- Don't invent the recipient's name. Use the recipient role if given, otherwise a neutral greeting.
- No placeholder brackets. No generic flattery. Warm, specific, concise.
- "subject" only for emails; otherwise null.
${UNTRUSTED_NOTE}`;

export default route(async req => {
  const docType = String(req.body.docType || '');
  if (!DOCS[docType]) throw bad('Unknown document type.');
  const question = clip(req.body.question, 400);
  if (docType === 'form_answer' && !question) throw bad('Missing the form question.');
  const profile = cleanProfile(req.body.profile);
  const opp = cleanOpportunity(req.body.opportunity);

  const raw = await generateJSON({
    system: SYSTEM,
    prompt: `TASK: Write ${DOCS[docType]}.${question ? `\nQUESTION: ${question}` : ''}\n\nSTUDENT_PROFILE (approved by the student):\n${JSON.stringify(profile)}\n\n<opportunity>\n${JSON.stringify(opp)}\n</opportunity>`,
    schema: SCHEMA, temperature: 0.5
  });
  const body = clip(raw?.body, 6000).trim();
  if (!body) throw bad('Gemini returned an empty draft.');
  const corpus = profileCorpus(profile);

  const flags = [];
  for (const c of (Array.isArray(raw?.claims) ? raw.claims : []).slice(0, 25)) {
    const claim = clip(c?.claim, 300);
    if (claim && !isSupported(c?.profileEvidence, corpus) && !isSupported(claim, corpus)) {
      flags.push({ type: 'claim', text: claim, reason: 'Gemini couldn’t point to this in your profile.' });
    }
  }
  for (const f of findUnsupported(body, profile, oppText(opp))) {
    if (!flags.some(x => x.text === f.text)) flags.push(f);
  }
  return {
    subject: docType.endsWith('email') || docType === 'research_inquiry' ? clip(raw?.subject, 200) : null,
    body,
    missingInfo: (Array.isArray(raw?.missingInfo) ? raw.missingInfo : []).slice(0, 6).map(s => clip(s, 240)).filter(Boolean),
    flags, model: geminiModel()
  };
});
