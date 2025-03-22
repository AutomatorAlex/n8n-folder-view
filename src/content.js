const TEMPLATES = {
  folderItem: (tagname, count = 0) => `
    <div class="folder-list-item" data-tag="${tagname}">
      <span class="folder-list-item-icon">
        <i class="el-icon-folder"></i>
      </span>
      <span class="folder-list-item-name">${tagname}</span>
      <span class="folder-list-item-count">${count}</span>
      <div class="tooltip">${tagname} (${count} workflows)</div>
    </div>
  `,
  
  folderViewContainer: `
    <div id="folder-view-container">
      <div id="folder-view-header">
        <h3>Folders</h3>
        <div id="folder-sort-options">
          <select id="folder-sort-select">
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="count-desc">Count (High-Low)</option>
            <option value="count-asc">Count (Low-High)</option>
          </select>
        </div>
        <div id="folder-loading" class="loading-spinner"></div>
      </div>
      <hr class="divider"/>
      <div id="folder-list">
      </div>
      <hr class="divider"/>
    </div>
  `
};

// Store state
const state = {
  tags: {},
  selectedTag: null,
  sortOrder: 'name-asc'
};

/**
 * Updates the position of the tooltip based on the current mouse event.
 *
 * @param {Event} event - The mouse event triggering the tooltip position update.
 */
function updateTooltipPosition(event) {
  const tooltipElement = event.currentTarget.querySelector('.tooltip');
  if (!tooltipElement) return;

  const sidebar = document.getElementById('sidebar');
  const sidebarRect = sidebar.getBoundingClientRect();
  const itemRect = event.currentTarget.getBoundingClientRect();
  
  tooltipElement.style.left = sidebarRect.width + 'px';
  tooltipElement.style.top = itemRect.top + (itemRect.height / 2) + 'px';
}

/**
 * Sorts the folder list based on the current sort order.
 */
function sortFolders() {
  const folderList = document.querySelector('#folder-list');
  if (!folderList) return;

  const folderItems = Array.from(folderList.querySelectorAll('.folder-list-item'));
  
  // Remove "All" folder so we can append it back at the top after sorting
  const allFolder = folderItems.find(item => item.dataset.tag === 'All');
  if (allFolder) {
    allFolder.remove();
  }
  
  const sortedItems = folderItems
    .filter(item => item.dataset.tag !== 'All')
    .sort((a, b) => {
      const tagA = a.dataset.tag;
      const tagB = b.dataset.tag;
      const countA = parseInt(a.querySelector('.folder-list-item-count').textContent) || 0;
      const countB = parseInt(b.querySelector('.folder-list-item-count').textContent) || 0;
      
      switch (state.sortOrder) {
        case 'name-asc':
          return tagA.localeCompare(tagB);
        case 'name-desc':
          return tagB.localeCompare(tagA);
        case 'count-desc':
          return countB - countA;
        case 'count-asc':
          return countA - countB;
        default:
          return 0;
      }
    });

  // Clear the list
  while (folderList.firstChild) {
    folderList.removeChild(folderList.firstChild);
  }
  
  // Add back the "All" folder first
  if (allFolder) {
    folderList.appendChild(allFolder);
  }
  
  // Add the sorted items
  sortedItems.forEach(item => folderList.appendChild(item));
}

/**
 * Creates a view for folders based on the provided tag names and counts.
 *
 * @param {Object} tagData - Object containing tag names as keys and counts as values.
 */
function createFolderView(tagData) {
  // Save to state
  state.tags = tagData;
  
  const addFolderListItem = (tagname, count = 0) => {
    document.querySelector('#folder-list').insertAdjacentHTML('beforeend', TEMPLATES.folderItem(tagname, count));
  }

  const handleFolderListItemClick = (event) => {
    const folderListItem = event.target.closest('.folder-list-item');
    if (folderListItem) {
      const tagName = folderListItem.dataset.tag;
      state.selectedTag = tagName;
      saveState();
      filterWorkflowsByTag(tagName);
      applyActive(folderListItem);
    }
  }

  const handleSortChange = (event) => {
    state.sortOrder = event.target.value;
    saveState();
    sortFolders();
  }

  // Find menu content and insert our folder view
  const menuContent = document.querySelector('#sidebar [class^="_menuContent_"]');
  if (!menuContent) {
    console.error('n8n Folder View: Could not find sidebar menu content');
    return;
  }
  menuContent.insertAdjacentHTML('beforebegin', TEMPLATES.folderViewContainer);

  // Add the All folder first
  const totalCount = Object.values(tagData).reduce((sum, count) => sum + count, 0);
  addFolderListItem('All', totalCount);

  // Sort the tags by name by default
  const sortedTags = Object.keys(tagData).sort((a, b) => a.localeCompare(b));
  sortedTags.forEach(tagName => {
    addFolderListItem(tagName, tagData[tagName]);
  });

  // Add event listeners
  const folderItems = document.querySelectorAll('.folder-list-item');
  folderItems.forEach(item => {
    item.addEventListener('mouseenter', updateTooltipPosition);
    item.addEventListener('mousemove', updateTooltipPosition);
  });

  const folderList = document.querySelector('#folder-list');
  folderList.addEventListener('click', handleFolderListItemClick);

  // Add sort event listener
  const sortSelect = document.querySelector('#folder-sort-select');
  if (sortSelect) {
    sortSelect.value = state.sortOrder;
    sortSelect.addEventListener('change', handleSortChange);
  }

  // Hide loading spinner
  const loadingSpinner = document.querySelector('#folder-loading');
  if (loadingSpinner) {
    loadingSpinner.style.display = 'none';
  }

  // Restore selection if one exists
  restoreState();
}

