const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const src = fs.readFileSync('src/pages/JobDetailPage.jsx', 'utf8');

test('isBuyer requires a signed-in verusId', () => {
  assert.match(src, /function signedInVerusId\(user\) \{\s*const id = user\?\.verusId;\s*return typeof id === 'string' && id\.length > 0 \? id : '';\s*\}/);
  assert.doesNotMatch(src, /buyerVerusId === user\?\.verusId/);
  const buyerChecks = src.match(/const isBuyer = viewerId !== '' && job\.buyerVerusId === viewerId;/g);
  assert.equal(buyerChecks?.length, 2);
  const sellerCheck = src.match(/const isSeller = viewerId !== '' && job\.sellerVerusId === viewerId;/g);
  assert.equal(sellerCheck?.length, 1);
});

test('public job view says to sign in and skips participant details', () => {
  assert.match(src, /const isPublicView = viewerId === '' \|\| !job\.buyerVerusId;/);
  assert.match(src, /<p className="text-gray-300">Sign in to see this job<\/p>/);
  const payAt = src.indexOf('>Payment Status<');
  assert.ok(payAt > 0);
  assert.match(src.slice(payAt - 280, payAt), /!isPublicView && \(/);
  const buyerAt = src.indexOf('/sovagent/${job.buyerVerusId}');
  assert.ok(buyerAt > 0);
  assert.match(src.slice(buyerAt - 160, buyerAt), /!isPublicView && \(/);
  const chatAt = src.indexOf('<Chat ');
  assert.match(src.slice(chatAt - 220, chatAt), /!isPublicView && \(isBuyer \|\| isSeller\)/);
  const actionsAt = src.indexOf('<JobActions ');
  assert.match(src.slice(actionsAt - 220, actionsAt), /!isPublicView && \(isBuyer \|\| isSeller\)/);
  const sshAt = src.indexOf('<GpuRentalAccess ');
  assert.match(src.slice(sshAt - 280, sshAt), /!isPublicView && isBuyer && job\.serviceType === 'gpu-rental'/);
});

test('JailBox is not rendered for a gpu-rental', () => {
  const jailAt = src.indexOf('JailBox not declared');
  assert.ok(jailAt > 0);
  const guardAt = src.lastIndexOf("job.serviceType !== 'gpu-rental'", jailAt);
  assert.ok(guardAt !== -1 && jailAt > guardAt);
  assert.match(
    src.slice(guardAt, jailAt),
    /job\.serviceType !== 'gpu-rental' && \['in_progress', 'delivered', 'paused'\]\.includes\(job\.status\)/,
  );
  const sshAt = src.indexOf("job.serviceType === 'gpu-rental'");
  const sshBlock = src.slice(sshAt, src.indexOf('<GpuRentalAccess ', sshAt) + '<GpuRentalAccess '.length);
  assert.doesNotMatch(sshBlock, /JailBox/);
  assert.equal(src.includes('rental-secret'), false);
});
