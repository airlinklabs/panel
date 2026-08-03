/* inline script 1 */

(function () {
  var slot = document.getElementById('topbar-breadcrumbs');
  if (!slot) return;
  var items = null;
  slot.classList.remove('hidden');
  slot.innerHTML = '';
  items.forEach(function (item, i) {
    if (i > 0) {
      var sep = document.createElement('span');
      sep.className = 'mx-1 shrink-0';
      sep.style.color = 'var(--theme-text-placeholder)';
      sep.style.fontSize = '11px';
      sep.textContent = '/';
      slot.appendChild(sep);
    }
    if (item.href && i < items.length - 1) {
      var a = document.createElement('a');
      a.href = item.href;
      a.className = 'transition whitespace-nowrap';
      a.style.color = 'var(--theme-text-muted)';
      a.textContent = item.label;
      slot.appendChild(a);
    } else {
      var span = document.createElement('span');
      span.className = 'truncate whitespace-nowrap font-medium';
      span.style.color = 'var(--theme-text-muted)';
      span.style.minWidth = '0';
      span.style.flex = '0 1 auto';
      span.textContent = item.label;
      slot.appendChild(span);
    }
  });
})();
