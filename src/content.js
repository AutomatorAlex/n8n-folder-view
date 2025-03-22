const TEMPLATES = {
  folderItem: (tagname, count = 0) => `
    <div class="folder-list-item" data-tag="${tagname}">
      <span class="folder-list-item-icon">
        <i class="mdi mdi-folder-outline"></i>
      </span>
      <span class="folder-list-item-name">${tagname}</span>
      <span class="folder-list-item-count">${count}</span>
      ${tagname !== 'All' ? '<button class="folder-remove-btn" title="Remove folder"><i class="mdi mdi-close"></i></button>' : ''}
      <div class="tooltip">${tagname} (${count} workflows)</div>
    </div>
  `,
  
  customSidebar: `
    <div id="n8n-custom-sidebar">
      <div class="sidebar-header">
        <div class="logo-container">
          <!-- Updated logo size: doubled from 32x32 to 64x64 -->
          <img src="https://raw.githubusercontent.com/n8n-io/n8n/master/assets/n8n-logo.png" alt="n8n Logo" width="64" height="64" />
        </div>
        <h2>n8n <span>Folders</span></h2>
      </div>
      
      <div class="sidebar-search">
        <div class="search-container">
          <i class="mdi mdi-magnify search-icon"></i>
          <input type="text" id="folder-search" placeholder="Search folders...">
          <i class="mdi mdi-close clear-search" id="clear-search"></i>
        </div>
      </div>
      
      <div class="sidebar-section folders-section">
        <div class="section-header">
          <h3>Folders</h3>
          <div class="section-actions">
            <select id="folder-sort-select" title="Sort folders">
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="count-desc">Count (High-Low)</option>
              <option value="count-asc">Count (Low-High)</option>
            </select>
          </div>
        </div>
        <div id="folder-loading" class="loading-spinner"></div>
        <div id="folder-list">
          <!-- Folders will be inserted here -->
        </div>
      </div>
      
      <div class="sidebar-footer">
        <button id="folder-cleanup-btn" class="action-button">
          <i class="mdi mdi-broom"></i>Clean Up Unused Folders
        </button>
        <div class="sidebar-info">
          <span>n8n Folder View</span>
        </div>
      </div>
    </div>
  `
};

