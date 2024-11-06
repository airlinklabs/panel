const searchModal = document.getElementById('searchModal');
const modalContent = document.querySelector('.modal-content');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const navLinks = document.querySelectorAll('.nav-link');
let selected = '';

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
      resultLink.textContent = link.textContent;
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
        'hover:border',
        'hover:border-neutral-800/20',
      );

      if (index === 0) {
        selected = resultLink.href;
        resultLink.classList.add(
          'bg-gray-200',
          'text-gray-900',
          'font-semibold',
          'searchLinkActive',
          'mt-4',
          'border',
          'border-neutral-800/20',
        );
      }

      searchResults.appendChild(resultLink);
    });
  }
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