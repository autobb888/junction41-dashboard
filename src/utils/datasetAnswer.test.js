import assert from 'node:assert/strict';
import test from 'node:test';
import { datasetAnswerText, datasetQuestionText } from './datasetAnswer.js';

test('the paid question is the line the buyer asked', () => {
  assert.equal(datasetQuestionText({ q: 'green apples' }), 'green apples');
  assert.equal(datasetQuestionText({ color: 'green', kind: 'apple' }), 'green, apple');
});

test('a question with no rows is the seller response', () => {
  assert.equal(
    datasetAnswerText({ kind: 'none', question: 'green apples', matchCount: 0 }, 'VRSCTEST'),
    'The seller has no rows that contain “green apples”.',
  );
});

test('a short payment names the seller price and the amount paid', () => {
  const text = datasetAnswerText({
    kind: 'short',
    question: 'green',
    matchCount: 2,
    price: '0.0002',
    paid: '0.0001',
  }, 'VRSCTEST');
  assert.match(text, /counted 2 rows/);
  assert.match(text, /0\.0002 VRSCTEST/);
  assert.match(text, /paid 0\.0001 VRSCTEST/);
});
