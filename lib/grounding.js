// Grounding checks: does AI output stay within what the student actually said?
// These are heuristics. They catch common unsupported claims; they cannot prove
// a draft is fully accurate, so the student review step stays mandatory.

export const norm = s => String(s ?? '').toLowerCase().normalize('NFKD')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^a-z0-9+#.%'\s-]/g, ' ').replace(/\s+/g, ' ').trim();

const STOP = new Set('a an and the of to in on for with at by from as is are was were be been i my me we our you your it this that these those or into over about via using use used'.split(' '));
const tokens = s => norm(s).split(' ').filter(w => w.length > 1 && !STOP.has(w));

/** Flattens everything the student approved into one searchable string. */
export function profileCorpus(p = {}) {
  const parts = [p.name, p.email, p.school, p.eduLevel, p.gradYear, p.location, p.availability,
    ...(p.interests || []), ...(p.skills || []), ...(p.categories || []),
    ...(p.projects || []).flatMap(x => [x.name, x.role, x.desc, ...(x.skills || [])]),
    ...(p.experiences || []).flatMap(x => [x.type, x.title, x.org, x.when, x.desc]),
    ...Object.values(p.links || {})];
  return norm(parts.filter(Boolean).join(' \n '));
}

/**
 * True when `evidence` is present in `corpus`: either a normalized substring,
 * or at least 80% of its meaningful words appear in the corpus.
 */
export function isSupported(evidence, corpus) {
  const e = norm(evidence);
  if (!e) return false;
  if (corpus.includes(e)) return true;
  const t = tokens(e);
  if (!t.length) return false;
  const hit = t.filter(w => corpus.includes(w)).length;
  return hit / t.length >= 0.8;
}

// Terms that are risky to assert without evidence.
export const SKILL_TERMS = ['Python','Java','JavaScript','TypeScript','C++','C#','MATLAB','SQL','Swift','Kotlin','Rust','Go','HTML','CSS','React','Node.js','Next.js','Django','Flask','pandas','NumPy','SciPy','scikit-learn','PyTorch','TensorFlow','Keras','Jupyter','Git','GitHub','Linux','Docker','Kubernetes','AWS','GCP','Azure','Firebase','Figma','Tableau','Excel','Statistics','Machine learning','Deep learning','Computer vision','NLP','Bioinformatics','CAD','SolidWorks','Arduino','PCR','Western blot','Microscopy','Cell culture','Fiber photometry','Electrophysiology','fMRI','EEG','CRISPR','Flow cytometry','Spanish','French','Mandarin'];
const CREDENTIAL_PATTERNS = [
  [/\b(published|publication|co-?authored|first[- ]author|journal article|peer[- ]reviewed)\b/i, 'publication'],
  [/\b(award(?:ed)?|winner|won|first place|1st place|finalist|scholarship recipient|honou?rs?)\b/i, 'award'],
  [/\bgpa\b|\b[0-4]\.\d{1,2}\s*(?:\/\s*4(?:\.0)?)?\b/i, 'grades'],
  [/\b(certified|certification|licensed)\b/i, 'certification'],
  [/\b(led|founded|co-?founded|president|captain|director)\b/i, 'leadership'],
  [/\b\d+\s*(?:\+\s*)?(?:years?|months?)\s+of\b/i, 'duration'],
  [/\b(lab experience|research experience|worked in (?:a|the) lab)\b/i, 'research experience']
];

/**
 * Scans generated text for skills, credentials and figures that do not appear
 * in the student's profile (or, for figures, in the opportunity itself).
 * Returns [{type, text, reason}].
 */
export function findUnsupported(text, profile, opportunityText = '') {
  const corpus = profileCorpus(profile);
  const opp = norm(opportunityText);
  const body = String(text || '');
  const flags = [];
  const seen = new Set();
  const add = (type, t, reason) => { const k = type + '|' + norm(t); if (!seen.has(k)) { seen.add(k); flags.push({ type, text: t, reason }); } };

  for (const term of SKILL_TERMS) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^A-Za-z0-9+#])${esc}(?=$|[^A-Za-z0-9+#])`, term.length <= 3 ? '' : 'i');
    const m = body.match(re);
    if (!m) continue;
    if (corpus.includes(norm(term))) continue;
    // Mentioning a skill the opportunity asks for is fine only when phrased as a gap/learning goal.
    const idx = m.index;
    const ctx = body.slice(Math.max(0, idx - 80), idx + term.length + 20).toLowerCase();
    if (/(learn|learning|building experience|eager to|hope to|not yet|developing|interested in gaining)/.test(ctx)) continue;
    add('skill', term, `"${term}" is not in your profile.`);
  }

  for (const sentence of body.split(/(?<=[.!?])\s+|\n+/)) {
    for (const [re, kind] of CREDENTIAL_PATTERNS) {
      const m = sentence.match(re);
      if (!m) continue;
      if (isSupported(sentence, corpus)) continue;
      const word = norm(m[0]);
      if (corpus.includes(word)) continue;
      if (kind !== 'grades' && kind !== 'duration' && opp.includes(word)) continue;
      add('claim', sentence.trim().slice(0, 220), `Mentions ${kind} that isn't in your profile.`);
    }
  }

  for (const m of body.matchAll(/\b\d+(?:\.\d+)?\s*%|\b\d{2,}\b/g)) {
    const n = m[0].replace(/\s/g, '');
    if (corpus.includes(norm(n)) || opp.includes(norm(n))) continue;
    if (/^(19|20)\d\d$/.test(n)) continue; // years are usually dates
    add('figure', n, `The number ${n} doesn't appear in your profile.`);
  }
  return flags;
}
