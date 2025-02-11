/* eslint-disable no-undef */
const searchModal = document.getElementById('searchModal');
const modalContent = document.querySelector('.modal-content');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const navLinks = document.querySelectorAll('.nav-link');

function filterLinks(searchTerm) {
  const [mainTerm, subTerm] = searchTerm.split(':/');
  const mainTermFiltered = mainTerm ? mainTerm.toLowerCase() : '';
  const subTermFiltered = subTerm ? subTerm.toLowerCase() : '';
  const filteredLinks = Array.from(navLinks).filter((link) => {
    const textContent = link.textContent.toLowerCase();
    const searchData = link.getAttribute('searchdata')?.toLowerCase();
    const linkSubTerm = link.getAttribute('subterm')?.toLowerCase();
    const mainTermMatch =
      textContent.includes(mainTermFiltered) ||
      (searchData && searchData.includes(mainTermFiltered));
    const subTermMatch = subTermFiltered
      ? textContent.includes(subTermFiltered) ||
        (searchData && searchData.includes(subTermFiltered)) ||
        (linkSubTerm && linkSubTerm.includes(subTermFiltered))
      : true;

    return mainTermMatch && subTermMatch;
  });

  searchResults.innerHTML = '';

  if (filteredLinks.length === 0) {
    const noResultsMessage = document.createElement('p');
    noResultsMessage.textContent = 'No results found.';
    noResultsMessage.classList.add('text-gray-400', 'text-sm', 'mt-4');
    searchResults.appendChild(noResultsMessage);
  } else {
    filteredLinks.forEach((link, index) => {
      const resultLink = document.createElement('a');
      resultLink.href = link.href;
      resultLink.onclick = () => {
        location.href = link.href;
      };
      resultLink.classList.add(
        'nav-link',
        'transition',
        'text-gray-600',
        'hover:bg-gray-100',
        'backdrop-blur',
        'hover:text-gray-800',
        'group',
        'flex',
        'items-center',
        'px-4',
        'mt-1',
        'py-2',
        'text-sm',
        'font-medium',
        'rounded-xl',
        'border',
        'border-transparent',
        'hover:border-neutral-800/20'
      );

      if (window.location.href === resultLink.href) {
        selected = resultLink.href;
        if (index === 0) {
          resultLink.classList.add(
            'mt-2',
          );
        }

        resultLink.classList.add(
          'bg-gray-200',
          'text-gray-900',
          'font-semibold',
          'searchLinkActive',
          'border',
          'border-neutral-800/20'
        );
      }

      const originalIcon = link.querySelector('svg');
      let icon;
      if (originalIcon) {
        icon = originalIcon.cloneNode(true);
        icon.classList.add('w-5', 'h-5', 'mr-2');
      }

      const linkText = document.createElement('span');
      linkText.textContent = link.textContent;

      const breadcrumbBadge = document.createElement('span');
      breadcrumbBadge.classList.add(
        'breadcrumb',
        'bg-gray-200',
        'text-gray-600',
        'rounded-md',
        'ml-2',
        'text-xs',
        'px-2',
        'py-1'
      );
      breadcrumbBadge.innerHTML = getBreadcrumbWithHomeIcon(link.href);

      if (icon) resultLink.appendChild(icon);
      resultLink.appendChild(linkText);
      resultLink.appendChild(breadcrumbBadge);

      searchResults.appendChild(resultLink);
    });
  }
}

function getBreadcrumbWithHomeIcon(href) {
  const url = new URL(href);
  const pathParts = url.pathname.split('/').filter(Boolean);

  const homeIcon = `
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-4 w-4">
  <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
</svg>

  `;

  const arrowIcon = `
    <svg class="h-5 w-5 -mr-2 -ml-2 flex-shrink-0 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
    </svg>
  `;

  if (pathParts.length > 0) {
    const breadcrumb = pathParts
      .map(
        (part) => `
          <span class="flex items-center">
            ${arrowIcon}
            <span class="ml-2">${part}</span>
          </span>
        `
      )
      .join('');
    return `
      <div class="flex items-center space-x-2">
        <span>${homeIcon}</span>
        ${breadcrumb}
      </div>
    `;
  }

  return homeIcon;
}

filterLinks('');
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault();
    showSearchResults();
  }
});

window.addEventListener('click', (event) => {
  if (event.target === searchModal) {
    modalContent.classList.remove('visible');
    setTimeout(() => {
      searchModal.classList.remove('show');
    }, 300);
  }
});

searchInput.addEventListener('input', () => {
  const searchTerm = searchInput.value.toLowerCase();
  filterLinks(searchTerm);
});

searchInput.addEventListener('keypress', function (event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const selectedLink = searchResults.querySelector('.searchLinkActive');
    if (selectedLink) {
      selectedLink.click();
    }
  }
});
