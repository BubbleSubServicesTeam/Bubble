const NEXT_WORDS: Record<string, string[]> = {
  i: ['love', 'am', 'think', 'want', 'need', 'will', 'can', 'have', 'know', 'hope', 'miss', 'feel', 'was', 'just'],
  'i love': ['you', 'it', 'this', 'that'],
  'i miss': ['you', 'it', 'them'],
  'i want': ['to', 'you', 'some'],
  'i need': ['to', 'you', 'some'],
  'i think': ['so', 'that', 'we', 'it'],
  you: ['too', 'are', 'can', 'want', 'know', 'have', 'need', 'look', 'guys', 'there'],
  'you are': ['so', 'the', 'amazing', 'right', 'going'],
  are: ['you', 'we', 'the', 'so', 'going', 'they'],
  how: ['are', 'is', 'was', 'about', 'come', 'did'],
  'how are': ['you', 'things', 'they'],
  thank: ['you', 'god', 'goodness'],
  see: ['you', 'ya', 'it', 'them'],
  miss: ['you', 'it', 'them'],
  good: ['morning', 'night', 'luck', 'job', 'idea', 'news', 'one'],
  going: ['to', 'home', 'out', 'well', 'be'],
  want: ['to', 'you', 'some', 'it'],
  to: ['be', 'do', 'get', 'go', 'see', 'meet', 'make', 'talk', 'the', 'say'],
  the: ['best', 'same', 'game', 'first', 'way', 'time', 'new'],
  a: ['lot', 'little', 'great', 'good', 'few', 'bit'],
  me: ['too', 'know', 'up', 'later', 'please'],
  and: ['i', 'you', 'the', 'then', 'we'],
  can: ['you', 'we', 'i', 'do', 'be', 'not'],
  do: ['you', 'it', 'we', 'not', 'that'],
  it: ['is', 'was', 'will', 'sounds', 'looks', 'works'],
  is: ['it', 'the', 'that', 'so', 'going', 'not'],
  that: ['is', 'was', 'sounds', 'works', 'would', 'makes'],
  sounds: ['good', 'great', 'perfect', 'fun', 'like'],
  hey: ['whats', 'are', 'there', 'how'],
  what: ['are', 'is', 'time', 'about', 'do', 'happened'],
  let: ['me', 'us', 'you'],
  'let me': ['know', 'check', 'see'],
  ok: ['sounds', 'see', 'let', 'cool'],
  thanks: ['so', 'for', 'again', 'a'],
  love: ['you', 'it', 'this', 'that'],
  sorry: ['about', 'for', 'i'],
  happy: ['birthday', 'to', 'for'],
  please: ['let', 'send', 'call', 'tell'],
  no: ['worries', 'problem', 'way', 'i'],
  yes: ['i', 'please', 'of', 'sure'],
};

const TOPIC_WORDS: Record<string, string[]> = {
  dinner: ['tonight', 'sounds', 'later'],
  lunch: ['today', 'sounds', 'tomorrow'],
  tonight: ['works', 'sounds', 'later'],
  tomorrow: ['works', 'morning', 'sounds'],
  meet: ['up', 'later', 'tomorrow', 'there'],
  birthday: ['happy', 'wishes', 'party'],
  congrats: ['on', 'you'],
  morning: ['good', 'how', 'coffee'],
  night: ['good', 'sleep', 'tonight'],
  coffee: ['later', 'tomorrow', 'sounds'],
  car: ['ride', 'pick', 'later'],
  work: ['today', 'later', 'tomorrow'],
  home: ['soon', 'now', 'later'],
  game: ['tonight', 'today', 'good'],
};

const SENTENCE_STARTERS = ['i', 'the', 'you', 'what', 'hey', 'thanks', 'ok'];

const COMMON_WORDS = `the to you and a it of is that in for be on with have this are not but he she we they my your me so do at can what just if or will up out about get how all now go good like see know time want need make think thanks thank okay sure yes no maybe later today tomorrow tonight home work people really love happy sorry please hello hey hi name where when why who which would could should going gonna coming come call text message talk meet food lunch dinner coffee wait right left back down over more some any much many well also still even only after before again never always nothing something everything someone anyone tell said says sounds great awesome cool nice fine suggest suggestion suggested suggestions suggests perfect amazing lol haha omg wow ready done finished start started stop away around doing did does bad better best new old first last next night morning evening weekend week month year friend friends family mom dad brother sister phone car ride drive pick drop send sent receive received yeah yep nope hmm alright bye goodnight miss missed thinking feel feeling tired busy minute minutes hour hours`.split(/\s+/);

const WORDS = [...new Set(COMMON_WORDS)];

export function getWordSuggestions(precedingText: string, partial: string, limit = 3): string[] {
  const prefix = partial.toLowerCase();
  const preceding = precedingText.toLowerCase().match(/[a-z']+/g) ?? [];
  const last = preceding[preceding.length - 1];
  const pair = preceding.length >= 2 ? `${preceding[preceding.length - 2]} ${last}` : '';
  const topics = preceding.flatMap(w => TOPIC_WORDS[w] ?? []);

  const ranked = [
    ...(NEXT_WORDS[pair] ?? []),
    ...(last ? (NEXT_WORDS[last] ?? []) : []),
    ...topics,
    ...(preceding.length === 0 ? SENTENCE_STARTERS : []),
    ...WORDS,
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of ranked) {
    if (seen.has(word)) continue;
    seen.add(word);
    if (word === prefix || !word.startsWith(prefix)) continue;
    out.push(word);
    if (out.length === limit) break;
  }
  return out.map(w => (w === 'i' ? 'I' : w));
}
