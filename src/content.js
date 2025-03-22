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

  const sidebar = getSidebar();
  if (!sidebar) return;

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
 * Creates the initial folder view container with loading spinner.
 * @returns {Promise<boolean>} Whether the container was successfully created
 */
async function createInitialContainer() {
  try {
    // Wait for the sidebar to be available
    const sidebar = await waitForSidebar();
    
    // Find the element to insert our folder view
    // Try multiple selectors to find the right place
    const possibleContainers = [
      '#sidebar [class^="_menuContent_"]',
      '.el-menu',
      '[role="navigation"] > div',
      '#sidebar > div',
      'aside > div'
    ];
    
    let menuContent = null;
    for (const selector of possibleContainers) {
      menuContent = document.querySelector(selector);
      if (menuContent) {
        console.log(`n8n Folder View: Found menu container using selector: ${selector}`);
        break;
      }
    }
    
    if (!menuContent) {
      // Fallback: insert after the sidebar element itself
      menuContent = sidebar;
      if (!menuContent) {
        console.error('n8n Folder View: Could not find a suitable container for folder view');
        return false;
      }
    }
    
    // Create the container with just the loading spinner active
    menuContent.insertAdjacentHTML('beforebegin', TEMPLATES.folderViewContainer);
    
    // Make sure the loading spinner is visible
    const loadingSpinner = document.querySelector('#folder-loading');
    if (loadingSpinner) {
      loadingSpinner.style.display = 'block';
    }
    
    return true;
  } catch (error) {
    console.error('n8n Folder View: Error creating initial container', error);
    return false;
  }
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
    const removeFiltersButton = await waitQuerySelector('a[data-test-id="workflows-filter-reset"]', null, 2000).catch(() => null);
    if (removeFiltersButton) {
      removeFiltersButton.click();
    } else {
      // If we can't find the reset button, try navigating directly
      window.location.href = '/home/workflows';
    }
    return;
  }
  
  // Define possible selectors for tag elements that can be clicked
  const possibleTagSelectors = [
    // New n8n structure
    `span.n8n-tag:has(> span:contains("${tagName}"))`,
    // Older structure
    `li[data-test-id="tag"]:has(> span:contains("${tagName}"))`,
    // XPath alternatives will be used for complex cases
  ];
  
  console.log(`n8n Folder View: Trying to filter by tag "${tagName}"`);
  
  // Try each CSS selector first
  for (const selector of possibleTagSelectors) {
    try {
      const tagElement = document.querySelector(selector);
      if (tagElement) {
        console.log(`n8n Folder View: Found tag element using selector: ${selector}`);
        tagElement.click();
        return;
      }
    } catch (error) {
      console.warn(`n8n Folder View: Selector error: ${error.message}`);
      // Continue to next selector
    }
  }
  
  // If CSS selectors didn't work, try XPath as it can handle contains() more reliably
  const tagXPaths = [
    `//span[contains(@class, "n8n-tag")][.//span[contains(text(), "${tagName}")]]`,
    `//li[@data-test-id="tag"][.//span[contains(text(), "${tagName}")]]`,
    `//span[contains(text(), "${tagName}")]`
  ];
  
  for (const xpath of tagXPaths) {
    const tagElement = queryXpath(xpath);
    if (tagElement) {
      console.log(`n8n Folder View: Found tag element using XPath: ${xpath}`);
      tagElement.click();
      return;
    }
  }
  
  // If we can't find the tag directly, try another approach
  console.warn(`n8n Folder View: Could not find tag element for "${tagName}", trying to use filters`);
  
  // Try to use the filter input if available
  const filterInput = await waitQuerySelector('input[placeholder*="filter"], input[placeholder*="search"]', null, 2000).catch(() => null);
  if (filterInput) {
    console.log('n8n Folder View: Using filter input');
    filterInput.focus();
    filterInput.value = tagName;
    filterInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Trigger Enter key to apply the filter
    setTimeout(() => {
      filterInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    }, 300);
  } else {
    console.error(`n8n Folder View: Could not find any way to filter by tag "${tagName}"`);
  }
}

