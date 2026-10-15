// Applies the saved theme before first paint (no flash). Kept as an external file so the CSP can forbid inline scripts.
try {
  var t = localStorage.getItem('wp-theme');
  var dark = t === 'dark' || ((!t || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
