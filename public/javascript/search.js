/* eslint-disable no-undef */
const searchModal = document.getElementById('searchModal');
const modalContent = document.querySelector('.modal-content');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const navLinks = document.querySelectorAll('.nav-link');

let activeIndex = -1;

function highlightMatch(text, term) {
  if (!term) return text;
  const regex = new RegExp(
    `(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    'gi',
  );
  return text.replace(
    regex,
    '<mark class="bg-yellow-600 text-black rounded px-1">$1</mark>',
  );
}

function filterLinks(searchTerm) {
  const [mainTerm, subTerm] = searchTerm.split(':/');
  const mainTermFiltered = mainTerm?.toLowerCase() || '';
  const subTermFiltered = subTerm?.toLowerCase() || '';

  const filteredLinks = Array.from(navLinks).filter((link) => {
    const textContent = link.textContent.toLowerCase();
    const searchData = link.getAttribute('searchdata')?.toLowerCase();
    const linkSubTerm = link.getAttribute('subterm')?.toLowerCase();

    const mainTermMatch =
      !mainTermFiltered ||
      textContent.includes(mainTermFiltered) ||
      (searchData && searchData.includes(mainTermFiltered));

    const subTermMatch =
      !subTermFiltered ||
      textContent.includes(subTermFiltered) ||
      (searchData && searchData.includes(subTermFiltered)) ||
      (linkSubTerm && linkSubTerm.includes(subTermFiltered));

    return mainTermMatch && subTermMatch;
  });

  searchResults.innerHTML = '';
  activeIndex = -1;

  if (filteredLinks.length === 0) {
    const noResultsMessage = document.createElement('p');
    noResultsMessage.textContent = 'No results found.';
    noResultsMessage.classList.add('text-gray-400', 'text-sm', 'mt-4');
    searchResults.appendChild(noResultsMessage);
    return;
  }

  filteredLinks.forEach((link, index) => {
    const resultLink = document.createElement('a');
    resultLink.href = link.href;
    resultLink.className =
      'search-result flex items-center px-4 py-2 mt-1 rounded-lg hover:bg-gray-700 hover:text-white text-gray-200 transition';

    const originalIcon = link.querySelector('svg');
    if (originalIcon) {
      const icon = originalIcon.cloneNode(true);
      icon.classList.add('w-5', 'h-5', 'mr-2', 'text-gray-400');
      resultLink.appendChild(icon);
    }

    const linkText = document.createElement('span');
    linkText.innerHTML = highlightMatch(
      link.textContent,
      mainTermFiltered || subTermFiltered,
    );
    resultLink.appendChild(linkText);

    const breadcrumbBadge = document.createElement('span');
    breadcrumbBadge.className =
      'breadcrumb bg-gray-800 text-gray-400 rounded-md ml-2 text-xs px-2 py-1';
    breadcrumbBadge.innerHTML = getBreadcrumbWithHomeIcon(link.href);
    resultLink.appendChild(breadcrumbBadge);

    resultLink.addEventListener('click', (e) => {
      e.preventDefault();
      location.href = link.href;
    });

    searchResults.appendChild(resultLink);
  });
}

searchInput.addEventListener('keydown', (e) => {
  const results = searchResults.querySelectorAll('.search-result');
  if (!results.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex = (activeIndex + 1) % results.length;
    updateActiveResult(results);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex = (activeIndex - 1 + results.length) % results.length;
    updateActiveResult(results);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIndex >= 0 && results[activeIndex]) {
      results[activeIndex].click();
    }
  }
});

function updateActiveResult(results) {
  results.forEach((res, idx) => {
    res.classList.toggle('bg-gray-600', idx === activeIndex);
  });
}

function showSearchResults() {
  searchModal.classList.add('show');
  modalContent.classList.add('visible');
  searchInput.focus();
}

window.addEventListener('click', (event) => {
  if (event.target === searchModal) {
    modalContent.classList.remove('visible');
    setTimeout(() => searchModal.classList.remove('show'), 300);
  }
});

let debounceTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    filterLinks(searchInput.value.toLowerCase());
  }, 150);
});

filterLinks('');
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault();
    showSearchResults();
  }
});

function getBreadcrumbWithHomeIcon(href) {
  const url = new URL(href);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const homeIcon = `
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-4 w-4">
  <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
</svg>`;
  const arrowIcon = `
<svg class="h-5 w-5 -mr-2 -ml-2 flex-shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
  <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
</svg>`;
  if (!pathParts.length) return homeIcon;

  return (
    `<div class="flex items-center space-x-2"><span>${homeIcon}</span>` +
    pathParts
      .map(
        (part) =>
          `<span class="flex items-center">${arrowIcon}<span class="ml-2">${part}</span></span>`,
      )
      .join('') +
    `</div>`
  );
}