/**
 * Extracts and returns an object of tag names with their counts.
 *
 * @returns {Promise<Object>} A promise that resolves to an object with tag names as keys and counts as values.
 */
async function extractTagNamesWithCounts() {
  let retryCount = 0;
  const maxRetries = 5;
  
  console.log('n8n Folder View: Starting tag extraction');
  
  while (retryCount < maxRetries) {
    try {
      const tagCountMap = {};
      
      // Define possible tag selectors based on different n8n versions
      const possibleTagSelectors = [
        // New n8n tag structure (from the provided HTML)
        'span.n8n-tag > span',
        '.n8n-tags [data-test-id="workflow-card-tags"] span.n8n-tag > span',
        // Older tag structure
        'li[data-test-id="tag"] > span',
        // Generic fallback
        '[data-test-id*="tag"] > span'
      ];
      
      // Try each selector until we find tags
      let tagElements = [];
      for (const selector of possibleTagSelectors) {
        tagElements = document.querySelectorAll(selector);
        console.log(`n8n Folder View: Trying selector "${selector}" - found ${tagElements.length} elements`);
        if (tagElements.length > 0) {
          break;
        }
      }
      
      if (tagElements.length === 0) {
        // Special case: try to find any elements that might contain tag text
        console.log('n8n Folder View: No tags found with standard selectors, trying broader search');
        
        // Look for workflow elements first
        const workflowCards = document.querySelectorAll('[data-test-id*="workflow"], .workflow-card, [class*="workflow"]');
        console.log(`n8n Folder View: Found ${workflowCards.length} potential workflow cards`);
        
        // For debugging, log the HTML structure of a workflow card if found
        if (workflowCards.length > 0) {
          console.log('n8n Folder View: Example workflow card HTML:', workflowCards[0].outerHTML);
        }
        
        // Check all possible child elements that might contain tags
        workflowCards.forEach(card => {
          const potentialTagContainers = card.querySelectorAll('[class*="tag"], [data-test-id*="tag"]');
          console.log(`n8n Folder View: Found ${potentialTagContainers.length} potential tag containers in workflow card`);
          
          potentialTagContainers.forEach(container => {
            const spans = container.querySelectorAll('span');
            spans.forEach(span => {
              const text = span.textContent.trim();
              if (text && text.length > 0) {
                console.log(`n8n Folder View: Found potential tag text: "${text}"`);
                tagCountMap[text] = (tagCountMap[text] || 0) + 1;
              }
            });
          });
        });
      } else {
        // Process standard tag elements
        tagElements.forEach(tagElement => {
          const tagName = tagElement.textContent.trim();
          if (tagName && tagName.length > 0) {
            tagCountMap[tagName] = (tagCountMap[tagName] || 0) + 1;
          }
        });
      }
      
      console.log(`n8n Folder View: Extracted ${Object.keys(tagCountMap).length} unique tags:`, Object.keys(tagCountMap));
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
    // Check if we might need to update the tags
    const significantChanges = mutations.some(mutation => {
      // Look for changes to elements that might contain tags
      return mutation.target.querySelector && (
        mutation.target.querySelector('[data-test-id*="tag"]') ||
        mutation.target.querySelector('[class*="tag"]') ||
        mutation.target.querySelector('[data-test-id*="workflow"]')
      );
    });
    
    if (significantChanges) {
      console.log('n8n Folder View: Detected DOM changes that might affect tags');
      
      // Wait a moment for any changes to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const tagData = await extractTagNamesWithCounts();
      if (Object.keys(tagData).length === 0) {
        console.warn('n8n Folder View: No tags found after DOM changes');
        return;
      }
      
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
  
  // Start observing after a delay and observe more of the document to catch all changes
  setTimeout(() => {
    // Observe the main content area rather than just workflows-list
    const contentArea = document.querySelector('#app') || document.body;
    if (contentArea) {
      observer.observe(contentArea, { childList: true, subtree: true });
      console.log('n8n Folder View: Started observing DOM for tag changes');
    }
  }, 2000);
}

/**
 * Gets the sidebar element using various selectors to ensure compatibility.
 * 
 * @returns {Element|null} The sidebar element or null if not found.
 */
function getSidebar() {
  // Try different possible selectors for the sidebar
  const sidebarSelectors = [
    '#sidebar',
    '[class*="sidebar"]',
    '[class*="Sidebar"]',
    '[id*="sidebar"]',
    '[id*="Sidebar"]',
    'aside', // n8n might use a semantic aside element for the sidebar
    '[class*="nav"]', // Sometimes sidebars have nav-related class names
    '[role="navigation"]', // Accessibility role
    // n8n-specific selectors
    '[data-test-id="main-sidebar"]',
    '.el-menu',
    '#app > div > div:first-child' // Common pattern in Vue apps like n8n
  ];
  
  // Try each selector
  for (const selector of sidebarSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      // Verify it's likely a sidebar by checking size and position
      const rect = element.getBoundingClientRect();
      // Most sidebars are tall and narrow, positioned at the left edge
      if (rect.height > 200 && rect.width < 400 && rect.left < 100) {
        console.log(`n8n Folder View: Found sidebar using selector: ${selector}`);
        return element;
      }
    }
  }
  
  // Fallback: look for the tallest, narrowest element on the left side
  const possibleSidebars = Array.from(document.querySelectorAll('div, aside, nav'))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.height > 300 && rect.width < 300 && rect.left < 50;
    })
    .sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      // Prefer taller, narrower elements
      return (rectB.height / rectB.width) - (rectA.height / rectA.width);
    });
  
  if (possibleSidebars.length > 0) {
    console.log('n8n Folder View: Found sidebar using dimension heuristics');
    return possibleSidebars[0];
  }
  
  return null;
}

