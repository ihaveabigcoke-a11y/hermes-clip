/** datetime-local is explicitly Vietnam time, independent of the computer timezone. */
export function vietnamDateTimeLocal(now: number | Date = Date.now()) {
  return new Date(Number(now) + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
export function vietnamDateTimeIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('Chọn thời điểm đo hợp lệ.');
  const date = new Date(value + ':00+07:00');
  if (!Number.isFinite(date.getTime()) || vietnamDateTimeLocal(date) !== value) throw Error('Chọn thời điểm đo hợp lệ.');
  return date.toISOString();
}
