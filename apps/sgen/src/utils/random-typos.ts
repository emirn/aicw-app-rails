/**
 * Random Typo Generator with Markdown Protection
 *
 * Introduces realistic human typing errors while protecting
 * markdown syntax from corruption.
 */

export interface TypoConfig {
  /** Typos per 1000 characters (default: 4 = 0.4%) */
  rate: number;
  /** Distribution of typo types (must sum to 1.0) */
  distribution: {
    commonWord: number;
    doubledLetter: number;
    letterOmission: number;
    transposition: number;
    adjacentKey: number;
  };
  /** Minimum word length to apply typos (default: 4) */
  minWordLength: number;
  /** Random seed for reproducibility (optional) */
  seed?: number;
  /** Chance of adding 1-2 extra spaces between words (1 in N words). 0 to disable. Default: 300 */
  extraSpaceChance: number;
  /** Chance of capitalizing 2nd letter in capitalized words (1 in N words). 0 to disable. Default: 5000 */
  secondCapitalChance: number;
}

export const DEFAULT_TYPO_CONFIG: TypoConfig = {
  rate: 4, // 4 typos per 1000 chars (0.4% error rate)
  distribution: {
    commonWord: 0.35,
    doubledLetter: 0.20,
    letterOmission: 0.15,
    transposition: 0.20,
    adjacentKey: 0.10,
  },
  minWordLength: 4,
  extraSpaceChance: 300, // 1 in 300 words gets extra space(s)
  secondCapitalChance: 5000, // 1 in 5000 capitalized words gets 2nd letter capitalized
};

// QWERTY keyboard adjacency map for realistic key errors
export const ADJACENT_KEYS: Record<string, string[]> = {
  a: ['q', 'w', 's', 'z'],
  b: ['v', 'g', 'h', 'n'],
  c: ['x', 'd', 'f', 'v'],
  d: ['s', 'e', 'r', 'f', 'c', 'x'],
  e: ['w', 's', 'd', 'r'],
  f: ['d', 'r', 't', 'g', 'v', 'c'],
  g: ['f', 't', 'y', 'h', 'b', 'v'],
  h: ['g', 'y', 'u', 'j', 'n', 'b'],
  i: ['u', 'j', 'k', 'o'],
  j: ['h', 'u', 'i', 'k', 'm', 'n'],
  k: ['j', 'i', 'o', 'l', 'm'],
  l: ['k', 'o', 'p'],
  m: ['n', 'j', 'k'],
  n: ['b', 'h', 'j', 'm'],
  o: ['i', 'k', 'l', 'p'],
  p: ['o', 'l'],
  q: ['w', 'a'],
  r: ['e', 'd', 'f', 't'],
  s: ['a', 'w', 'e', 'd', 'x', 'z'],
  t: ['r', 'f', 'g', 'y'],
  u: ['y', 'h', 'j', 'i'],
  v: ['c', 'f', 'g', 'b'],
  w: ['q', 'a', 's', 'e'],
  x: ['z', 's', 'd', 'c'],
  y: ['t', 'g', 'h', 'u'],
  z: ['a', 's', 'x'],
};

interface SafeZone {
  start: number;
  end: number;
  type: string;
}

interface WordLocation {
  word: string;
  start: number;
  end: number;
}

export interface AppliedTypo {
  original: string;
  typo: string;
  position: number;
  type: string;
}

export interface AppliedExtraSpace {
  position: number;
  spacesAdded: number; // 1 or 2
}

export interface AppliedSecondCapital {
  original: string;
  modified: string;
  position: number;
}

/**
 * Load common typos from CSV file content
 */
export function loadTyposFromCSV(csvContent: string): Map<string, string[]> {
  const typoMap = new Map<string, string[]>();

  const lines = csvContent
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'));

  for (const line of lines) {
    const idx = line.indexOf(',');
    if (idx <= 0) continue;

    const correct = line.slice(0, idx).trim().toLowerCase();
    const typo = line.slice(idx + 1).trim().toLowerCase();

    if (!correct || !typo) continue;

    const existing = typoMap.get(correct) || [];
    existing.push(typo);
    typoMap.set(correct, existing);
  }

  return typoMap;
}

/**
 * Identify all "safe zones" in markdown that should NOT be modified
 */
