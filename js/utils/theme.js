// js/utils/theme.js
export function applyTheme(mode='light') {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
}
