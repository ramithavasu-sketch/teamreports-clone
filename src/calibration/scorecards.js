// Scorecards used by Call Calibration. The Team Reports QA scorecard rates
// Soft Skills and Technical Skills as Good / Not Yet, so that is the default.
// The points rubric shows how a numeric scorecard is compared.

const CATEGORIES = [
  {
    id: 'soft', name: 'Soft Skills', criteria: [
      { id: 'soft-open', name: 'Greeting and introduction', guide: 'Greets promptly, gives name, confirms how they can help.' },
      { id: 'soft-empathy', name: 'Empathy and active listening', guide: 'Acknowledges the issue, does not interrupt, reflects back what was heard.' },
      { id: 'soft-close', name: 'Ownership and closing', guide: 'Owns next steps, confirms the issue is resolved, closes politely.' },
    ],
  },
  {
    id: 'tech', name: 'Technical Skills', criteria: [
      { id: 'tech-diagnose', name: 'Accurate troubleshooting', guide: 'Asks the right questions and reaches the correct cause.' },
      { id: 'tech-process', name: 'Correct process and tools', guide: 'Follows the documented process, uses the right tools and verification.' },
      { id: 'tech-notes', name: 'Documentation', guide: 'Notes are complete, accurate and follow the template.' },
    ],
  },
];

export const SCORECARDS = [
  {
    id: 'tr-soft-tech',
    name: 'Team Reports QA: Soft & Technical Skills',
    type: 'categorical',
    scale: ['Good', 'Not Yet'],
    allowNA: true,
    naRule: 'Use N/A only when the behaviour could not happen on this call. A required behaviour that was missed is Not Yet, not N/A.',
    categories: CATEGORIES,
  },
  {
    id: 'points-10',
    name: 'Points rubric (0 to 10 per criterion)',
    type: 'numeric',
    max: 10,
    allowNA: true,
    naRule: 'N/A removes the criterion from the total. Missed behaviour scores 0, it is not N/A.',
    categories: CATEGORIES,
  },
];

export const NA = 'N/A';

export function getScorecard(id) {
  return SCORECARDS.find((s) => s.id === id) || null;
}

export function criteriaOf(scorecard) {
  return scorecard.categories.flatMap((c) => c.criteria.map((cr) => ({ ...cr, categoryId: c.id, categoryName: c.name })));
}

export function ratingOptions(scorecard) {
  if (scorecard.type === 'categorical') return [...scorecard.scale, ...(scorecard.allowNA ? [NA] : [])];
  const pts = Array.from({ length: scorecard.max + 1 }, (_, i) => String(i));
  return [...pts, ...(scorecard.allowNA ? [NA] : [])];
}

export function isValidRating(scorecard, value) {
  return ratingOptions(scorecard).includes(String(value));
}

// Overall score as a percentage, ignoring N/A. Categorical: share of Good.
export function overallPercent(scorecard, ratings) {
  let got = 0;
  let possible = 0;
  for (const c of criteriaOf(scorecard)) {
    const v = ratings?.[c.id]?.value;
    if (v === undefined || v === '' || v === NA) continue;
    if (scorecard.type === 'categorical') {
      possible += 1;
      if (v === scorecard.scale[0]) got += 1;
    } else {
      possible += scorecard.max;
      got += Number(v);
    }
  }
  return possible ? Math.round((got / possible) * 1000) / 10 : null;
}

// Category verdict for Good / Not Yet scorecards: any Not Yet makes the category Not Yet.
export function categoryVerdict(scorecard, ratings, categoryId) {
  const cat = scorecard.categories.find((c) => c.id === categoryId);
  const vals = cat.criteria.map((c) => ratings?.[c.id]?.value).filter((v) => v && v !== NA);
  if (!vals.length) return NA;
  if (scorecard.type === 'categorical') return vals.every((v) => v === scorecard.scale[0]) ? scorecard.scale[0] : scorecard.scale[1];
  const pct = vals.reduce((a, v) => a + Number(v), 0) / (vals.length * scorecard.max);
  return `${Math.round(pct * 100)}%`;
}
