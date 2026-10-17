// Résumé text -> structured profile suggestions.
// Every extracted item carries the résumé line it came from; items whose
// evidence can't be found in the résumé are returned with verified:false so
// the client can leave them unchecked.
import { route, bad, clip } from '../lib/http.js';
import { generateJSON, geminiModel } from '../lib/gemini.js';
import { norm, isSupported } from '../lib/grounding.js';
import { UNTRUSTED_NOTE } from '../lib/input.js';

const S = { type: 'STRING' };
const ITEM = { type: 'OBJECT', properties: { value: S, evidence: S }, required: ['value', 'evidence'] };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { ...ITEM, nullable: true }, email: { ...ITEM, nullable: true }, school: { ...ITEM, nullable: true },
    eduLevel: { type: 'OBJECT', nullable: true, properties: { value: { type: 'STRING', enum: ['high school', 'undergraduate', 'graduate', 'other'] }, evidence: S }, required: ['value', 'evidence'] },
    gradYear: { ...ITEM, nullable: true }, location: { ...ITEM, nullable: true },
    skills: { type: 'ARRAY', items: ITEM },
    interests: { type: 'ARRAY', items: ITEM },
    projects: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: S, role: S, desc: S, skills: { type: 'ARRAY', items: S }, evidence: S }, required: ['name', 'desc', 'evidence'] } },
    experiences: { type: 'ARRAY', items: { type: 'OBJECT', properties: { type: { type: 'STRING', enum: ['Research', 'Work', 'Volunteering', 'Extracurricular', 'Leadership', 'Certification', 'Coursework'] }, title: S, org: S, when: S, desc: S, evidence: S }, required: ['type', 'title', 'evidence'] } },
    github: { ...ITEM, nullable: true }
  },
  required: ['skills', 'interests', 'projects', 'experiences']
};

const SYSTEM = `You extract structured profile data from a student's résumé for a student opportunity app.
Rules:
- Extract only what the résumé explicitly states. Do not infer, embellish, upgrade titles, or add skills that are not written.
- For every item, "evidence" must be a short verbatim quote (under 25 words) copied from the résumé that supports it.
- "interests" only when the résumé states an interest, objective, or field of study; otherwise return an empty list.
- If a field is absent, return null (or an empty list). Never guess an email, year, or school.
- Project and experience descriptions must paraphrase the résumé closely and must not add outcomes, numbers, or tools that aren't written.
${UNTRUSTED_NOTE}`;

function check(item, resume) {
  if (!item || typeof item !== 'object') return null;
  const value = clip(item.value ?? item.name ?? item.title, 300).trim();
  if (!value) return null;
  const evidence = clip(item.evidence, 400);
  return { ...item, value, evidence, verified: isSupported(evidence, resume) };
}

export default route(async req => {
  const text = clip(req.body.text, 20000);
  if (text.trim().length < 40) throw bad('Résumé text is too short to read.');
  const raw = await generateJSON({ system: SYSTEM, prompt: `<resume>\n${text}\n</resume>`, schema: SCHEMA, temperature: 0.1 });
  const resume = norm(text);
  const one = k => check(raw?.[k], resume);
  const many = k => (Array.isArray(raw?.[k]) ? raw[k] : []).slice(0, 40).map(i => check(i, resume)).filter(Boolean);

  const out = {
    name: one('name'), email: one('email'), school: one('school'), eduLevel: one('eduLevel'),
    gradYear: one('gradYear'), location: one('location'), github: one('github'),
    skills: many('skills'), interests: many('interests'),
    projects: (Array.isArray(raw?.projects) ? raw.projects : []).slice(0, 8).map(p => ({
      name: clip(p?.name, 140), role: clip(p?.role, 80), desc: clip(p?.desc, 900),
      skills: Array.isArray(p?.skills) ? p.skills.slice(0, 12).map(s => clip(s, 60)) : [],
      evidence: clip(p?.evidence, 400), verified: isSupported(p?.evidence, resume) && isSupported(p?.name, resume)
    })).filter(p => p.name && p.desc),
    experiences: (Array.isArray(raw?.experiences) ? raw.experiences : []).slice(0, 12).map(x => ({
      type: clip(x?.type, 40) || 'Work', title: clip(x?.title, 140), org: clip(x?.org, 140), when: clip(x?.when, 60), desc: clip(x?.desc, 700),
      evidence: clip(x?.evidence, 400), verified: isSupported(x?.evidence, resume)
    })).filter(x => x.title)
  };
  // Hard rules: contact details must appear verbatim, or they are dropped.
  if (out.email && !text.toLowerCase().includes(out.email.value.toLowerCase())) out.email = null;
  if (out.gradYear && !/^(19|20)\d\d$/.test(out.gradYear.value)) out.gradYear = null;
  // Skills listed for a project must be explicitly written in the résumé.
  out.projects.forEach(p => { p.skills = p.skills.filter(s => resume.includes(norm(s))); });

  const unverified = [out.name, out.email, out.school, out.eduLevel, out.gradYear, out.location, ...out.skills, ...out.interests, ...out.projects, ...out.experiences].filter(x => x && x.verified === false).length;
  return { profile: out, unverified, model: geminiModel() };
});