/**
 * Sets the specified folder item as active and removes the active state from others.
 *
 * @param {Element} folderItem - The folder item element to activate.
 */
async function applyActive(folderItem) {
  const folderItems = document.querySelectorAll('.folder-list-item');
  folderItems.forEach(item => {
    if (item !== folderItem) {
      item.classList.remove('is-active');
    }
  });
  folderItem.classList.add('is-active');
}

/**
 * Filters workflows based on the provided tag name.
 *
 * @param {string} tagName - The name of the tag to filter workflows by.
 */
async function filterWorkflowsByTag(tagName) {
  // Handle "All" folder to show all workflows
  if (tagName === 'All') {
    const removeFiltersButton = await waitQuerySelector('a[data-test-id="workflows-filter-reset"]', null, 2000);
    if (removeFiltersButton) {
      removeFiltersButton.click();
    } else {
      // If we can't find the reset button, try navigating directly
      window.location.href = '/home/workflows';
    }
    return;
  }

  const isUnfiltered = () => {
    return window.location.pathname === '/home/workflows' && window.location.search.length === 0;
  }

  if (isUnfiltered()) {
    queryXpath(`//li[contains(., "${tagName}") and @data-test-id="tag"]`)?.click();
    return;
  }

  const removeFiltersButton = await waitQuerySelector('a[data-test-id="workflows-filter-reset"]');
  removeFiltersButton.click();

  const intervalId = setInterval(() => {
    if (isUnfiltered()) {
      clearInterval(intervalId);
      queryXpath(`//li[contains(., "${tagName}") and @data-test-id="tag"]`)?.click();
    }
  }, 100);
}

/**
 * Extracts and returns an object of tag names with their counts.
 *
 * @returns {Promise<Object>} A promise that resolves to an object with tag names as keys and counts as values.
 */
