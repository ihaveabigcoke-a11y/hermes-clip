export type MediaCategory = 'content' | 'test';
export type MediaOrganization = Record<string, {category: MediaCategory; preferredTakeId: string | null}>;
export type MediaScope = MediaCategory | 'all';
export type MediaPeriod = 'all' | 'today' | 'week' | 'month';

export function sceneKey(projectId: string, sceneId: string) {
  return projectId + ':' + sceneId;
}

export function sceneCategory(organization: MediaOrganization, projectId: string, sceneId: string): MediaCategory {
  return organization[sceneKey(projectId, sceneId)]?.category ?? 'content';
}

export function matchesMediaPeriod(createdAt: number, period: MediaPeriod, now = Date.now()) {
  if (period === 'all') return true;
  if (period === 'today') {
    // Day boundaries follow the timezone displayed throughout the app.
    const vietnamDay = (time: number) => Math.floor((time + 7 * 60 * 60 * 1000) / 86400000);
    return vietnamDay(createdAt) === vietnamDay(now);
  }
  const days = period === 'week' ? 7 : 30;
  return createdAt <= now && createdAt >= now - days * 86400000;
}
