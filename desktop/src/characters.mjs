// Shared by the form and the local resolver. Handles preserve Vietnamese accents.
export const characterKey = name => String(name).normalize('NFKC').toLocaleLowerCase('vi');
export function characterMentions(prompt) {
  const found = new Map();
  for (const match of String(prompt).normalize('NFKC').matchAll(/(?<![\p{L}\p{M}\p{N}_@])@([\p{L}][\p{L}\p{M}\p{N}_-]*)/gu)) {
    const key = characterKey(match[1]);
    if (!found.has(key)) found.set(key, match[1]);
  }
  return [...found.values()];
}
export function characterSelection(prompt, enabled, characters, existingCount = 0) {
  if (!enabled) return [];
  const names = characterMentions(prompt);
  const missing = names.filter(name => !characters.some(row => characterKey(row.name) === characterKey(name)));
  if (missing.length) throw Error('Không tìm thấy nhân vật ' + missing.map(name => '@' + name).join(', ') + '. Chưa gửi Muse.');
  const selected = names.map(name => characters.find(row => characterKey(row.name) === characterKey(name)));
  if (selected.some(row => !Array.isArray(row.assetIds) || row.assetIds.length < 1 || row.assetIds.length > 3)) throw Error('Nhân vật cần từ 1 đến 3 ảnh. Chưa gửi Muse.');
  if (existingCount + selected.reduce((n, row) => n + row.assetIds.length, 0) > 4) throw Error('Tối đa 4 ảnh mỗi lượt, gồm ảnh tham chiếu và ảnh nhân vật. Giảm số ảnh trước khi gửi.');
  return selected;
}
