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

// Simple toast notification system
window.showToast = function(message, type = 'info') {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(toastContainer);
  }
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'flex items-center p-4 mb-4 rounded-lg shadow transition-opacity duration-300';
  
  // Set background color based on type
  switch (type) {
    case 'success':
      toast.classList.add('bg-green-50', 'dark:bg-green-800/30', 'border', 'border-green-200', 'dark:border-green-800/30');
      break;
    case 'error':
      toast.classList.add('bg-red-50', 'dark:bg-red-800/30', 'border', 'border-red-200', 'dark:border-red-800/30');
      break;
    case 'warning':
      toast.classList.add('bg-yellow-50', 'dark:bg-yellow-800/30', 'border', 'border-yellow-200', 'dark:border-yellow-800/30');
      break;
    default:
      toast.classList.add('bg-blue-50', 'dark:bg-blue-800/30', 'border', 'border-blue-200', 'dark:border-blue-800/30');
  }
  
  // Set icon based on type
  let iconSvg;
  switch (type) {
    case 'success':
      iconSvg = `<svg class="w-5 h-5 text-green-500 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>`;
      break;
    case 'error':
      iconSvg = `<svg class="w-5 h-5 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>`;
      break;
    case 'warning':
      iconSvg = `<svg class="w-5 h-5 text-yellow-500 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>`;
      break;
    default:
      iconSvg = `<svg class="w-5 h-5 text-blue-500 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>`;
  }
  
  // Create toast content
  toast.innerHTML = `
    <div class="inline-flex items-center justify-center flex-shrink-0 w-8 h-8 mr-3">
      ${iconSvg}
    </div>
    <div class="text-sm font-normal text-neutral-800 dark:text-neutral-200">${message}</div>
    <button type="button" class="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex items-center justify-center h-8 w-8 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white">
      <svg class="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
      </svg>
    </button>
  `;
  
  // Add close button functionality
  const closeButton = toast.querySelector('button');
  closeButton.addEventListener('click', () => {
    toast.classList.add('opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  });
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 5000);
  
  return toast;
};
