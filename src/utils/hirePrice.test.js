import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datasetTermsFromFields, listedHirePrice } from './hirePrice.js';

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