export function findSafeZones(text: string): SafeZone[] {
  const zones: SafeZone[] = [];

  // 1. Code blocks (``` ... ```)
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length, type: 'code_block' });
  }

  // 2. Inline code (` ... `)
  const inlineCodeRegex = /`[^`\n]+`/g;
  while ((match = inlineCodeRegex.exec(text)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length, type: 'inline_code' });
  }

  // 3. Script/JavaScript sections (<script>...</script>)
  const scriptRegex = /<script[\s\S]*?<\/script>/gi;
  while ((match = scriptRegex.exec(text)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length, type: 'script' });
  }

  // 4. HTML tags and their attributes (<...>)
  const htmlRegex = /<[^>]+>/g;
  while ((match = htmlRegex.exec(text)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length, type: 'html_tag' });
  }

  // 5. URLs (http:// or https://)
  const urlRegex = /https?:\/\/[^\s\)\]>"<]+/g;
  while ((match = urlRegex.exec(text)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length, type: 'url' });
  }

  // 6. Markdown link URLs - protect only the (url) part, not the [text] part
  const mdLinkRegex = /\]\(([^)]+)\)/g;
  while ((match = mdLinkRegex.exec(text)) !== null) {
    // Protect from ] to ) inclusive
    zones.push({ start: match.index, end: match.index + match[0].length, type: 'markdown_link_url' });
  }

  // 7. Image syntax ![alt](url) - protect entire syntax
  const imgRegex = /!\[[^\]]*\]\([^)]+\)/g;
  while ((match = imgRegex.exec(text)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length, type: 'image' });
  }

  // 8. Headers (lines starting with #)
  const headerRegex = /^#{1,6}\s+.*$/gm;
  while ((match = headerRegex.exec(text)) !== null) {
    zones.push({ start: match.index, end: match.index + match[0].length, type: 'header' });
  }

  // Sort by start position and merge overlapping zones
  zones.sort((a, b) => a.start - b.start);
  return mergeOverlappingZones(zones);
}

/**
 * Merge overlapping safe zones
 */
function mergeOverlappingZones(zones: SafeZone[]): SafeZone[] {
  if (zones.length === 0) return [];

  const merged: SafeZone[] = [zones[0]];

  for (let i = 1; i < zones.length; i++) {
    const current = zones[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      // Overlapping - extend the last zone
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Check if a position is within a safe zone
 */
function isInSafeZone(pos: number, zones: SafeZone[]): boolean {
  for (const zone of zones) {
    if (pos >= zone.start && pos < zone.end) return true;
    if (zone.start > pos) break; // zones are sorted
  }
  return false;
}

/**
 * Add 1-2 extra spaces between words randomly
 */
function applyRandomExtraSpaces(
  text: string,
  safeZones: SafeZone[],
  chance: number,
  rng: () => number
): { result: string; spacesAdded: AppliedExtraSpace[] } {
  if (chance <= 0) return { result: text, spacesAdded: [] };

  const spacesAdded: AppliedExtraSpace[] = [];

  // Find single spaces between words (not in safe zones)
  const candidates: number[] = [];
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] === ' ' && text[i - 1] !== ' ' && text[i + 1] !== ' ') {
      // It's a single space between non-space chars
      if (/\w/.test(text[i - 1]) && /\w/.test(text[i + 1])) {
        // Word boundary space
        if (!isInSafeZone(i, safeZones)) {
          candidates.push(i);
        }
      }
    }
  }

  if (candidates.length === 0) return { result: text, spacesAdded: [] };

  // Determine how many spaces to add (1 in N chance per word space)
  const expectedChanges = Math.round(candidates.length / chance);
  if (expectedChanges === 0) return { result: text, spacesAdded: [] };

  // Shuffle and pick candidates
  const shuffled = [...candidates].sort(() => rng() - 0.5);
  const selected = shuffled.slice(0, expectedChanges);

  // Sort descending to preserve indices when modifying
  selected.sort((a, b) => b - a);

  let result = text;
  for (const pos of selected) {
    const extraCount = rng() < 0.5 ? 1 : 2; // 1 or 2 extra spaces
    const extraSpaces = ' '.repeat(extraCount);
    result = result.slice(0, pos) + extraSpaces + result.slice(pos);
    spacesAdded.push({ position: pos, spacesAdded: extraCount });
  }

  return { result, spacesAdded };
}

/**
 * Capitalize 2nd letter of words starting with capital letter
 */
function applyRandomSecondCapital(
  text: string,
  safeZones: SafeZone[],
  chance: number,
  rng: () => number
): { result: string; capitalsAdded: AppliedSecondCapital[] } {
  if (chance <= 0) return { result: text, capitalsAdded: [] };

  const capitalsAdded: AppliedSecondCapital[] = [];

  // Find words starting with capital letter followed by lowercase
  const capitalWordRegex = /\b([A-Z][a-z]+)\b/g;
  const candidates: { word: string; start: number }[] = [];
  let match;

  while ((match = capitalWordRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[1].length;

    // Skip if in safe zone
    if (isInSafeZone(start, safeZones) || isInSafeZone(end - 1, safeZones)) continue;

    candidates.push({ word: match[1], start });
  }

  if (candidates.length === 0) return { result: text, capitalsAdded: [] };

  // Collect words to modify (process in reverse order to preserve indices)
  const toModify: { word: string; start: number; modified: string }[] = [];

  for (const { word, start } of candidates) {
    // 1 in N chance
    if (rng() * chance < 1) {
      const modified = word[0] + word[1].toUpperCase() + word.slice(2);
      toModify.push({ word, start, modified });
    }
  }

  // Sort descending by position
  toModify.sort((a, b) => b.start - a.start);

  let result = text;
  for (const { word, start, modified } of toModify) {
    result = result.slice(0, start) + modified + result.slice(start + word.length);
    capitalsAdded.push({ original: word, modified, position: start });
  }

  return { result, capitalsAdded };
}

/**
 * Find all words and their positions (excluding safe zones)
 */
export function findEditableWords(
  text: string,
  safeZones: SafeZone[],
  minLength: number
): WordLocation[] {
  const words: WordLocation[] = [];
  // Match word characters (letters only, lowercase to avoid proper nouns)
  const wordRegex = /\b([a-z]+)\b/g;
  let match;

  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[1];
    const start = match.index;
    const end = start + word.length;

    // Skip if too short
    if (word.length < minLength) continue;

    // Skip if in safe zone
    if (isInSafeZone(start, safeZones)) continue;
    if (isInSafeZone(end - 1, safeZones)) continue;

    words.push({ word, start, end });
  }

  return words;
}

/**
 * Apply a specific typo type to a word
 */
export function applyTypo(
  word: string,
  typoType: keyof TypoConfig['distribution'],
  commonTypos: Map<string, string[]>,
  rng: () => number
): string | null {
  const lowerWord = word.toLowerCase();

  switch (typoType) {
    case 'commonWord': {
      const typos = commonTypos.get(lowerWord);
      if (!typos || typos.length === 0) return null;
      const typo = typos[Math.floor(rng() * typos.length)];
      // Preserve original case (capitalize if original was capitalized)
      return word[0] === word[0].toUpperCase()
        ? typo.charAt(0).toUpperCase() + typo.slice(1)
        : typo;
    }

    case 'doubledLetter': {
      // Double a random letter (not first or last)
      if (word.length < 4) return null;
      const pos = 1 + Math.floor(rng() * (word.length - 2));
      return word.slice(0, pos + 1) + word[pos] + word.slice(pos + 1);
    }

    case 'letterOmission': {
      // Remove the last letter
      if (word.length < 4) return null;
      return word.slice(0, -1);
    }

    case 'transposition': {
      // Swap two adjacent letters (not first char)
      if (word.length < 4) return null;
      const pos = 1 + Math.floor(rng() * (word.length - 2));
      const chars = word.split('');
      [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
      return chars.join('');
    }

    case 'adjacentKey': {
      // Replace a letter with an adjacent key
      if (word.length < 4) return null;
      // Find a letter that has adjacent keys
      const candidates: number[] = [];
      for (let i = 1; i < word.length - 1; i++) {
        const char = word[i].toLowerCase();
        if (ADJACENT_KEYS[char]) candidates.push(i);
      }
      if (candidates.length === 0) return null;

      const pos = candidates[Math.floor(rng() * candidates.length)];
      const char = word[pos].toLowerCase();
      const adjacent = ADJACENT_KEYS[char];
      const replacement = adjacent[Math.floor(rng() * adjacent.length)];

      return word.slice(0, pos) + replacement + word.slice(pos + 1);
    }

    default:
      return null;
  }
}

/**
 * Select typo type based on distribution weights
 */
function selectTypoType(
  distribution: TypoConfig['distribution'],
  rng: () => number
): keyof TypoConfig['distribution'] {
  const roll = rng();
  let cumulative = 0;

  for (const [type, weight] of Object.entries(distribution)) {
    cumulative += weight;
    if (roll < cumulative) {
      return type as keyof TypoConfig['distribution'];
    }
  }

  return 'commonWord'; // fallback
}

/**
 * Simple seeded random number generator (Mulberry32)
 */
function createSeededRng(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Main function: Apply random typos to text
 */
export function applyRandomTypos(
  text: string,
  commonTypos: Map<string, string[]>,
  config: Partial<TypoConfig> = {}
): {
  result: string;
  typosApplied: AppliedTypo[];
  extraSpacesApplied: AppliedExtraSpace[];
  secondCapitalsApplied: AppliedSecondCapital[];
} {
  const cfg: TypoConfig = { ...DEFAULT_TYPO_CONFIG, ...config };

  // Create RNG (seeded or random)
  const rng = cfg.seed !== undefined ? createSeededRng(cfg.seed) : Math.random.bind(Math);

  // Find safe zones
  const safeZones = findSafeZones(text);

  // Find editable words
  const words = findEditableWords(text, safeZones, cfg.minWordLength);

  if (words.length === 0) {
    return { result: text, typosApplied: [], extraSpacesApplied: [], secondCapitalsApplied: [] };
  }

  // Calculate how many typos to apply
  const targetTypos = Math.round((text.length / 1000) * cfg.rate);

  if (targetTypos === 0) {
    return { result: text, typosApplied: [], extraSpacesApplied: [], secondCapitalsApplied: [] };
  }

  // Shuffle words and pick candidates
  const shuffled = [...words].sort(() => rng() - 0.5);
  const candidates = shuffled.slice(0, Math.min(targetTypos * 3, shuffled.length));

  // Apply typos (working backwards to preserve positions)
  const typosApplied: AppliedTypo[] = [];
  const usedPositions = new Set<number>();

  // Sort by position descending so we can modify without breaking indices
  candidates.sort((a, b) => b.start - a.start);

  let result = text;
  let applied = 0;

  for (const wordLoc of candidates) {
    if (applied >= targetTypos) break;
    if (usedPositions.has(wordLoc.start)) continue;

    // Try to apply a typo
    let attempts = 0;
    let typoResult: string | null = null;
    let typoType: keyof TypoConfig['distribution'] | null = null;

    while (attempts < 5 && typoResult === null) {
      typoType = selectTypoType(cfg.distribution, rng);
      typoResult = applyTypo(wordLoc.word, typoType, commonTypos, rng);
      attempts++;
    }

    if (typoResult && typoType) {
      // Apply the change
      result = result.slice(0, wordLoc.start) + typoResult + result.slice(wordLoc.end);
      typosApplied.push({
        original: wordLoc.word,
        typo: typoResult,
        position: wordLoc.start,
        type: typoType,
      });
      usedPositions.add(wordLoc.start);
      applied++;
    }
  }

  // Apply extra spaces (1 in N words chance)
  let extraSpacesApplied: AppliedExtraSpace[] = [];
  if (cfg.extraSpaceChance > 0) {
    const updatedSafeZones = findSafeZones(result);
    const extraSpaceResult = applyRandomExtraSpaces(result, updatedSafeZones, cfg.extraSpaceChance, rng);
    result = extraSpaceResult.result;
    extraSpacesApplied = extraSpaceResult.spacesAdded;
  }

  // Apply second capital (1 in N eligible words chance)
  let secondCapitalsApplied: AppliedSecondCapital[] = [];
  if (cfg.secondCapitalChance > 0) {
    const updatedSafeZones = findSafeZones(result);
    const secondCapResult = applyRandomSecondCapital(result, updatedSafeZones, cfg.secondCapitalChance, rng);
    result = secondCapResult.result;
    secondCapitalsApplied = secondCapResult.capitalsAdded;
  }

  return { result, typosApplied, extraSpacesApplied, secondCapitalsApplied };
}