/**
 * Waits for the sidebar to be available in the DOM.
 * 
 * @param {number} maxAttempts - Maximum number of attempts to find the sidebar
 * @param {number} interval - Interval between attempts in milliseconds
 * @returns {Promise<Element>} A promise that resolves to the sidebar element
 */
async function waitForSidebar(maxAttempts = 20, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const checkSidebar = () => {
      attempts++;
      const sidebar = getSidebar();
      
      if (sidebar) {
        console.log(`n8n Folder View: Found sidebar after ${attempts} attempts`);
        resolve(sidebar);
        return;
      }
      
      if (attempts >= maxAttempts) {
        console.error(`n8n Folder View: Could not find sidebar after ${maxAttempts} attempts`);
        reject(new Error('Sidebar not found'));
        return;
      }
      
      console.log(`n8n Folder View: Waiting for sidebar (attempt ${attempts}/${maxAttempts})`);
      setTimeout(checkSidebar, interval);
    };
    
    checkSidebar();
  });
}

async function main() {
  try {
    console.log('n8n Folder View: Starting extension');
    
    // Create the container first, with loading spinner active
    const containerCreated = await createInitialContainer();
    if (!containerCreated) {
      console.error('n8n Folder View: Failed to create initial container, retrying in 5 seconds');
      setTimeout(main, 5000);
      return;
    }
    
    // Wait for the page to fully settle
    console.log('n8n Folder View: Waiting for page to stabilize before extracting tags');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const tagData = await extractTagNamesWithCounts();
    if (Object.keys(tagData).length === 0) {
      console.warn('n8n Folder View: No tags found');
      // Add a fallback for testing
      console.log('n8n Folder View: Adding fallback tags for testing');
      const fallbackTags = {
        'sample-tag-1': 1,
        'sample-tag-2': 2,
        'dialer': 3,
        'jason steele': 2,
        'avison young': 1
      };
      createFolderView(fallbackTags);
    } else {
      console.log(`n8n Folder View: Found ${Object.keys(tagData).length} tags`);
      createFolderView(tagData);
    }
    
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
    
    // Add a retry mechanism
    setTimeout(() => {
      console.log('n8n Folder View: Retrying initialization...');
      main();
    }, 5000);
  }
}

// Wait a bit longer before starting to ensure the page is fully loaded
if (document.readyState === 'complete') {
  setTimeout(main, 1000);
} else {
  window.addEventListener('load', () => setTimeout(main, 1000));
}