const COLOR = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const KIND = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const QUESTION = /^[a-z0-9](?:[a-z0-9 _.,:-]{0,126}[a-z0-9])?$/;

/** Currency-list price, then the listing price. A stored 0 does not hide a priced service. */
export function listedHirePrice(service, selected) {
  const chosen = Number(selected && selected.price);
  if (Number.isFinite(chosen) && chosen > 0) return chosen;
  const listed = Number(service && service.price);
  if (Number.isFinite(listed) && listed > 0) return listed;
  return 0;
}

/** SovData hire filter. At least one of color, kind, taste, or a short question. */
export function datasetTermsFromFields({ color, kind, taste, q } = {}) {
  const terms = {};
  const fields = [
    ['color', color, COLOR, 'Color must be a short word, like red.'],
    ['kind', kind, KIND, 'Kind must be a short word.'],
    ['taste', taste, KIND, 'Taste must be a short word.'],
    ['q', q, QUESTION, 'The question must be short letters, numbers, and spaces.'],
  ];
  for (const [key, raw, pattern, message] of fields) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) continue;
    if (!pattern.test(value)) return { ok: false, message };
    terms[key] = value;
  }
  if (!terms.color && !terms.kind && !terms.taste && !terms.q) {
    return { ok: false, message: 'Name the rows: a color, a kind, a taste, or a short question.' };
  }
  return { ok: true, terms };
}
