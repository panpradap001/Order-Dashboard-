import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
import Sortable from 'sortablejs';

// Configurable data keys in case the JSON structure changes in the future
const DATA_KEYS = {
  category: 'หมวดหมู่',
  productName: 'ชื่อสินค้า',
  stock: 'สต๊อก',
  order: 'ออเดอร์'
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// DOM Elements
const dashboardContainer = document.getElementById('dashboard-container');
const loadingSpinner = document.getElementById('loading-spinner');
const searchInput = document.getElementById('search-input');
const categoryMultiSelect = document.getElementById('category-multi-select');
const categoryFilterHeader = document.getElementById('category-filter-header');
const categoryFilterOptions = document.getElementById('category-filter-options');
const activeOnlyToggle = document.getElementById('active-only-toggle');
const stockOnlyToggle = document.getElementById('stock-only-toggle');
const presentationBtn = document.getElementById('presentation-btn');

// State
let rawData = [];
let groupedData = {};
let activeCategories = new Set();
let currentSearch = '';
let currentCategories = ['all'];
let isPresentationMode = false;
let showOnlyActive = true;
let showOnlyStock = false;
let customCategoryOrder = [];
let sortableInstance = null;

// Initialize
function init() {
  setupEventListeners();
  fetchData();
}

// Fetch real-time data from Firebase
function fetchData() {
  // According to the JSON schema, the data is under "orders/orders"
  const ordersRef = ref(database, 'orders/orders');
  
  onValue(ordersRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      // Data might be an array or object depending on Firebase structure
      rawData = Array.isArray(data) ? data : Object.values(data);
      
      // Initial population of filter dropdown (only once or when new categories appear)
      updateCategoryDropdown(rawData);
      
      renderDashboard();
    } else {
      loadingSpinner.textContent = "No data found in database.";
    }
  }, (error) => {
    console.error("Firebase Read Error: ", error);
    loadingSpinner.textContent = "Error connecting to Firebase. Check console and configuration.";
  });
}

// Update the select dropdown with unique categories
function updateCategoryDropdown(data) {
  const newCategories = new Set();
  data.forEach(item => {
    // Only include in categories if it exists. 
    if (item[DATA_KEYS.category]) {
      const orderCount = Number(item[DATA_KEYS.order]);
      const stockCount = Number(item[DATA_KEYS.stock]);
      const matchActive = !showOnlyActive || (!isNaN(orderCount) && orderCount > 0);
      const matchStock = !showOnlyStock || (!isNaN(stockCount) && stockCount > 0);
      
      if (matchActive && matchStock) {
        newCategories.add(item[DATA_KEYS.category]);
      }
    }
  });

  // Only update if categories changed to avoid re-rendering unnecessarily
  if (newCategories.size !== activeCategories.size) {
    activeCategories = newCategories;
    
    categoryFilterOptions.innerHTML = '';
    
    // Add "All" option
    const allLabel = document.createElement('label');
    allLabel.className = 'multi-select-option';
    const allInput = document.createElement('input');
    allInput.type = 'checkbox';
    allInput.value = 'all';
    if (currentCategories.includes('all')) allInput.checked = true;
    allLabel.appendChild(allInput);
    allLabel.appendChild(document.createTextNode(' ทั้งหมด (All Categories)'));
    categoryFilterOptions.appendChild(allLabel);
    
    const sortedCategories = Array.from(activeCategories);
    sortedCategories.forEach(cat => {
      const label = document.createElement('label');
      label.className = 'multi-select-option';
      
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = cat;
      if (currentCategories.includes(cat)) input.checked = true;
      
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + cat));
      
      categoryFilterOptions.appendChild(label);
    });
    
    updateMultiSelectHeader();
  }
}

function updateMultiSelectHeader() {
  if (currentCategories.includes('all') || currentCategories.length === 0) {
    categoryFilterHeader.textContent = 'ทั้งหมด (All Categories)';
  } else {
    if (currentCategories.length === 1) {
      categoryFilterHeader.textContent = currentCategories[0];
    } else {
      categoryFilterHeader.textContent = `เลือก ${currentCategories.length} หมวดหมู่`;
    }
  }
}

