const PROFANITY_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'piss',
  'damn', 'crap', 'idiot', 'moron', 'stupid', 'hate', 'kill', 'die',
  'viagra', 'casino', 'lottery', 'porn', 'sex', 'nude',
];

// Blanket negative recommendations without reasoning — send to moderation
// No `g` flag: these are only used with .test(), and `g` on shared regex objects
// causes stateful lastIndex bugs under concurrent requests.
const NEGATIVE_RECOMMENDATION_PATTERNS = [
  /\bdon'?t buy\b/i,
  /\bdo not buy\b/i,
  /\bnever buy\b/i,
  /\bavoid (this|it|buying|purchasing)\b/i,
  /\bstay away\b/i,
  /\bwaste of (money|time|your money)\b/i,
  /\btotal waste\b/i,
  /\bcomplete waste\b/i,
  /\bscam\b/i,
  /\brip.?off\b/i,
  /\bworst (product|purchase|buy|thing)\b/i,
  /\bdo yourself a favou?r\b/i,
  /\bsave your money\b/i,
  /\brun away\b/i,
];

const SPAM_PATTERNS = [
  /http[s]?:\/\//i,
  /click here/i,
  /buy now/i,
  /limited offer/i,
  /free money/i,
  /make money fast/i,
  /work from home/i,
  /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,})\b/i,
];

