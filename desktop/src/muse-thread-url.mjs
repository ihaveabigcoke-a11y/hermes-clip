export function museThreadUrl(value) {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://muse.ai' || url.username || url.password || url.search || url.hash
      || !/^\/thread\/(?!new\/?$)[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
