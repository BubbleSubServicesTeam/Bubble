import { translateBatch } from './translate';

const SKIP_SELECTOR = 'script, style, textarea, input, select, code, pre, [contenteditable], [data-no-translate]';
const HAS_LETTER = /\p{L}/u;
const BATCH_SIZE = 100;
const FLUSH_DELAY_MS = 150;
const STORAGE_PREFIX = 'bubble-ui-translations-';
const originals = new Map<Text, string>();

type Waiting = { node: Text; source: string };

export function startUiTranslation(lang: string): () => void {
  if (!lang || lang === 'en') return () => {};

  const storageKey = `${STORAGE_PREFIX}${lang}`;
  let saved: Record<string, string> = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
  } catch {
    saved = {};
  }
  const translations = new Map<string, string>(Object.entries(saved));
  const unavailable = new Set<string>();
  const waiting = new Map<string, Waiting[]>();
  const inFlight = new Set<string>();
  const written = new WeakMap<Text, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(translations)));
    } catch {
      // storage full or unavailable; translations simply stay in memory
    }
  }

  function applyTranslation(node: Text, source: string, translated: string) {
    if (node.data !== source) return;
    if (!originals.has(node)) originals.set(node, source);
    const lead = source.match(/^\s*/)?.[0] ?? '';
    const trail = source.match(/\s*$/)?.[0] ?? '';
    const next = lead + translated + trail;
    written.set(node, next);
    node.data = next;
  }

  async function flush() {
    timer = null;
    const keys = [...waiting.keys()].filter(key => !inFlight.has(key)).slice(0, BATCH_SIZE);
    if (keys.length === 0) return;
    keys.forEach(key => inFlight.add(key));
    const results = await translateBatch(keys, lang);
    if (disposed) return;
    keys.forEach((key, index) => {
      inFlight.delete(key);
      const entries = waiting.get(key) ?? [];
      waiting.delete(key);
      const translated = results[index];
      if (translated) translations.set(key, translated);
      else unavailable.add(key);
      if (translated) entries.forEach(({ node, source }) => applyTranslation(node, source, translated));
    });
    persist();
    if (waiting.size > 0) schedule();
  }

  function schedule() {
    if (timer === null) timer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  function visit(node: Text) {
    if (written.get(node) === node.data) return;
    const source = node.data;
    const key = source.trim();
    if (key.length < 2 || !HAS_LETTER.test(key)) return;
    if (node.parentElement?.closest(SKIP_SELECTOR)) return;

    const known = translations.get(key);
    if (known) {
      applyTranslation(node, source, known);
      return;
    }
    if (unavailable.has(key)) return;

    const list = waiting.get(key) ?? [];
    list.push({ node, source });
    waiting.set(key, list);
    schedule();
  }

  function scan(root: Node) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    while (current) {
      visit(current as Text);
      current = walker.nextNode();
    }
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData' && mutation.target.nodeType === Node.TEXT_NODE) {
        visit(mutation.target as Text);
        continue;
      }
      mutation.addedNodes.forEach(added => {
        if (added.nodeType === Node.TEXT_NODE) visit(added as Text);
        else if (added.nodeType === Node.ELEMENT_NODE) scan(added);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  scan(document.body);

  return () => {
    disposed = true;
    observer.disconnect();
    if (timer !== null) clearTimeout(timer);
    originals.forEach((source, node) => {
      if (node.isConnected) node.data = source;
    });
    originals.clear();
  };
}