// PII source patterns — recreated per-call to avoid shared `g` flag lastIndex state
// Use lookarounds instead of \b so they work around non-word chars like + and spaces
const PII_PATTERN_SOURCES: [string, string][] = [
  [String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`, 'g'],          // email
  [String.raw`(?<!\d)(\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)`, 'g'], // phone
  [String.raw`(?<!\d)\d{10}(?!\d)`, 'g'],                                            // 10-digit phone
  [String.raw`\b\d{3}-\d{2}-\d{4}\b`, 'g'],                                         // SSN
  [String.raw`(?<!\d)(?:\d[ -]*?){13,16}(?!\d)`, 'g'],                              // credit card
];

// Detects keyboard mash / random character sequences that aren't readable text.
// Two signals:
//   1. Vowel ratio < 15% across all alphabetic chars (real English is ~35-45%)
//   2. >40% of words contain 4+ consecutive consonants
function looksLikeGarbage(text: string): boolean {
  const alpha = text.replace(/[^a-zA-Z]/g, '');
  if (alpha.length < 8) return false; // too short to judge reliably

  const vowels = (alpha.match(/[aeiouAEIOU]/g) || []).length;
  if (vowels / alpha.length < 0.15) return true;

  const words = text.trim().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return false;
  const consonantClusterWords = words.filter((w) => /[^aeiouAEIOU\W]{4,}/i.test(w));
  if (consonantClusterWords.length / words.length > 0.4) return true;

  return false;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  riskScore: number;
  flags: string[];
}

export function validateReviewSubmission(
  rating: number,
  title: string,
  reviewText: string
): ValidationResult {
  const errors: ValidationError[] = [];
  let riskScore = 0;
  let flags: string[] = [];

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.push({
      field: 'rating',
      message: 'Rating must be a whole number between 1 and 5',
    });
  }

  if (!title || title.trim().length === 0) {
    errors.push({
      field: 'title',
      message: 'Title is required',
    });
  } else if (title.length < 5) {
    errors.push({
      field: 'title',
      message: 'Title must be at least 5 characters',
    });
  } else if (title.length > 200) {
    errors.push({
      field: 'title',
      message: 'Title must not exceed 200 characters',
    });
  }

  if (!reviewText || reviewText.trim().length === 0) {
    errors.push({
      field: 'review_text',
      message: 'Review text is required',
    });
  } else if (reviewText.length < 20) {
    errors.push({
      field: 'review_text',
      message: 'Review must be at least 20 characters',
    });
  } else if (reviewText.length > 5000) {
    errors.push({
      field: 'review_text',
      message: 'Review must not exceed 5000 characters',
    });
  }

  if (errors.length === 0) {
    ({ score: riskScore, flags } = calculateRiskScore(title, reviewText));
  }

  return {
    valid: errors.length === 0,
    errors,
    riskScore,
    flags,
  };
}

// Scans a single field for all content violations, returning scored flags.
// Each field (title, review text) is scanned independently so abuse in either
// is always caught and attributed to the correct source.
function scanField(
  text: string,
  fieldLabel: string
): { score: number; flags: string[] } {
  let score = 0;
  const flags: string[] = [];
  const lower = text.toLowerCase();

  // 80 pts: one hit guarantees auto-reject (threshold is >= 75)
  if (looksLikeGarbage(text)) {
    score += 80;
    flags.push(`Unreadable or garbage text in ${fieldLabel}`);
  }

  const foundProfanity: string[] = [];
  for (const word of PROFANITY_WORDS) {
    // Use word boundaries so "skill" doesn't match "kill", "diet" doesn't match "die", etc.
    if (new RegExp(`\\b${word}\\b`, 'i').test(lower)) {
      score += 80;
      foundProfanity.push(word);
    }
  }
  if (foundProfanity.length > 0) {
    flags.push(
      `Profanity in ${fieldLabel} (${foundProfanity.length} instance${foundProfanity.length > 1 ? 's' : ''})`
    );
  }

  if (NEGATIVE_RECOMMENDATION_PATTERNS.some((p) => p.test(lower))) {
    score += 30;
    flags.push(`Blanket negative recommendation in ${fieldLabel}`);
  }

  if (SPAM_PATTERNS.some((p) => p.test(lower))) {
    score += 15;
    flags.push(`Spam-like content or external links in ${fieldLabel}`);
  }

  const piiLabels = ['email address', 'phone number', 'phone number', 'SSN-like number', 'credit card number'];
  for (let i = 0; i < PII_PATTERN_SOURCES.length; i++) {
    const [source, regexFlags] = PII_PATTERN_SOURCES[i];
    const matches = text.match(new RegExp(source, regexFlags));
    if (matches) {
      score += matches.length * 30;
      flags.push(
        `PII detected in ${fieldLabel}: ${piiLabels[i]} (${matches.length} instance${matches.length > 1 ? 's' : ''})`
      );
    }
  }

  const urlMatches = lower.match(/http[s]?:\/\//gi);
  if (urlMatches) {
    score += urlMatches.length * 25;
    flags.push(`External URL${urlMatches.length > 1 ? 's' : ''} in ${fieldLabel} (${urlMatches.length})`);
  }

  const allCaps = (text.match(/[A-Z]/g) || []).length;
  if (allCaps > text.length * 0.5) {
    score += 15;
    flags.push(`Excessive capital letters in ${fieldLabel}`);
  }

  return { score, flags };
}

export function calculateRiskScore(title: string, reviewText: string): { score: number; flags: string[] } {
  const titleResult = scanField(title, 'review title');
  const bodyResult = scanField(reviewText, 'review text');

  const combinedScore = Math.min(titleResult.score + bodyResult.score, 100);
  const combinedFlags = [...titleResult.flags, ...bodyResult.flags];

  return { score: combinedScore, flags: combinedFlags };
}

// Only truly clean reviews (score 0-25) auto-publish
export function shouldAutoApprove(riskScore: number): boolean {
  return riskScore <= 25;
}

// Scores 26-74 go to moderation queue
export function shouldFlag(riskScore: number): boolean {
  return riskScore > 25 && riskScore < 75;
}

// Scores 75+ are auto-rejected without saving
export function shouldAutoReject(
  riskScore: number
): { reject: boolean; reason?: string } {
  if (riskScore >= 75) {
    return {
      reject: true,
      reason: 'Review contains prohibited content and cannot be published',
    };
  }

  return { reject: false };
}
