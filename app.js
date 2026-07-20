import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
import Sortable from 'sortablejs';

window.onerror = function(message, source, lineno, colno, error) {
  alert("JS Error: " + message + " at " + lineno + ":" + colno);
};

// Configurable data keys in case the JSON structure changes in the future
const DATA_KEYS = {
  category: 'หมวดหมู่',
  colorName: 'สี',
  stock: 'สต๊อก',
  order: 'ออเดอร์',
  productCode: 'รหัสสินค้า'
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
const categoryMultiSelect = document.getElementById('category-multi-select');
const categoryFilterHeader = document.getElementById('category-filter-header');
const categoryFilterDropdown = document.getElementById('category-filter-dropdown');
const categorySearch = document.getElementById('category-search');
const categoryFilterOptions = document.getElementById('category-filter-options');
const activeOnlyToggle = document.getElementById('active-only-toggle');
const stockOnlyToggle = document.getElementById('stock-only-toggle');
const presentationBtn = document.getElementById('presentation-btn');
const storeListContainer = document.getElementById('store-list-container');
const storeDetailContainer = document.getElementById('store-detail-container');
const storeDetailTitle = document.getElementById('store-detail-title');
const backToStoreListBtn = document.getElementById('back-to-store-list');
const navItems = document.querySelectorAll('.nav-item');
const viewSections = document.querySelectorAll('.view-section');

// State
let rawData = [];
let groupedData = {};
let storeRawData = [];
let activeCategories = new Set();
let currentCategories = ['all'];
let isPresentationMode = false;
let showOnlyActive = true;
let showOnlyStock = false;
let customCategoryOrder = [];
let storeSearchDebounceTimeout = null;
let currentStoreDetailName = null;
let sortableInstance = null;
let activeStoreListFilter = 'ทั้งหมด';

// Initialize
function init() {
  setupEventListeners();
  fetchData();
  fetchCustomerOrders();
}

// Fetch real-time data from Firebase
function fetchData() {
  // According to the JSON schema, the data is under "orders/orders"
  const ordersRef = ref(database, 'orders/orders');
  
  onValue(ordersRef, (snapshot) => {
    const data = snapshot.val();
    console.log("fetchData snapshot:", data);
    if (data) {
      
      let fetchedData = Array.isArray(data) ? data : Object.values(data);
      fetchedData = fetchedData.filter(item => item !== null && typeof item === 'object');
      
      rawData = fetchedData.map(item => {
        let newItem = { ...item }; 
        
        if (newItem[DATA_KEYS.productCode] && newItem[DATA_KEYS.category]) {
          let shortCode = String(newItem[DATA_KEYS.productCode]).substring(0, 4);
          
          newItem[DATA_KEYS.category] = `${shortCode}\u00A0\u00A0\u00A0${newItem[DATA_KEYS.category]}`;
          
          delete newItem[DATA_KEYS.productCode]; 
        }
        
        return newItem;
      });
      
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

// Fetch store data
function fetchCustomerOrders() {
  const customerOrdersRef = ref(database, 'orders/customerOrders');
  
  onValue(customerOrdersRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      let fetchedData = Array.isArray(data) ? data : Object.values(data);
      storeRawData = fetchedData.filter(item => item !== null && typeof item === 'object');
      renderStoreList();
      
      // Auto-update the detail view if it's currently open
      if (currentStoreDetailName) {
        renderStoreDetail(currentStoreDetailName);
      }
    }
  }, (error) => {
    console.error("Firebase Read Error (Store): ", error);
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
  const hasCategoryFilter = !currentCategories.includes('all') && currentCategories.length > 0;

  // Single pass filtering for performance
  let processed = rawData.filter(item => {
    const orderCount = Number(item[DATA_KEYS.order]);
    const stockCount = Number(item[DATA_KEYS.stock]);
    const hasRequiredFields = item[DATA_KEYS.category] && item[DATA_KEYS.colorName];
    
    if (!hasRequiredFields) return false;
    
    if (showOnlyActive && (isNaN(orderCount) || orderCount <= 0)) return false;
    if (showOnlyStock && (isNaN(stockCount) || stockCount <= 0)) return false;
    
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
    const allColumns = new Set([DATA_KEYS.colorName, DATA_KEYS.stock, DATA_KEYS.order]);
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
    const knownFirst = [DATA_KEYS.colorName, DATA_KEYS.order];
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
      if (col === DATA_KEYS.colorName) colClass = 'col-product';
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
        if (col === DATA_KEYS.colorName) colClass = 'col-product';
        else if (col === DATA_KEYS.stock) colClass = 'col-stock';
        else if (col === DATA_KEYS.order) colClass = 'col-orders';
        
        let val = item[col] !== undefined ? String(item[col]) : '';
        
        if (col === DATA_KEYS.stock) {
          let orderVal = Number(item[DATA_KEYS.order] || 0);
          let stockVal = Number(val || 0);
          let badgeColorClass = stockVal < orderVal ? 'red' : 'green';
          
          tbodyHTML += `<td class="${colClass}"><span class="order-badge ${badgeColorClass}">${escapeHTML(val || '0')}</span></td>`;
        } else {
          // If value is empty, provide '0' for order/stock, else empty string
          const defaultVal = (col === DATA_KEYS.order || col === DATA_KEYS.stock) ? '0' : '';
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
  // View Routing
  navItems.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Update active nav
      navItems.forEach(n => n.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      
      // Update views
      const viewId = targetBtn.getAttribute('data-view');
      viewSections.forEach(sec => sec.style.display = 'none');
      
      const targetView = document.getElementById(viewId);
      if (targetView) targetView.style.display = 'block';
      
      if (viewId === 'view-store') {
        document.getElementById('view-store-list').style.display = 'block';
        document.getElementById('view-store-detail').style.display = 'none';
        currentStoreDetailName = null;
        renderStoreList();
      }
    });
  });

  // Back button in store detail
  if (backToStoreListBtn) {
    backToStoreListBtn.addEventListener('click', () => {
      document.getElementById('view-store-list').style.display = 'block';
      document.getElementById('view-store-detail').style.display = 'none';
      currentStoreDetailName = null;
    });
  }

  // Store List Search with Debounce
  const storeSearchInput = document.getElementById('store-search');
  if (storeSearchInput) {
    storeSearchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      
      clearTimeout(storeSearchDebounceTimeout);
      storeSearchDebounceTimeout = setTimeout(() => {
        renderStoreList();
      }, 300);
    });
  }

  // Category dropdown search
  categorySearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const labels = categoryFilterOptions.querySelectorAll('label');
    labels.forEach(label => {
      const text = label.textContent.toLowerCase();
      if (text.includes(searchTerm)) {
        label.style.display = 'flex';
      } else {
        label.style.display = 'none';
      }
    });
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
    categoryFilterDropdown.classList.toggle('show');
    // Clear search and reset filter options when opened
    if (categoryFilterDropdown.classList.contains('show')) {
      categorySearch.value = '';
      const labels = categoryFilterOptions.querySelectorAll('label');
      labels.forEach(label => label.style.display = 'flex');
      setTimeout(() => categorySearch.focus(), 50);
    }
    e.stopPropagation();
  });

  document.addEventListener('click', (e) => {
    if (!categoryMultiSelect.contains(e.target)) {
      categoryFilterDropdown.classList.remove('show');
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
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// Render Store List
function renderStoreList() {
  if (!storeListContainer) return;
  
  // 1. ดึงรายชื่อลูกค้าที่ไม่ซ้ำ
  let uniqueCustomers = [...new Set(storeRawData.map(item => item['ชื่อลูกค้า']).filter(Boolean))];
  
  // 2. กรองข้อมูลตามคำค้นหา (ถ้ามี)
  const storeSearchInput = document.getElementById('store-search');
  const searchTerm = storeSearchInput ? storeSearchInput.value.toLowerCase().trim() : '';
  
  if (searchTerm) {
    uniqueCustomers = uniqueCustomers.filter(customer => 
      customer.toLowerCase().includes(searchTerm)
    );
  }

  // ==========================================
  // ส่วนที่ 1: แทรกสรุปยอดขายลงใน Header เดิมของ HTML
  // ==========================================
  // คำนวณยอดขายรวมทั้งหมด
  const grandTotal = storeRawData.reduce((sum, item) => sum + Number(item['มูลค่ารวม'] || 0), 0);
  
  // จัดกลุ่มยอดขายตามรอบ/สถานะ
  const statusTotals = {};
  storeRawData.forEach(item => {
    const status = item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ';
    if (!statusTotals[status]) statusTotals[status] = 0;
    statusTotals[status] += Number(item['มูลค่ารวม'] || 0);
  });
  
  // จัดเรียงชื่อรอบตามตัวอักษร
  const uniqueStatuses = Object.keys(statusTotals).sort();
  const filterStatuses = [...uniqueStatuses];
  
  // สร้าง HTML สำหรับรายการรอบต่างๆ
  let statusListHTML = '';
  filterStatuses.forEach((status) => {
    // เลือกสีปุ่มตามสถานะที่ถูกเลือก (activeStoreListFilter)
    const btnBg = (status === activeStoreListFilter) ? '#f97316' : '#3b82f6';
    const totalAmount = (status === 'ทั้งหมด') ? grandTotal : statusTotals[status];
    const totalStatus = totalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2});
    
    statusListHTML += `
      <div class="store-filter-btn" data-status="${escapeHTML(status)}" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; cursor: pointer; opacity: ${status === activeStoreListFilter ? '1' : '0.6'}; transition: opacity 0.2s;">
        <div style="background-color: ${btnBg}; color: white; padding: 2px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; min-width: 70px; text-align: center; box-shadow: var(--shadow-sm); transition: background-color 0.2s;">
          ${escapeHTML(status)}
        </div>
        <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-primary); text-align: right;">
          ${totalStatus}
        </div>
      </div>
    `;
  });

  const summaryHTML = `
    <div style="display: flex; gap: 20px; align-items: stretch;">
      <!-- กล่องยอดขายสุทธิ (สีน้ำเงิน) -->
      <div style="background: linear-gradient(180deg, #5b86e5, #367bdc); color: white; padding: 0.75rem 1.5rem; border-radius: 8px; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: var(--shadow-md); min-width: 180px; flex-shrink: 0; align-self: center;">
        <div style="font-size: 0.95rem; margin-bottom: 0.25rem; font-weight: 500;">ยอดขายสุทธิ</div>
        <div style="font-size: 1.4rem; font-weight: 700;">${grandTotal.toLocaleString('th-TH', {minimumFractionDigits: 2})}</div>
      </div>
      
      <!-- รายการย่อยตามรอบ -->
      <div style="display: flex; flex-direction: column; justify-content: flex-start; background: white; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); min-width: 220px; max-width: 260px;">
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">ยอดตามสถานะ</div>
        <div style="max-height: 100px; overflow-y: auto; padding-right: 5px;">
          ${statusListHTML}
        </div>
      </div>
    </div>
  `;

  // นำ HTML ด้านบน ไปแทรกไว้ตรงกลาง Header (.dashboard-header)
  if (storeSearchInput) {
    const headerContainer = storeSearchInput.closest('.dashboard-header');
    if (headerContainer) {
      let dynamicSummary = document.getElementById('dynamic-store-summary');
      
      // ถ้ายังไม่มีส่วนแทรกนี้ ให้สร้างขึ้นมาใหม่
      if (!dynamicSummary) {
        dynamicSummary = document.createElement('div');
        dynamicSummary.id = 'dynamic-store-summary';
        
        // จัด Layout ให้อยู่กึ่งกลาง และดันช่องค้นหาไปทางขวา
        dynamicSummary.style.display = 'flex';
        dynamicSummary.style.gap = '30px';
        dynamicSummary.style.alignItems = 'center';
        dynamicSummary.style.flex = '1';
        dynamicSummary.style.justifyContent = 'flex-start';
        dynamicSummary.style.marginLeft = '20px';
        
        // หา element ของช่องค้นหา เพื่อจะได้เอาส่วนสรุปยอด ไปวางไว้ด้านหน้ามัน
        const controlsWrapper = storeSearchInput.closest('.controls-wrapper') || storeSearchInput.parentNode;
        headerContainer.insertBefore(dynamicSummary, controlsWrapper);
      }
      
      // อัปเดตตัวเลขและผูก Event 
      dynamicSummary.innerHTML = summaryHTML;
      
      // ผูก Event Click สำหรับกรองสถานะ
      const filterBtns = dynamicSummary.querySelectorAll('.store-filter-btn');
      filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const clickedStatus = e.currentTarget.getAttribute('data-status');
          // ถ้ากดสถานะเดิมที่เลือกอยู่ ให้ยกเลิกการกรอง (กลับไปเป็น 'ทั้งหมด')
          if (activeStoreListFilter === clickedStatus) {
            activeStoreListFilter = 'ทั้งหมด';
          } else {
            activeStoreListFilter = clickedStatus;
          }
          renderStoreList();
        });
      });
    }
  }

  // ==========================================
  // กรองลูกค้าตามสถานะที่เลือก (activeStoreListFilter)
  // ==========================================
  if (activeStoreListFilter !== 'ทั้งหมด') {
    uniqueCustomers = uniqueCustomers.filter(customer => {
      return storeRawData.some(item => 
        item['ชื่อลูกค้า'] === customer && 
        (item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ') === activeStoreListFilter
      );
    });
  }

  // ==========================================
  // ส่วนที่ 2: ล้างข้อมูลเก่าและสร้าง Grid ร้านค้าใหม่
  // ==========================================
  storeListContainer.innerHTML = '';

  if (uniqueCustomers.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.innerHTML = '<p>ไม่พบข้อมูลร้านค้า</p>';
    storeListContainer.appendChild(noResults);
    return;
  }

  const gridContainer = document.createElement('div');
  gridContainer.className = 'dashboard-grid store-grid';
  gridContainer.style.display = 'grid'; // บังคับให้เป็น grid ตามเดิม
  
  const fragment = document.createDocumentFragment();

  uniqueCustomers.forEach(customer => {
    const card = document.createElement('div');
    card.className = 'store-card';
    card.style.display = 'flex';
    card.style.flexDirection = 'row';
    card.style.justifyContent = 'space-between';
    card.style.alignItems = 'center';
    
    let customerOrders = storeRawData.filter(item => item['ชื่อลูกค้า'] === customer);
    
    if (activeStoreListFilter !== 'ทั้งหมด') {
      customerOrders = customerOrders.filter(item => (item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ') === activeStoreListFilter);
    }
    
    const totalItems = customerOrders.length;
    
    const totalAmount = customerOrders.reduce((sum, item) => {
      return sum + Number(item['มูลค่ารวม'] || 0);
    }, 0);
    
    const formattedTotal = totalAmount.toLocaleString('th-TH', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    
    card.innerHTML = `
      <div class="store-info">
        <h3 style="margin-bottom: 0.25rem;">${escapeHTML(customer)}</h3>
        <div class="store-stats" style="color: var(--text-secondary); font-size: 0.85rem;">รายการสั่งซื้อ: ${totalItems} รายการ</div>
      </div>
      <div class="store-total-badge" style="background-color: var(--highlight-bg); color: var(--accent-color); padding: 0.75rem 1.25rem; border-radius: 8px; font-weight: 700; font-size: 1.1rem; min-width: 140px; text-align: right; border: 1px solid rgba(59, 130, 246, 0.2);">
        ${formattedTotal}
      </div>
    `;
    
    card.addEventListener('click', () => {
      renderStoreDetail(customer);
    });
    
    fragment.appendChild(card);
  });
  
  gridContainer.appendChild(fragment);
  storeListContainer.appendChild(gridContainer);
}

function renderStoreDetail(customerName) {
  currentStoreDetailName = customerName;
  
  document.getElementById('view-store-list').style.display = 'none';
  document.getElementById('view-store-detail').style.display = 'block';
  
  if (storeDetailTitle) storeDetailTitle.textContent = customerName;
  
  // 1. ดึงข้อมูลออเดอร์ทั้งหมดของลูกค้านี้
  const customerOrders = storeRawData.filter(item => item['ชื่อลูกค้า'] === customerName);
  
  if (customerOrders.length === 0) {
    storeDetailContainer.innerHTML = `<div class="no-results"><p>ไม่พบรายการสั่งซื้อ</p></div>`;
    return;
  }

  // 2. หา 'สถานะ' ที่ไม่ซ้ำกัน เพื่อนำมาสร้างปุ่ม (เช่น ['Now', 'On Hold 3'])
  const uniqueStatuses = ['ทั้งหมด', ...new Set(customerOrders.map(item => item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ'))];
  
  // กำหนดสถานะแรกเป็นค่า Default
  let activeStatus = uniqueStatuses[0];

  // ฟังก์ชันย่อยสำหรับ Render เนื้อหาในตารางตามสถานะที่เลือก
  const renderContent = () => {
    storeDetailContainer.innerHTML = ''; // ล้างข้อมูลเก่า
    
    // --- สร้างปุ่ม Tab สถานะ (Dynamic Tabs) ---
    const tabContainer = document.createElement('div');
    tabContainer.style.display = 'flex';
    tabContainer.style.gap = '10px';
    tabContainer.style.marginBottom = '20px';

    uniqueStatuses.forEach(status => {
      const btn = document.createElement('button');
      btn.textContent = status; // ใช้ชื่อสถานะตรงๆ เช่น Now, On Hold 3
      btn.className = 'btn-primary'; // ยืม class ปุ่มจาก style.css
      
      // ปรับแต่งสีปุ่มให้รู้ว่าปุ่มไหนถูกเลือก (Active)
      if (status !== activeStatus) {
        btn.style.backgroundColor = 'var(--surface-color)';
        btn.style.color = 'var(--text-primary)';
        btn.style.border = '1px solid var(--border-color)';
      }
      
      // Event เมื่อกดเปลี่ยนรอบส่ง
      btn.addEventListener('click', () => {
        activeStatus = status;
        renderContent(); // สั่ง Render ตารางใหม่
      });
      
      tabContainer.appendChild(btn);
    });
    
    storeDetailContainer.appendChild(tabContainer);

    // --- กรองข้อมูลเฉพาะ 'สถานะ' ที่กำลังเลือก ---
    const activeOrders = activeStatus === 'ทั้งหมด' 
      ? customerOrders 
      : customerOrders.filter(item => (item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ') === activeStatus);

    // --- สร้างตารางและ Checkbox ---
    let theadHTML = `
      <tr>
        <th style="width: 50px; text-align: center;">
          <input type="checkbox" id="selectAllCheckbox" checked style="cursor: pointer;">
        </th>
        <th class="col-product">ชื่อสินค้า</th>
        <th class="col-orders">จำนวน</th>
        <th class="col-stock">ราคารวม (บาท)</th>
      </tr>
    `;
    
    let tbodyHTML = '';
    activeOrders.forEach((item, index) => {
      const productName = item['ชื่อสินค้า'] || '';
      const quantity = item['จำนวน'] || '0';
      const totalValue = Number(item['มูลค่ารวม'] || 0); // ต้องดึงมูลค่ารวมมาเป็นตัวเลข
      
      // เก็บค่า totalValue ไว้ใน data-value เพื่อให้คำนวณง่าย
      tbodyHTML += `
        <tr class="order-row" data-value="${totalValue}" style="transition: all 0.2s;">
          <td style="text-align: center;">
            <input type="checkbox" class="row-checkbox" checked style="cursor: pointer;">
          </td>
          <td class="col-product">${escapeHTML(String(productName))}</td>
          <td class="col-orders"><span class="order-badge">${escapeHTML(String(quantity))}</span></td>
          <td class="col-stock" style="text-align: right;">${totalValue.toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>
        </tr>
      `;
    });
    
    const table = document.createElement('table');
    table.innerHTML = `
      <thead>${theadHTML}</thead>
      <tbody>${tbodyHTML}</tbody>
    `;
    
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'table-container';
    tableWrapper.appendChild(table);
    storeDetailContainer.appendChild(tableWrapper);

    // --- สร้างส่วนแสดงผล "ยอดรวมสุทธิ" (Dynamic Total) ---
    const summaryContainer = document.createElement('div');
    summaryContainer.style.marginTop = '20px';
    summaryContainer.style.padding = '15px 20px';
    summaryContainer.style.backgroundColor = 'var(--surface-color)';
    summaryContainer.style.border = '1px solid var(--border-color)';
    summaryContainer.style.borderRadius = '8px';
    summaryContainer.style.display = 'flex';
    summaryContainer.style.justifyContent = 'space-between';
    summaryContainer.style.alignItems = 'center';
    
    summaryContainer.innerHTML = `
      <h3 style="margin:0; font-size: 1.25rem; color: var(--text-primary);">ยอดรวม:</h3>
      <h3 style="margin:0; font-size: 1.25rem;">
        <span id="dynamic-total" style="color: var(--accent-color); font-weight: 700;">0.00</span> บาท
      </h3>
    `;
    storeDetailContainer.appendChild(summaryContainer);

    // --- Logic การทำงานของ Checkbox และคำนวณยอดเงิน ---
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const rowCheckboxes = document.querySelectorAll('.row-checkbox');
    const totalDisplay = document.getElementById('dynamic-total');
    const rows = document.querySelectorAll('.order-row');

    const calculateTotal = () => {
      let total = 0;
      rowCheckboxes.forEach((checkbox, index) => {
        const row = rows[index];
        if (checkbox.checked) {
          total += Number(row.getAttribute('data-value'));
          // คืนสีแถวให้สว่างปกติ
          row.style.opacity = '1';
          row.style.backgroundColor = '';
        } else {
          // หากไม่เลือก ให้แถวสีจางลงเพื่อให้สังเกตง่าย
          row.style.opacity = '0.4'; 
          row.style.backgroundColor = 'var(--bg-color)';
        }
      });
      totalDisplay.textContent = total.toLocaleString('th-TH', {minimumFractionDigits: 2});
    };

    // Event เลือกทั้งหมด / ยกเลิกทั้งหมด[cite: 3]
    selectAllCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      rowCheckboxes.forEach(cb => cb.checked = isChecked);
      calculateTotal();
    });

    // Event เลือกระดับรายสินค้า[cite: 3]
    rowCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        // อัปเดต Checkbox 'เลือกทั้งหมด' ถ้าเราติ๊กครบทุกอัน
        const allChecked = Array.from(rowCheckboxes).every(c => c.checked);
        selectAllCheckbox.checked = allChecked;
        calculateTotal();
      });
    });

    // คำนวณครั้งแรกเมื่อโหลดหน้า
    calculateTotal();
  };

  // เริ่ม Render ครั้งแรก
  renderContent();
}

// Start App
init();
