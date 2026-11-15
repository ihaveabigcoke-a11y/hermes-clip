import {z} from 'zod';

const profile = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional();

// Keep the selected profile on the durable job, so preflight failures cannot
// route an explicitly scoped request to a different account.
export function enqueueMuseJob(worker, payload) {
  const {profileId, ...request} = payload;
  return worker.enqueue(request, {profileId:profile.parse(profileId)});
}