// Process and filter data before rendering
function processData() {
  const searchLower = currentSearch ? currentSearch.toLowerCase() : '';
  const hasCategoryFilter = !currentCategories.includes('all') && currentCategories.length > 0;

  // Single pass filtering for performance
  let processed = rawData.filter(item => {
    const orderCount = Number(item[DATA_KEYS.order]);
    const stockCount = Number(item[DATA_KEYS.stock]);
    const hasRequiredFields = item[DATA_KEYS.category] && item[DATA_KEYS.productName];
    
    if (!hasRequiredFields) return false;
    
    if (showOnlyActive && (isNaN(orderCount) || orderCount <= 0)) return false;
    if (showOnlyStock && (isNaN(stockCount) || stockCount <= 0)) return false;
    
    if (searchLower && !String(item[DATA_KEYS.productName]).toLowerCase().includes(searchLower)) return false;
    if (hasCategoryFilter && !currentCategories.includes(item[DATA_KEYS.category])) return false;
    
    return true;
  });

  // 4. Group by Category
  groupedData = {};
  let categoryOrder = [];
  
  processed.forEach(item => {
    const cat = item[DATA_KEYS.category];
    if (!groupedData[cat]) {
      groupedData[cat] = {
        items: [],
        totalOrders: 0
      };
      categoryOrder.push(cat);
    }
    groupedData[cat].items.push(item);
    groupedData[cat].totalOrders += Number(item[DATA_KEYS.order] || 0);
  });

  let sortedKeys = categoryOrder;
  
  if (customCategoryOrder.length > 0) {
    sortedKeys.sort((a, b) => {
      let indexA = customCategoryOrder.indexOf(a);
      let indexB = customCategoryOrder.indexOf(b);
      // If a category is not in the custom order, put it at the end
      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;
      return indexA - indexB;
    });
  }

  return sortedKeys;
}

// Render the dashboard UI
function renderDashboard() {
  const sortedCategories = processData();
  
  // Hide loading spinner
  loadingSpinner.style.display = 'none';
  
  if (sortedCategories.length === 0) {
    dashboardContainer.innerHTML = `
      <div class="no-results">
        <p>ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา หรือยังไม่มีออเดอร์</p>
      </div>
    `;
    return;
  }

  // Clear current dashboard
  dashboardContainer.innerHTML = '';
  
  const fragment = document.createDocumentFragment();

  // Render each category table
  sortedCategories.forEach(category => {
    const group = groupedData[category];
    
    const card = document.createElement('div');
    card.className = 'category-card';
    card.setAttribute('data-category', category);
    
    // Create Header
    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `
      <h2>${escapeHTML(category)}</h2>
    `;
    card.appendChild(header);

    // Create Table
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    
    // Find all unique columns dynamically (excluding category)
    // Always include the core columns so they don't disappear if empty
    const allColumns = new Set([DATA_KEYS.productName, DATA_KEYS.stock, DATA_KEYS.order]);
    group.items.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key !== DATA_KEYS.category) {
          const val = item[key];
          // Only add custom columns if they actually have a non-empty value
          if (val !== null && val !== undefined && String(val).trim() !== '') {
            allColumns.add(key);
          }
        }
      });
    });
    
    // Order columns logically: product name first, order last, unknown columns in between
    const knownFirst = [DATA_KEYS.productName, DATA_KEYS.order];
    const knownLast = [DATA_KEYS.stock];
    const unknownColumns = Array.from(allColumns).filter(c => !knownFirst.includes(c) && !knownLast.includes(c));
    
    const finalColumns = [
      ...knownFirst.filter(c => allColumns.has(c)),
      ...unknownColumns,
      ...knownLast.filter(c => allColumns.has(c))
    ];
    
    // Generate Header HTML
    let theadHTML = '<tr>';
    finalColumns.forEach(col => {
      let colClass = '';
      if (col === DATA_KEYS.productName) colClass = 'col-product';
      else if (col === DATA_KEYS.stock) colClass = 'col-stock';
      else if (col === DATA_KEYS.order) colClass = 'col-orders';
      
      theadHTML += `<th class="${colClass}">${escapeHTML(col)}</th>`;
    });
    theadHTML += '</tr>';
    
    // Generate Body HTML
    let tbodyHTML = '';
    group.items.forEach(item => {
      tbodyHTML += '<tr>';
      finalColumns.forEach(col => {
        let colClass = '';
        if (col === DATA_KEYS.productName) colClass = 'col-product';
        else if (col === DATA_KEYS.stock) colClass = 'col-stock';
        else if (col === DATA_KEYS.order) colClass = 'col-orders';
        
        let val = item[col] !== undefined ? String(item[col]) : '';
        
        if (col === DATA_KEYS.order) {
          tbodyHTML += `<td class="${colClass}"><span class="order-badge">${escapeHTML(val || '0')}</span></td>`;
        } else {
          // If value is empty, provide '0' for stock, else empty string
          const defaultVal = col === DATA_KEYS.order ? '0' : '';
          tbodyHTML += `<td class="${colClass}">${escapeHTML(val || defaultVal)}</td>`;
        }
      });
      tbodyHTML += '</tr>';
    });
    
    const table = document.createElement('table');
    table.innerHTML = `
      <thead>${theadHTML}</thead>
      <tbody>${tbodyHTML}</tbody>
    `;
    
    tableContainer.appendChild(table);
    card.appendChild(tableContainer);
    fragment.appendChild(card);
  });
  
  dashboardContainer.appendChild(fragment);

  if (sortableInstance) {
    sortableInstance.destroy();
  }
  
  if (typeof Sortable !== 'undefined') {
    sortableInstance = new Sortable(dashboardContainer, {
      animation: 150,
      disabled: !isPresentationMode,
      onEnd: function (evt) {
        // Save the new order
        const cards = Array.from(dashboardContainer.children);
        customCategoryOrder = cards.map(card => card.getAttribute('data-category')).filter(Boolean);
      }
    });
  }

  if (isPresentationMode) {
    requestAnimationFrame(() => {
      adjustPresentationScale();
    });
  } else {
    dashboardContainer.style.transform = 'none';
  }
}