// Store state
const state = {
  tags: {},
  selectedTag: null,
  sortOrder: 'name-asc',
  allTags: {}, 
  lastSyncTime: 0,
  sidebarInitialized: false,
  searchFilter: ''
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
 * Shows a loading indicator immediately when the extension initializes
 */
function showInitialLoadingIndicator() {
  // Try to find the sidebar early
  const possibleSidebarContainers = [
    '#sidebar',
    '[class*="sidebar"]',
    '[role="navigation"]',
    'aside'
  ];
  
  let container = null;
  for (const selector of possibleSidebarContainers) {
    container = document.querySelector(selector);
    if (container) break;
  }
  
  if (!container) {
    // If we can't find the sidebar yet, add to body and it will be moved later
    container = document.body;
  }
  
  // Create a minimal container with just the loading spinner
  const tempContainer = document.createElement('div');
  tempContainer.id = 'n8n-folder-view-loading';
  tempContainer.innerHTML = `
    <div style="color: #C3C9D5; padding: 16px 12px; margin-top: 10px;">
      <h3 style="margin: 0; font-size: 16px; font-weight: 500;">Loading Folders...</h3>
      <div class="loading-spinner" style="
        width: 20px; 
        height: 20px; 
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: #C3C9D5;
        animation: spin 1s linear infinite;
        margin: 10px auto;
      "></div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    </div>
  `;
  
  // Add to the page
  container.appendChild(tempContainer);
  
  console.log('n8n Folder View: Displayed initial loading indicator');
}

// Run this immediately
showInitialLoadingIndicator();

// Cache for sidebar element to prevent repeated queries
let sidebarCache = null;
let sidebarLastQueried = 0;
const SIDEBAR_CACHE_TTL = 2000; // 2 seconds

/**
 * Gets the sidebar element using various selectors to ensure compatibility.
 * Uses caching to prevent excessive DOM queries.
 * 
 * @returns {Element|null} The sidebar element or null if not found.
 */
function getSidebar() {
  // Check if we have a cached sidebar that's still valid
  const now = Date.now();
  if (sidebarCache && (now - sidebarLastQueried < SIDEBAR_CACHE_TTL)) {
    return sidebarCache;
  }
  
  // Update the last query time
  sidebarLastQueried = now;
  
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
        // Only log if we're finding it the first time or it changed
        if (!sidebarCache || sidebarCache !== element) {
          console.log(`n8n Folder View: Found sidebar using selector: ${selector}`);
        }
        sidebarCache = element;
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
    // Only log if we're finding it the first time or it changed
    if (!sidebarCache || sidebarCache !== possibleSidebars[0]) {
      console.log('n8n Folder View: Found sidebar using dimension heuristics');
    }
    sidebarCache = possibleSidebars[0];
    return possibleSidebars[0];
  }
  
  // No sidebar found
  sidebarCache = null;
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

/**
 * Creates the custom sidebar container that will replace the original n8n sidebar.
 * @returns {Promise<boolean>} Whether the container was successfully created
 */
async function createCustomSidebar() {
  try {
    // Remove any temporary loading indicator
    const tempLoader = document.getElementById('n8n-folder-view-loading');
    if (tempLoader) {
      tempLoader.remove();
    }
    
    // Wait for the original sidebar to be available
    const originalSidebar = await waitForSidebar();
    if (!originalSidebar) {
      console.error('n8n Folder View: Could not find original sidebar');
      return false;
    }
    
    // Check if we've already initialized the sidebar
    if (state.sidebarInitialized) {
      console.log('n8n Folder View: Sidebar already initialized');
      return true;
    }
    
    // Get original sidebar dimensions
    const sidebarRect = originalSidebar.getBoundingClientRect();
    const originalWidth = sidebarRect.width;
    const originalHeight = sidebarRect.height;
    
    // Create our custom sidebar
    document.body.insertAdjacentHTML('afterbegin', TEMPLATES.customSidebar);
    
    // Get reference to our new sidebar
    const customSidebar = document.getElementById('n8n-custom-sidebar');
    if (!customSidebar) {
      console.error('n8n Folder View: Failed to insert custom sidebar');
      return false;
    }
    
    // Position and size the custom sidebar to match original
    customSidebar.style.width = Math.max(260, originalWidth) + 'px';
    customSidebar.style.height = '100vh';
    
    // Hide the original sidebar
    originalSidebar.style.display = 'none';
    
    // Add Material Design Icons if not already added
    if (!document.getElementById('mdi-font')) {
      const mdiFontLink = document.createElement('link');
      mdiFontLink.id = 'mdi-font';
      mdiFontLink.rel = 'stylesheet';
      mdiFontLink.href = 'https://cdn.jsdelivr.net/npm/@mdi/font@6.9.96/css/materialdesignicons.min.css';
      document.head.appendChild(mdiFontLink);
    }
    
    // Add search functionality
    const searchInput = document.getElementById('folder-search');
    const clearButton = document.getElementById('clear-search');
    
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.searchFilter = e.target.value.toLowerCase().trim();
        filterFolderList();
      });
      
      // Clear search when X is clicked
      if (clearButton) {
        clearButton.addEventListener('click', () => {
          searchInput.value = '';
          state.searchFilter = '';
          filterFolderList();
          clearButton.style.display = 'none';
        });
        
        // Show/hide clear button
        searchInput.addEventListener('input', () => {
          clearButton.style.display = searchInput.value ? 'block' : 'none';
        });
      }
    }
    
    // Set sidebar as initialized
    state.sidebarInitialized = true;
    
    // Make sure the loading spinner is visible
    const loadingSpinner = document.querySelector('#folder-loading');
    if (loadingSpinner) {
      loadingSpinner.style.display = 'block';
      
      // Safety timeout - hide spinner after 10 seconds no matter what
      setTimeout(() => {
        if (loadingSpinner && loadingSpinner.style.display !== 'none') {
          console.log('n8n Folder View: Force hiding spinner after timeout');
          loadingSpinner.style.display = 'none';
        }
      }, 10000);
    }
    
    console.log('n8n Folder View: Custom sidebar successfully created');
    return true;
  } catch (error) {
    console.error('n8n Folder View: Error creating custom sidebar', error);
    return false;
  }
}

/**
 * Filters the folder list based on the search input
 */
