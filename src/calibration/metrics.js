// Variance and agreement maths for Call Calibration.
//
// How "variance" is measured, per criterion (compared with the session's
// baseline, default 5%):
//   Good / Not Yet scorecards (categorical):
//     agreement  = reviewers with the most common rating / reviewers who rated
//                  (e.g. 3 of 4 say Good -> 3/4 = 75%)
//     once a final rating is recorded, agreement is measured against the final
//     rating instead of the most common one.
//     variance % = 100 - agreement %   (3/4 -> 25%, above a 5% baseline)
//   Points scorecards (numeric):
//     before a final rating: variance % = (highest - lowest) / max points
//     after a final rating:  variance % = largest |reviewer - final| / max points
//     A mix of N/A and points means reviewers disagree on whether the
//     criterion applies, so it counts as 100% variance.
// The majority rating is never used as the final decision; it is only shown.

import { criteriaOf, overallPercent, NA } from './scorecards.js';

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

function modal(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (!best || n > best.n) best = { value: v, n };
  return { best, counts: Object.fromEntries(counts) };
}

export function compareCriterion(scorecard, values, final, baseline) {
  const rated = values.filter((v) => v.value !== undefined && v.value !== '');
  const raw = rated.map((v) => String(v.value));
  const n = raw.length;
  const { best, counts } = modal(raw);
  const hasFinal = final !== undefined && final !== null && final !== '';
  const agreement = { matching: best ? best.n : 0, total: n, pct: pct(best ? best.n : 0, n), modal: best?.value ?? null };
  const finalAgreement = hasFinal ? { matching: raw.filter((v) => v === String(final)).length, total: n } : null;
  if (finalAgreement) finalAgreement.pct = pct(finalAgreement.matching, n);

  let variancePct = null;
  let naConflict = false;
  if (n) {
    if (scorecard.type === 'categorical') {
      variancePct = 100 - (finalAgreement ? finalAgreement.pct : agreement.pct);
    } else {
      const nums = raw.filter((v) => v !== NA).map(Number);
      naConflict = nums.length > 0 && nums.length < n;
      if (naConflict || (hasFinal && (String(final) === NA) !== (nums.length === 0))) variancePct = 100;
      else if (!nums.length) variancePct = 0;
      else if (hasFinal) variancePct = pct(Math.max(...nums.map((x) => Math.abs(x - Number(final)))), scorecard.max);
      else variancePct = pct(Math.max(...nums) - Math.min(...nums), scorecard.max);
    }
    variancePct = Math.round(variancePct * 10) / 10;
  }
  const comparable = n >= 2 || (n >= 1 && hasFinal);
  return { counts, agreement, finalAgreement, variancePct, naConflict, flagged: comparable && variancePct > baseline };
}

// submissions: [{ reviewerId, ratings }] (submitted only); finalRatings: { criterionId: { value } }
export function compareSession(scorecard, submissions, finalRatings, baseline = 5) {
  const criteria = criteriaOf(scorecard).map((c) => {
    const values = submissions.map((s) => ({ reviewerId: s.reviewerId, value: s.ratings?.[c.id]?.value }));
    const final = finalRatings?.[c.id]?.value;
    return { id: c.id, name: c.name, categoryId: c.categoryId, categoryName: c.categoryName, values, final: final ?? null, ...compareCriterion(scorecard, values, final, baseline) };
  });
  const finalOverall = finalRatings ? overallPercent(scorecard, finalRatings) : null;
  const reviewers = submissions.map((s) => {
    const overall = overallPercent(scorecard, s.ratings);
    return { reviewerId: s.reviewerId, overall, diffFromFinal: overall !== null && finalOverall !== null ? Math.round(Math.abs(overall - finalOverall) * 10) / 10 : null };
  });
  const overalls = reviewers.map((r) => r.overall).filter((v) => v !== null);
  const compared = criteria.filter((c) => c.agreement.total >= 2);
  const agreementPct = compared.length ? Math.round((compared.reduce((a, c) => a + (c.finalAgreement?.pct ?? c.agreement.pct), 0) / compared.length) * 10) / 10 : null;
  return {
    criteria,
    reviewers,
    finalOverall,
    overallSpread: overalls.length >= 2 ? Math.round((Math.max(...overalls) - Math.min(...overalls)) * 10) / 10 : null,
    agreementPct,
    flaggedCount: criteria.filter((c) => c.flagged).length,
    baseline,
  };
}
