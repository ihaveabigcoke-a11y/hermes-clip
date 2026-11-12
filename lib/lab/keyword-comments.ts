export type KeywordComment = {text: string; username?: string | null};
export type CommentPasteFormat = 'text' | 'username';

// Separators replace punctuation/emoji instead of joining adjacent word parts.
function words(value: string): string[] {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[0-9#*]\uFE0F?\u20E3/gu, ' ')
    .replace(/[\uFE0E\uFE0F\u20E3]/gu, ' ')
    .match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

export function countKeywordComments(comments: readonly (string | KeywordComment)[], keyword: string) {
  const needle = words(keyword);
  const rows = comments.map(comment => typeof comment === 'string' ? {text: comment} : comment)
    .filter(comment => comment.text.trim().length > 0);
  const matched = rows.filter(comment => {
    const tokens = words(comment.text);
    return needle.length > 0 && tokens.some((_, start) => needle.every((word, offset) => tokens[start + offset] === word));
  });
  const usernames = matched.map(comment => comment.username?.trim().replace(/^@/, '').toLowerCase() || null);
  return {
    total: rows.length,
    matched: matched.length,
    // A missing identity cannot be counted as a new user or folded into another.
    matchedUniqueUsers: usernames.some(username => username === null) ? null : new Set(usernames).size,
    examples: matched.slice(0, 5).map(comment => comment.text),
  };
}

/** Plain text is the default: never guess that the first word is a username. */
export function parseCommentPaste(rawText: string, format: CommentPasteFormat = 'text'): KeywordComment[] {
  return rawText.split(/\r\n|\n|\r/).map(line => line.trim()).filter(Boolean).map(line => {
    const match = format === 'username' ? line.match(/^@?([a-zA-Z0-9._]{1,30}):?\s+(.+)$/u) : null;
    return match ? {username: match[1], text: match[2].trim()} : {username: null, text: line};
  });
}
