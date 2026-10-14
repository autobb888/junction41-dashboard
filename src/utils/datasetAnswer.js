export function datasetQuestionText(terms) {
  if (!terms) return '';
  if (typeof terms.q === 'string' && terms.q.trim()) return terms.q.trim();
  return [terms.color, terms.kind, terms.taste].filter((part) => typeof part === 'string' && part.trim()).join(', ');
}

export function datasetAnswerText(answer, currency) {
  const coin = currency || '';
  const asked = answer && answer.question ? `“${answer.question}”` : 'this question';
  if (!answer || answer.kind === 'unread') {
    return 'The seller’s row count is not available yet.';
  }
  if (answer.kind === 'none') {
    return `The seller has no rows that contain ${asked}.`;
  }
  const rows = `${answer.matchCount} ${answer.matchCount === 1 ? 'row' : 'rows'}`;
  if (answer.kind === 'short') {
    return `The seller counted ${rows} for ${asked}. Those rows cost ${answer.price} ${coin}, and this hire paid ${answer.paid} ${coin}, so the rows stayed closed.`;
  }
  if (answer.kind === 'counted') {
    return `The seller counted ${rows} for ${asked}. The rows stay with the seller until your identity signs the open request.`;
  }
  return 'The seller’s row count is not available yet.';
}
