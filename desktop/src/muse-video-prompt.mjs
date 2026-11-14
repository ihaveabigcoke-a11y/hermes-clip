// One command shared by the editor, persisted requests and the Muse adapter.
export const MUSE_VIDEO_COMMAND = "You create a video for me.";

const commandPattern = new RegExp(MUSE_VIDEO_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*(?:\\r?\\n)?', 'g');

/** Remove only the fixed command; keep the scene description verbatim. */
export function museVideoBody(prompt) {
  return prompt.replace(commandPattern, '');
}

export function museMediaPrompt(prompt, mediaType) {
  return mediaType === 'video' ? MUSE_VIDEO_COMMAND + '\n' + museVideoBody(prompt) : prompt;
}