async function extractTagNamesWithCounts() {
  let retryCount = 0;
  const maxRetries = 5;
  
  while (retryCount < maxRetries) {
    try {
      await waitQuerySelector('li[data-test-id="tag"] > span', null, 3000);
      const tagCountMap = {};
      
      // Get all workflow elements
      const workflowElements = document.querySelectorAll('[data-test-id="workflows-list-item"]');
      
      workflowElements.forEach(workflow => {
        const tagElements = workflow.querySelectorAll('li[data-test-id="tag"] > span');
        tagElements.forEach(tagElement => {
          const tagName = tagElement.textContent.trim();
          tagCountMap[tagName] = (tagCountMap[tagName] || 0) + 1;
        });
      });
      
      return tagCountMap;
    } catch (error) {
      retryCount++;
      console.warn(`n8n Folder View: Failed to extract tags (attempt ${retryCount}/${maxRetries})`, error);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.error('n8n Folder View: Failed to extract tags after multiple attempts');
  return {};
}

/**
 * Waits for an element matching the selector to appear in the DOM.
 *
 * @param {string} selector - The CSS selector of the element to wait for.
 * @param {Node} [node=document] - The root node to query within. Defaults to the document.
 * @param {number} [timeout=10000] - Maximum time to wait in milliseconds.
 * @returns {Promise<Element>} A promise that resolves to the found element.
 */
async function waitQuerySelector(selector, node = document, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkElement = () => {
      const element = (node || document).querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for element: ${selector}`));
        return;
      }
      
      setTimeout(checkElement, 100);
    };
    
    checkElement();
  });
}

/**
 * Evaluates the given XPath expression and returns the first matching node.
 *
 * @param {string} xpath - The XPath expression to evaluate.
 * @param {Node} [node=document] - The root node to query within. Defaults to the document.
 * @returns {Node | null} The first node that matches the XPath expression, or null if no match is found.
 */
function queryXpath(xpath, node = document) {
  const result = document.evaluate(xpath, node, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue;
}

/**
 * Saves the current state to localStorage.
 */
function saveState() {
  try {
    localStorage.setItem('n8nFolderView', JSON.stringify({
      selectedTag: state.selectedTag,
      sortOrder: state.sortOrder
    }));
  } catch (error) {
    console.warn('n8n Folder View: Failed to save state', error);
  }
}

/**
 * Restores the state from localStorage and applies it.
 */
function restoreState() {
  try {
    const savedState = JSON.parse(localStorage.getItem('n8nFolderView'));
    if (savedState) {
      if (savedState.sortOrder) {
        state.sortOrder = savedState.sortOrder;
        const sortSelect = document.querySelector('#folder-sort-select');
        if (sortSelect) {
          sortSelect.value = state.sortOrder;
        }
        sortFolders();
      }
      
      if (savedState.selectedTag) {
        state.selectedTag = savedState.selectedTag;
        const folderItems = document.querySelectorAll('.folder-list-item');
        const targetItem = Array.from(folderItems).find(item => 
          item.dataset.tag === state.selectedTag
        );
        
        if (targetItem) {
          applyActive(targetItem);
          filterWorkflowsByTag(state.selectedTag);
        }
      }
    }
  } catch (error) {
    console.warn('n8n Folder View: Failed to restore state', error);
  }
}

/**
 * Observes changes to the DOM to detect new tags being added.
 */
function setupTagObserver() {
  const observer = new MutationObserver(async (mutations) => {
    // Check if mutations affect the tags
    const tagChanged = mutations.some(mutation => {
      return mutation.target.querySelector && mutation.target.querySelector('li[data-test-id="tag"]');
    });
    
    if (tagChanged) {
      const tagData = await extractTagNamesWithCounts();
      const folderList = document.querySelector('#folder-list');
      
      if (folderList && Object.keys(tagData).length > 0) {
        // Remember the currently selected tag
        const activeTag = state.selectedTag;
        
        // Remove all existing folders
        while (folderList.firstChild) {
          folderList.removeChild(folderList.firstChild);
        }
        
        // Recreate the folder view with updated tags
        state.tags = tagData;
        
        // Add the All folder first
        const totalCount = Object.values(tagData).reduce((sum, count) => sum + count, 0);
        folderList.insertAdjacentHTML('beforeend', TEMPLATES.folderItem('All', totalCount));
        
        // Add all the tag folders
        Object.entries(tagData).forEach(([tagName, count]) => {
          folderList.insertAdjacentHTML('beforeend', TEMPLATES.folderItem(tagName, count));
        });
        
        // Re-add event listeners
        const folderItems = document.querySelectorAll('.folder-list-item');
        folderItems.forEach(item => {
          item.addEventListener('mouseenter', updateTooltipPosition);
          item.addEventListener('mousemove', updateTooltipPosition);
        });
        
        sortFolders();
        
        // Restore active state
        if (activeTag) {
          const targetItem = Array.from(folderItems).find(item => item.dataset.tag === activeTag);
          if (targetItem) {
            applyActive(targetItem);
          }
        }
      }
    }
  });
  
  // Start observing the workflows container for changes after a delay to ensure it's loaded
  setTimeout(() => {
    const workflowsContainer = document.querySelector('.workflows-list');
    if (workflowsContainer) {
      observer.observe(workflowsContainer, { childList: true, subtree: true });
    }
  }, 2000);
}

async function main() {
  try {
    // Show loading state
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) {
      console.error('n8n Folder View: Could not find sidebar element');
      return;
    }
    
    const tagData = await extractTagNamesWithCounts();
    if (Object.keys(tagData).length === 0) {
      console.warn('n8n Folder View: No tags found');
    }
    
    createFolderView(tagData);
    setupTagObserver();
    
    // Set "All" folder as active by default if no saved state
    if (!state.selectedTag) {
      const allFolder = document.querySelector('.folder-list-item[data-tag="All"]');
      if (allFolder) {
        allFolder.classList.add('is-active');
        state.selectedTag = 'All';
        saveState();
      }
    }
  } catch (error) {
    console.error('n8n Folder View: Error in main function', error);
  }
}

// Start when the page is fully loaded
if (document.readyState === 'complete') {
  main();
} else {
  window.addEventListener('load', main);
}