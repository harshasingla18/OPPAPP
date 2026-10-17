import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileCorpus, isSupported, findUnsupported } from '../lib/grounding.js';

const profile = {
  name: 'Alex Rivera', eduLevel: 'undergraduate', school: 'Pacific Northwest State University',
  skills: ['Python', 'pandas', 'Git', 'Statistics'], interests: ['Neuroscience'],
  projects: [{ name: 'Gene-expression clustering', role: 'Team of 3', desc: 'Cleaned a public RNA-seq dataset in pandas and compared k-means and hierarchical clustering.', skills: ['Python'] }],
  experiences: [{ type: 'Volunteering', title: 'Science outreach volunteer', org: 'Library STEM night', when: '2025', desc: 'Run hands-on science activities.' }]
};
const corpus = profileCorpus(profile);

test('supported evidence passes', () => {
  assert.ok(isSupported('compared k-means and hierarchical clustering', corpus));
  assert.ok(isSupported('Python', corpus));
});

test('invented evidence fails', () => {
  assert.equal(isSupported('Published a paper in Nature Neuroscience', corpus), false);
  assert.equal(isSupported('', corpus), false);
});

test('flags skills not in profile', () => {
  const f = findUnsupported('I have built models in PyTorch and Python.', profile);
  assert.deepEqual(f.filter(x => x.type === 'skill').map(x => x.text), ['PyTorch']);
});

test('allows missing skills framed as learning goals', () => {
  const f = findUnsupported('I am eager to learn MATLAB for this role.', profile);
  assert.equal(f.filter(x => x.type === 'skill').length, 0);
});

test('flags invented credentials and grades', () => {
  const f = findUnsupported('I won first place at the state science fair. My GPA is 3.9.', profile);
  assert.ok(f.some(x => /award/.test(x.reason)));
  assert.ok(f.some(x => /grades/.test(x.reason) || x.text === '3.9'));
});

test('does not flag supported content', () => {
  const f = findUnsupported('I cleaned a public RNA-seq dataset in pandas and compared k-means and hierarchical clustering with a team of 3.', profile);
  assert.equal(f.length, 0, JSON.stringify(f));
});

test('flags figures not in profile', () => {
  const f = findUnsupported('My model reached 95% accuracy.', profile);
  assert.ok(f.some(x => x.type === 'figure' && x.text === '95%'));
});
