const COMMON_WORDS = `i the to you and a it of is that in for be on with have this are not but he she we they my your me so do at can what just if or will up out about get how all now go good like see know time want need make think thanks thank okay sure yes no maybe later today tomorrow tonight home work people really love happy sorry please hello hey hi name where when why who which would could should going gonna coming come call text message talk meet food lunch dinner coffee wait right left back down over more some any much many well also still even only after before again never always nothing something everything someone anyone tell said says sounds sounds great awesome cool nice fine suggest suggestion suggested suggestions suggests perfect amazing lol haha omg wow ready done finished start started stop away around done doing did does good bad better best new old first last next night morning evening weekend week month year friend friends family mom dad brother sister phone car ride drive pick drop send sent receive received yeah yep nope hmm ok alright bye goodnight morning miss missed thinking feel feeling tired busy minute minutes hour hours`.split(/\s+/);

const WORDS = [...new Set(COMMON_WORDS)];

export function getWordSuggestions(partial: string, limit = 3): string[] {
  const prefix = partial.toLowerCase();
  const matches = prefix
    ? WORDS.filter(w => w.startsWith(prefix) && w !== prefix)
    : WORDS.slice(0, limit);
  return matches.slice(0, limit).map(w => (w === 'i' ? 'I' : w));
}