function adjustPresentationScale() {
  if (!isPresentationMode) return;
  const container = dashboardContainer;
  const wrapper = container.parentElement;

  // Reset scale if it was previously set
  container.style.transform = 'none';
  
  let minSize = 2; // min font size in px
  let maxSize = 32; // max font size in px
  let bestSize = 16;
  
  // Binary search for the largest font size that makes the content fit the height
  for (let i = 0; i < 12; i++) {
    let mid = (minSize + maxSize) / 2;
    document.documentElement.style.fontSize = `${mid}px`;
    
    if (container.scrollHeight > wrapper.clientHeight) {
      maxSize = mid; // Too big, it overflows height
    } else {
      bestSize = mid; // Fits, try larger
      minSize = mid;
    }
  }
  
  // Set to the best fitting size
  document.documentElement.style.fontSize = `${bestSize}px`;
}

// Event Listeners for Filters
function setupEventListeners() {
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearch = e.target.value.trim();
      renderDashboard();
    }, 300); // 300ms debounce
  });

  // Toggle Switch
  activeOnlyToggle.addEventListener('change', (e) => {
    showOnlyActive = e.target.checked;
    
    // Since we changed active state, the available categories might change
    // Force re-render of dropdown
    activeCategories = new Set(); // clear to force re-render
    updateCategoryDropdown(rawData);
    
    renderDashboard();
  });

  stockOnlyToggle.addEventListener('change', (e) => {
    showOnlyStock = e.target.checked;
    
    // Since we changed stock state, the available categories might change
    activeCategories = new Set(); 
    updateCategoryDropdown(rawData);
    
    renderDashboard();
  });

  categoryFilterHeader.addEventListener('click', (e) => {
    categoryFilterOptions.classList.toggle('show');
    e.stopPropagation();
  });

  document.addEventListener('click', (e) => {
    if (!categoryMultiSelect.contains(e.target)) {
      categoryFilterOptions.classList.remove('show');
    }
  });

  categoryFilterOptions.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') {
      const val = e.target.value;
      const isChecked = e.target.checked;
      
      if (val === 'all') {
        if (isChecked) {
          currentCategories = ['all'];
          // Uncheck others
          const checkboxes = categoryFilterOptions.querySelectorAll('input[type="checkbox"]');
          checkboxes.forEach(cb => {
            if (cb.value !== 'all') cb.checked = false;
          });
        } else {
          e.target.checked = true; // Cannot uncheck 'all' directly if it's the only one
        }
      } else {
        if (isChecked) {
          // Uncheck 'all'
          const allCheckbox = categoryFilterOptions.querySelector('input[value="all"]');
          if (allCheckbox) allCheckbox.checked = false;
          
          currentCategories = currentCategories.filter(c => c !== 'all');
          if (!currentCategories.includes(val)) {
            currentCategories.push(val);
          }
        } else {
          currentCategories = currentCategories.filter(c => c !== val);
          if (currentCategories.length === 0) {
            currentCategories = ['all'];
            const allCheckbox = categoryFilterOptions.querySelector('input[value="all"]');
            if (allCheckbox) allCheckbox.checked = true;
          }
        }
      }
      
      updateMultiSelectHeader();
      renderDashboard();
    }
  });

  presentationBtn.addEventListener('click', () => {
    isPresentationMode = true;
    document.body.classList.add('presentation-mode');
    
    if (sortableInstance) sortableInstance.option('disabled', false);
    
    // Attempt fullscreen if supported
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch((e) => console.log(e));
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      isPresentationMode = false;
      document.body.classList.remove('presentation-mode');
      dashboardContainer.style.transform = 'none';
      document.documentElement.style.fontSize = ''; // Reset font size
      if (sortableInstance) sortableInstance.option('disabled', true);
      renderDashboard();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPresentationMode) {
      isPresentationMode = false;
      document.body.classList.remove('presentation-mode');
      dashboardContainer.style.transform = 'none';
      document.documentElement.style.fontSize = ''; // Reset font size
      if (sortableInstance) sortableInstance.option('disabled', true);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch((e) => console.log(e));
      }
      renderDashboard();
    }
  });

  window.addEventListener('resize', () => {
    if (isPresentationMode) {
      adjustPresentationScale();
    }
  });
}

// Utility to prevent XSS
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Start App
init();
