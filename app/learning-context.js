/* Small, local reference retrieval. Documents are data, never executable instructions. */
export const LEARNING_HOME = new URL('../learning/index.html', import.meta.url).href;
const CATALOG_URL = new URL('../learning/catalog.json', import.meta.url);
let catalogPromise;
const plain = value => typeof value === 'string' ? value : '';
const list = value => Array.isArray(value) ? value : [];
const clean = value => plain(value).replace(/[\u0000-\u001f]/g, ' ').trim();

export async function loadLearningCatalog() {
  if (!catalogPromise) catalogPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(CATALOG_URL, { signal: controller.signal, credentials: 'same-origin' });
      if (!response.ok) throw new Error('Learning catalogue HTTP ' + response.status);
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid learning catalogue');
      return data;
    } finally { clearTimeout(timer); }
  })().catch(() => { catalogPromise = null; return null; });
  return catalogPromise;
}

function safeURL(value) {
  try { const url = new URL(value || LEARNING_HOME, CATALOG_URL); return /^https?:$/.test(url.protocol) ? url.href : LEARNING_HOME; }
  catch { return LEARNING_HOME; }
}

export function catalogueEntries(data) {
  if (!data) return [];
  const result = [];
  function add(kind, row) {
    if (!row || typeof row !== 'object') return;
    const title = clean(row.title || row.name); if (!title) return;
    const summary = clean(row.summary || row.description || row.note);
    const topics = list(row.topics).map(clean).filter(Boolean);
    const steps = list(row.steps || row.exercise?.steps).map(clean).filter(Boolean).slice(0, 4);
    const applications = list(row.applications?.aero).map(clean).filter(Boolean).slice(0, 2);
    const output = clean(row.output || row.exercise?.deliverable);
    const url = safeURL(row.url || row.path);
    result.push({ id: clean(row.id) || kind + '-' + result.length, kind, title, summary, topics, steps, applications, output, url,
      sourceIds: list(row.sourceIds).filter(x => typeof x === 'string'), materialIds: list(row.materialIds).filter(x => typeof x === 'string') });
  }
  list(data.materials).forEach(row => add('material', row));
  list(data.practices).forEach(row => add('practice', row));
  list(data.sources).forEach(row => add('source', row));
  const map = data.droneMap;
  if (Array.isArray(map)) map.forEach(row => add('droneMap', row));
  else if (map && typeof map === 'object') {
    add('droneMap', map);
    [...list(map.entries), ...list(map.sections), ...list(map.resources)].forEach(row => add('droneMap', row));
  }
  return result;
}

function terms(query) {
  const q = clean(query).normalize('NFKC').toLowerCase();
  const words = q.match(/[a-z0-9][a-z0-9.+/-]+/g) || [];
  const stops = new Set(['the', 'and', 'what', 'how', 'can', 'for', 'with', 'this', 'that', 'about', 'does', 'are']);
  const han = q.match(/[\u3400-\u9fff]+/g) || [];
  for (const group of han) for (let i = 0; i < group.length - 1; i++) words.push(group.slice(i, i + 2));
  return [...new Set(words)].filter(word => !stops.has(word));
}

export function matchLearning(data, query, limit = 3) {
  const words = terms(query); if (!words.length) return [];
  return catalogueEntries(data).map(entry => {
    const title = entry.title.toLowerCase(), topics = entry.topics.join(' ').toLowerCase();
    const body = [entry.summary, ...entry.steps, ...entry.applications, entry.output].join(' ').toLowerCase();
    let score = 0;
    for (const word of words) score += (title.includes(word) ? 5 : 0) + (topics.includes(word) ? 3 : 0) + (body.includes(word) ? 1 : 0);
    return { ...entry, score };
  }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(4, limit)));
}

export async function searchLearning(query, limit = 3) {
  return matchLearning(await loadLearningCatalog(), query, limit);
}

export function learningPromptContext(entries) {
  if (!entries.length) return '';
  return JSON.stringify(entries.map(({ id, title, summary, topics, steps, applications, output, url }) => ({
    id, title: title.slice(0, 180), summary: summary.slice(0, 550), topics: topics.slice(0, 8),
    steps: steps.slice(0, 3).map(value => value.slice(0, 160)), applications: applications.map(value => value.slice(0, 160)),
    output: output.slice(0, 200), source: url,
  })));
}
