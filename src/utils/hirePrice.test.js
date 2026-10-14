import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datasetQuestionTerms, datasetTermsFromFields, listedHirePrice } from './hirePrice.js';

test('a currency price of 0 uses the listing price', () => {
  assert.equal(listedHirePrice({ price: 0.0001 }, { price: 0 }), 0.0001);
  assert.equal(listedHirePrice({ price: 0.001 }, { price: 0.01 }), 0.01);
  assert.equal(listedHirePrice({ price: 0 }, { price: 0 }), 0);
});

test('a dataset hire names at least one row filter', () => {
  assert.equal(datasetTermsFromFields({}).ok, false);
  assert.deepEqual(datasetTermsFromFields({ color: 'Red' }), { ok: true, terms: { color: 'red' } });
  assert.equal(datasetTermsFromFields({ color: 'red apples' }).ok, false);
});

test('a SovData question is a real sentence, not a 10 character box', () => {
  assert.deepEqual(datasetQuestionTerms('Which apples are red?'), {
    ok: true,
    terms: { q: 'which apples are red?' },
  });
  assert.deepEqual(datasetQuestionTerms('Red Delicious'), { ok: true, terms: { q: 'red delicious' } });
  const long = `a${'b'.repeat(198)}?`;
  assert.equal(long.length, 200);
  assert.equal(datasetQuestionTerms(long).ok, true);
  assert.equal(datasetQuestionTerms(`${long}x`).ok, false);
  assert.equal(datasetQuestionTerms('Paid rows from this listing.').ok, false);
});