function filterFolderList() {
  const folderItems = document.querySelectorAll('.folder-list-item');
  const searchFilter = state.searchFilter.toLowerCase();
  
  folderItems.forEach(item => {
    const tagName = item.dataset.tag.toLowerCase();
    if (tagName === 'all' || tagName.includes(searchFilter)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
  
  // Show no results message if needed
  const folderList = document.getElementById('folder-list');
  const noResults = document.getElementById('no-folder-results');
  
  if (folderList) {
    const visibleFolders = Array.from(folderItems).filter(item => item.style.display !== 'none');
    
    if (visibleFolders.length === 0 && searchFilter) {
      if (!noResults) {
        folderList.insertAdjacentHTML('beforeend', `
          <div id="no-folder-results" class="no-results">
            <i class="mdi mdi-folder-search-outline"></i>
            <p>No folders matching "${state.searchFilter}"</p>
          </div>
        `);
      }
    } else if (noResults) {
      noResults.remove();
    }
  }
}

/**
 * Creates a view for folders based on the provided tag names and counts.
 *
 * @param {Object} tagData - Object containing tag names as keys and counts as values.
 */
function createFolderView(tagData) {
  try {
    // Save to state
    state.tags = tagData;
    
    const folderList = document.querySelector('#folder-list');
    if (!folderList) return;
    
    // Clear the folder list first
    folderList.innerHTML = '';
    
    const addFolderListItem = (tagname, count = 0) => {
      folderList.insertAdjacentHTML('beforeend', TEMPLATES.folderItem(tagname, count));
    }

    const handleFolderListItemClick = (event) => {
      // Don't trigger if the remove button was clicked
      if (event.target.closest('.folder-remove-btn')) {
        return;
      }

      const folderListItem = event.target.closest('.folder-list-item');
      if (folderListItem) {
        const tagName = folderListItem.dataset.tag;
        console.log(`n8n Folder View: Folder clicked: ${tagName}`);
        state.selectedTag = tagName;
        saveState();
        applyActive(folderListItem);
        filterWorkflowsByTag(tagName);
      }
    }

    const handleRemoveButtonClick = (event) => {
      const button = event.target.closest('.folder-remove-btn');
      if (!button) return;
      
      event.stopPropagation(); // Prevent folder selection

      const folderItem = button.closest('.folder-list-item');
      const tagName = folderItem.dataset.tag;
      
      if (confirm(`Remove folder "${tagName}"?`)) {
        // Remove from allTags
        delete state.allTags[tagName];
        
        // If the removed folder was selected, select "All" instead
        if (state.selectedTag === tagName) {
          state.selectedTag = 'All';
          
          // Navigate to All (unfiltered view)
          filterWorkflowsByTag('All');
        }
        
        saveState();
        
        // Redraw the folder list
        preserveFolderList();
      }
    }

    const handleCleanupButtonClick = (event) => {
      event.preventDefault();
      
      if (confirm('Remove all unused folders? This will keep only folders for tags that currently exist in your workflows.')) {
        performTagCleanup(true);
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
      // Add direct click handler to each folder item for better reliability
      item.addEventListener('click', (e) => {
        // Skip if clicking on the delete button
        if (!e.target.closest('.folder-remove-btn')) {
          const tagName = item.dataset.tag;
          console.log(`n8n Folder View: Direct folder click: ${tagName}`);
          state.selectedTag = tagName;
          saveState();
          applyActive(item);
          filterWorkflowsByTag(tagName);
        }
      });
    });

    // Still add the list-level click handler as a backup
    if (folderList) {
      folderList.addEventListener('click', handleFolderListItemClick);
      
      // Add listener for remove buttons
      folderList.addEventListener('click', handleRemoveButtonClick);
    }

    // Add cleanup button listener
    const cleanupButton = document.querySelector('#folder-cleanup-btn');
    if (cleanupButton) {
      cleanupButton.addEventListener('click', handleCleanupButtonClick);
    }

    // Add sort event listener
    const sortSelect = document.querySelector('#folder-sort-select');
    if (sortSelect) {
      sortSelect.value = state.sortOrder;
      sortSelect.addEventListener('change', handleSortChange);
    }

    // Apply any active search filter
    if (state.searchFilter) {
      filterFolderList();
    }

    // Explicitly hide loading spinner at the end of folder view creation
    const loadingSpinner = document.querySelector('#folder-loading');
    if (loadingSpinner) {
      loadingSpinner.style.display = 'none';
    }

    // Restore selection if one exists
    restoreState();
  } catch (error) {
    console.error('n8n Folder View: Error creating folder view', error);
    
    // Make sure spinner is hidden even if there's an error
    const loadingSpinner = document.querySelector('#folder-loading');
    if (loadingSpinner) {
      loadingSpinner.style.display = 'none';
    }
  }
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
  // Only apply filtering if we're on the workflow home page (/home/workflows)
  if (!window.location.pathname.startsWith('/home/workflows')) {
    console.log('n8n Folder View: Not on workflows page, ignoring folder filter.');
    return;
  }
  // Store the currently selected tag before filtering
  state.selectedTag = tagName;
  saveState();
  
  // First, try to clear any existing filters
  try {
    const removeFiltersButton = await waitQuerySelector(
      'a[data-test-id="workflows-filter-reset"]', 
      null, 
      1000
    ).catch(() => null);
    
    if (removeFiltersButton) {
      console.log('n8n Folder View: Clearing existing filters before applying new one');
      removeFiltersButton.click();
      
      // Wait a moment for the UI to catch up
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } catch (err) {
    console.log('n8n Folder View: Could not clear filters, continuing anyway');
  }
  
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
  
  console.log(`n8n Folder View: Trying to filter by tag "${tagName}"`);
  
  // Skip the problematic selectors and go straight to XPath which works
  const tagXPaths = [
    `//span[contains(@class, "n8n-tag")][.//span[contains(text(), "${tagName}")]]`,
    `//li[@data-test-id="tag"][.//span[contains(text(), "${tagName}")]]`,
    `//span[contains(text(), "${tagName}")]`
  ];
  
  let tagFound = false;
  
  for (const xpath of tagXPaths) {
    try {
      const tagElement = queryXpath(xpath);
      if (tagElement) {
        console.log(`n8n Folder View: Found tag element using XPath: ${xpath}`);
        tagElement.click();
        tagFound = true;
        return;
      }
    } catch (err) {
      console.warn(`n8n Folder View: XPath error: ${err.message}`);
    }
  }
  
  // If we can't find the tag directly, try another approach
  if (!tagFound) {
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
}

/**
 * Extracts and returns an object of tag names with their counts.
 *
 * @param {boolean} updateAllTags - Whether to update the allTags state with the results
 * @returns {Promise<Object>} A promise that resolves to an object with tag names as keys and counts as values.
 */
async function extractTagNamesWithCounts(updateAllTags = true) {
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
      
      // If we are to update allTags and we found some tags
      if (updateAllTags && Object.keys(tagCountMap).length > 0) {
        // Merge new tags into allTags
        Object.keys(tagCountMap).forEach(tag => {
          // Only update count if higher than existing
          if (!state.allTags[tag] || tagCountMap[tag] > state.allTags[tag]) {
            state.allTags[tag] = tagCountMap[tag];
          }
        });
      }
      
      if (updateAllTags) {
        // Update the last sync time
        state.lastSyncTime = Date.now();
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
      sortOrder: state.sortOrder,
      allTags: state.allTags, // Also save all tags
      lastSyncTime: state.lastSyncTime // Save last sync time
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
      
      if (savedState.allTags) {
        state.allTags = savedState.allTags;
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
      
      if (savedState.lastSyncTime) {
        state.lastSyncTime = savedState.lastSyncTime;
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
      
      // If we're not currently filtering, update the all tags list
      if (state.selectedTag === 'All' || !state.selectedTag) {
        const tagData = await extractTagNamesWithCounts(true);
        if (Object.keys(tagData).length === 0) {
          console.warn('n8n Folder View: No tags found after DOM changes');
          return;
        }
      }
      
      // Regardless of filtering state, update the folder list using all known tags
      await preserveFolderList();
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

/**
 * Performs a cleanup of tags that no longer exist in any workflows
 * 
 * @param {boolean} force - Whether to force cleanup even if not due for a sync
 * @returns {Promise<number>} Number of tags removed
 */
async function performTagCleanup(force = false) {
  // Only do cleanup if forced or if it's been more than 24 hours since last sync
  const ONE_DAY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  if (!force && Date.now() - state.lastSyncTime < ONE_DAY) {
    console.log('n8n Folder View: Tag cleanup skipped, not due yet');
    return 0;
  }
  
  console.log('n8n Folder View: Starting tag cleanup');
  
  // Extract currently existing tags
  const currentTags = await extractTagNamesWithCounts(false);
  
  // Count how many tags we're removing
  let removedCount = 0;
  
  // Remove tags from allTags that don't exist in currentTags
  for (const tag in state.allTags) {
    if (tag !== 'All' && !currentTags[tag]) {
      delete state.allTags[tag];
      removedCount++;
    }
  }
  
  // If any were removed, update the UI
  if (removedCount > 0) {
    console.log(`n8n Folder View: Removed ${removedCount} unused tags`);
    
    // Update last sync time
    state.lastSyncTime = Date.now();
    
    saveState();
    await preserveFolderList();
  } else {
    console.log('n8n Folder View: No unused tags found');
  }
  
  return removedCount;
}

/**
 * Preserves the full folder list even when filtering
 * @param {boolean} forceRefresh - Whether to force a refresh of all folders
 */
async function preserveFolderList(forceRefresh = false) {
  try {
    // When filtering happens, we should use the comprehensive allTags list
    // rather than just what's currently visible on the page
    if (forceRefresh || Object.keys(state.allTags).length === 0) {
      // Initial load, get all tags
      const tagData = await extractTagNamesWithCounts(true);
      if (Object.keys(tagData).length === 0) {
        console.warn('n8n Folder View: No tags found for initial load');
        // Use fallback tags if needed
        if (Object.keys(state.allTags).length === 0) {
          state.allTags = {
            'sample-tag-1': 1,
            'sample-tag-2': 2,
            'dialer': 3,
            'jason steele': 2,
            'avison young': 1
          };
        }
      }
    }

    // Use the stored allTags instead of the current visible tags
    const folderList = document.querySelector('#folder-list');
    if (!folderList) return;
    
    // Remember the currently selected tag
    const activeTag = state.selectedTag;
    
    // Remove all existing folders
    while (folderList.firstChild) {
      folderList.removeChild(folderList.firstChild);
    }
    
    // Add the All folder first
    const totalCount = Object.values(state.allTags).reduce((sum, count) => sum + count, 0);
    folderList.insertAdjacentHTML('beforeend', TEMPLATES.folderItem('All', totalCount));
    
    // Add all the tag folders using the comprehensive list
    Object.entries(state.allTags).forEach(([tagName, count]) => {
      folderList.insertAdjacentHTML('beforeend', TEMPLATES.folderItem(tagName, count));
    });
    
    // Re-add event listeners and ensure folders are clickable
    const folderItems = document.querySelectorAll('.folder-list-item');
    folderItems.forEach(item => {
      item.addEventListener('mouseenter', updateTooltipPosition);
      item.addEventListener('mousemove', updateTooltipPosition);
      
      // Make sure each folder is clickable with a direct handler
      item.addEventListener('click', (event) => {
        if (!event.target.closest('.folder-remove-btn')) {
          const tagName = item.dataset.tag;
          console.log(`n8n Folder View: Direct folder click on ${tagName}`);
          state.selectedTag = tagName;
          saveState();
          applyActive(item);
          filterWorkflowsByTag(tagName);
          
          // Force event propagation to stop
          event.preventDefault();
          event.stopPropagation();
        }
      }, true);
    });
    
    sortFolders();
    
    // Restore active state
    if (activeTag) {
      const targetItem = Array.from(folderItems).find(item => 
        item.dataset.tag === activeTag
      );
      if (targetItem) {
        applyActive(targetItem);
      }
    }
    
    // Optionally, clean up tags that no longer exist
    // We do this occasionally to keep the folder list tidy
    if (Math.random() < 0.1) { // 10% chance to check on each folder refresh
      performTagCleanup();
    }
    
    // Ensure loading spinner is hidden after this operation completes
    const loadingSpinner = document.querySelector('#folder-loading');
    if (loadingSpinner) {
      loadingSpinner.style.display = 'none';
    }
  } catch (error) {
    console.error('n8n Folder View: Error preserving folder list', error);
    // Make sure spinner is hidden even if there's an error
    const loadingSpinner = document.querySelector('#folder-loading');
    if (loadingSpinner) {
      loadingSpinner.style.display = 'none';
    }
  }
}

async function main() {
  try {
    console.log('n8n Folder View: Starting extension with custom sidebar');
    
    // Create the custom sidebar
    const sidebarCreated = await createCustomSidebar();
    if (!sidebarCreated) {
      console.error('n8n Folder View: Failed to create custom sidebar, retrying in 5 seconds');
      setTimeout(main, 5000);
      return;
    }
    
    // Wait for the page to fully settle
    console.log('n8n Folder View: Waiting for page to stabilize before extracting tags');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Use the new preserveFolderList function to handle tag extraction and folder creation
    await preserveFolderList(true);
    
    // Do an initial tag cleanup if it's been a long time
    if (Date.now() - state.lastSyncTime > 7 * 24 * 60 * 60 * 1000) { // 1 week
      await performTagCleanup(true);
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
    
    // Adjust main content area to make room for our sidebar
    const mainContent = document.querySelector('#app > div > div:nth-child(2)');
    if (mainContent) {
      mainContent.style.marginLeft = '260px';
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

// Start loading indicator immediately to give visual feedback
// Wait until the page is fully loaded before running main function
if (document.readyState === 'complete') {
  main();
} else {
  window.addEventListener('load', main);
}