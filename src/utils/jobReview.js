export const REVIEWABLE_STATUSES = ['completed', 'delivered', 'disputed', 'cancelled'];

/** A paid job can take a review once it has ended, and during the delivery window. */
export function isJobReviewable(job) {
  if (!job || !REVIEWABLE_STATUSES.includes(job.status)) return false;
  if (job.status === 'delivered' && job.reviewWindowExpiresAt && new Date(job.reviewWindowExpiresAt) < new Date()) {
    return false;
  }
  return true;
}

export function isNegativeJobOutcome(status) {
  return status === 'disputed' || status === 'cancelled';
}
