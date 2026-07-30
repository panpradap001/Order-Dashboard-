import Sortable from 'sortablejs';
import { state, DATA_KEYS } from "../store/state.js";
import { DOM } from "../utils/dom.js";
import { escapeHTML } from "../utils/helpers.js";
import { getProductImageUrl } from "../services/imageService.js";
export function updateCategoryDropdown(data) {
  const newCategories = new Set();
  data.forEach(item => {
    if (item[DATA_KEYS.category]) {
      const orderCount = Number(item[DATA_KEYS.order]);
      const stockCount = Number(item[DATA_KEYS.stock]);
      const matchActive = !state.showOnlyActive || (!isNaN(orderCount) && orderCount > 0);
      const matchStock = !state.showOnlyStock || (!isNaN(stockCount) && stockCount > 0);
      
      if (matchActive && matchStock) {
        newCategories.add(item[DATA_KEYS.category]);
      }
    }
  });

  if (newCategories.size !== state.activeCategories.size) {
    state.activeCategories = newCategories;
    DOM.categoryFilterOptions.innerHTML = '';
    
    const allLabel = document.createElement('label');
    allLabel.className = 'multi-select-option';
    const allInput = document.createElement('input');
    allInput.type = 'checkbox';
    allInput.value = 'all';
    if (state.currentCategories.includes('all')) allInput.checked = true;
    allLabel.appendChild(allInput);
    allLabel.appendChild(document.createTextNode(' ทั้งหมด (All Categories)'));
    DOM.categoryFilterOptions.appendChild(allLabel);
    
    const sortedCategories = Array.from(state.activeCategories);
    sortedCategories.forEach(cat => {
      const label = document.createElement('label');
      label.className = 'multi-select-option';
      
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = cat;
      if (state.currentCategories.includes(cat)) input.checked = true;
      
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + cat));
      
      DOM.categoryFilterOptions.appendChild(label);
    });
    
    updateMultiSelectHeader();
  }
}

export function updateMultiSelectHeader() {
  if (state.currentCategories.includes('all') || state.currentCategories.length === 0) {
    DOM.categoryFilterHeader.textContent = 'ทั้งหมด (All Categories)';
  } else {
    if (state.currentCategories.length === 1) {
      DOM.categoryFilterHeader.textContent = state.currentCategories[0];
    } else {
      DOM.categoryFilterHeader.textContent = `เลือก ${state.currentCategories.length} หมวดหมู่`;
    }
  }
}

export function processData() {
  const hasCategoryFilter = !state.currentCategories.includes('all') && state.currentCategories.length > 0;

  // Calculate net stock adjustments per pCode and color
  const adjustmentsMap = {};
  if (state.inventoryAdjustments) {
    state.inventoryAdjustments.forEach(entry => {
      // flat structure
      if (entry && entry.items) {
        if (entry.isDeleted) return; // Skip deleted items
        entry.items.forEach(item => {
           const key = `${item.pCode}|${item.color || ''}`;
           if (!adjustmentsMap[key]) adjustmentsMap[key] = 0;
           adjustmentsMap[key] += (Number(item.qtyIn) || 0) - (Number(item.qtyOut) || 0);
        });
      }
      // nested structure (legacy)
      else if (entry && typeof entry === 'object') {
        Object.values(entry).forEach(subDoc => {
          if (subDoc && subDoc.items) {
            if (subDoc.isDeleted) return; // Skip deleted items
            subDoc.items.forEach(item => {
               const key = `${item.pCode}|${item.color || ''}`;
               if (!adjustmentsMap[key]) adjustmentsMap[key] = 0;
               adjustmentsMap[key] += (Number(item.qtyIn) || 0) - (Number(item.qtyOut) || 0);
            });
          }
        });
      }
    });
  }

  let processed = state.rawData.map(item => {
    let newItem = { ...item };
    
    if (newItem[DATA_KEYS.category] && newItem[DATA_KEYS.colorName]) {
      const parts = newItem[DATA_KEYS.category].split('\u00A0\u00A0\u00A0');
      if (parts.length >= 2) {
        const pCode = parts[0].trim();
        const color = String(newItem[DATA_KEYS.colorName]).trim();
        const key = `${pCode}|${color}`;
        
        let adj = adjustmentsMap[key] || 0;
        newItem[DATA_KEYS.stock] = adj;
      }
    }
    return newItem;
  }).filter(item => {
    const orderCount = Number(item[DATA_KEYS.order]);
    const stockCount = Number(item[DATA_KEYS.stock]);
    const hasRequiredFields = item[DATA_KEYS.category] && item[DATA_KEYS.colorName];
    
    if (!hasRequiredFields) return false;
    
    if (state.showOnlyActive && (isNaN(orderCount) || orderCount <= 0)) return false;
    if (state.showOnlyStock && (isNaN(stockCount) || stockCount <= 0)) return false;
    
    if (hasCategoryFilter && !state.currentCategories.includes(item[DATA_KEYS.category])) return false;
    
    return true;
  });

  state.groupedData = {};
  let categoryOrder = [];
  
  processed.forEach(item => {
    const cat = item[DATA_KEYS.category];
    if (!state.groupedData[cat]) {
      state.groupedData[cat] = {
        items: [],
        totalOrders: 0
      };
      categoryOrder.push(cat);
    }
    state.groupedData[cat].items.push(item);
    state.groupedData[cat].totalOrders += Number(item[DATA_KEYS.order] || 0);
  });

  let sortedKeys = categoryOrder;
  
  if (state.customCategoryOrder.length > 0) {
    sortedKeys.sort((a, b) => {
      let indexA = state.customCategoryOrder.indexOf(a);
      let indexB = state.customCategoryOrder.indexOf(b);
      if (indexA === -1) indexA = 999;
      if (indexB === -1) indexB = 999;
      return indexA - indexB;
    });
  }

  return sortedKeys;
}

export function adjustPresentationScale() {
  if (!state.isPresentationMode) return;
  const container = DOM.dashboardContainer;
  const wrapper = container.parentElement;

  container.style.transform = 'none';
  
  let minSize = 2; 
  let maxSize = 32; 
  let bestSize = 16;
  
  for (let i = 0; i < 12; i++) {
    let mid = (minSize + maxSize) / 2;
    document.documentElement.style.fontSize = `${mid}px`;
    
    if (container.scrollHeight > wrapper.clientHeight) {
      maxSize = mid; 
    } else {
      bestSize = mid; 
      minSize = mid;
    }
  }
  
  document.documentElement.style.fontSize = `${bestSize}px`;
}

export function renderDashboard() {
  const sortedCategories = processData();
  
  DOM.loadingSpinner.style.display = 'none';
  
  if (sortedCategories.length === 0) {
    DOM.dashboardContainer.innerHTML = `
      <div class="no-results">
        <p>ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา หรือยังไม่มีออเดอร์</p>
      </div>
    `;
    return;
  }

  DOM.dashboardContainer.innerHTML = '';
  
  const fragment = document.createDocumentFragment();

  sortedCategories.forEach(category => {
    const group = state.groupedData[category];
    
    const card = document.createElement('div');
    card.className = 'category-card';
    card.setAttribute('data-category', category);
    
    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `
      <h2>${escapeHTML(category)}</h2>
    `;
    card.appendChild(header);

    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    
    const allColumns = new Set([DATA_KEYS.colorName, DATA_KEYS.stock, DATA_KEYS.order]);
    group.items.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key !== DATA_KEYS.category) {
          const val = item[key];
          if (val !== null && val !== undefined && String(val).trim() !== '') {
            allColumns.add(key);
          }
        }
      });
    });
    
    const knownFirst = [DATA_KEYS.colorName, DATA_KEYS.order];
    const knownLast = [DATA_KEYS.stock];
    const unknownColumns = Array.from(allColumns).filter(c => !knownFirst.includes(c) && !knownLast.includes(c));
    
    const finalColumns = [
      ...knownFirst.filter(c => allColumns.has(c)),
      ...unknownColumns,
      ...knownLast.filter(c => allColumns.has(c))
    ];
    
    let theadHTML = '<tr>';
    // เพิ่มหัวตารางสำหรับรูปภาพ (ซ่อนใน Presentation Mode)
    if (!state.isPresentationMode) {
      theadHTML += `<th class="col-image" style="width: 120px; text-align: center;">รูปภาพ</th>`;
    }
    
    finalColumns.forEach(col => {
      let colClass = '';
      if (col === DATA_KEYS.colorName) colClass = 'col-product';
      else if (col === DATA_KEYS.stock) colClass = 'col-stock';
      else if (col === DATA_KEYS.order) colClass = 'col-orders';
      
      theadHTML += `<th class="${colClass}">${escapeHTML(col)}</th>`;
    });
    theadHTML += '</tr>';
    
    let tbodyHTML = '';
    group.items.forEach((item, index) => {
      tbodyHTML += '<tr>';
      
      // แสดงรูปภาพเพียงแค่ 1 ครั้งต่อหมวดหมู่ และซ่อนใน Presentation Mode
      if (index === 0 && !state.isPresentationMode) {
        const pCode = category.split(/\s+/)[0].trim();
        
        tbodyHTML += `
          <td rowspan="${group.items.length}" style="text-align: center; vertical-align: middle; border-right: 1px solid #eee; padding: 12px;">
            <img 
              id="dashboard-img-${escapeHTML(pCode)}"
              src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='160' height='160' fill='%23eee'/><text x='80' y='80' font-family='Arial' font-size='14' fill='%23999' text-anchor='middle' alignment-baseline='middle'>Loading...</text></svg>"
              alt="${escapeHTML(pCode)}" 
              style="width: 160px; height: 160px; object-fit: contain; border-radius: 8px; background: transparent; padding: 4px;"
            >
          </td>
        `;
      }

      finalColumns.forEach(col => {
        let colClass = '';
        if (col === DATA_KEYS.colorName) colClass = 'col-product';
        else if (col === DATA_KEYS.stock) colClass = 'col-stock';
        else if (col === DATA_KEYS.order) colClass = 'col-orders';
        
        let val = item[col] !== undefined ? String(item[col]) : '';
        
        if (col === DATA_KEYS.colorName) {
          // ไม่แสดงรูปแล้ว แสดงแค่ชื่อสี
          tbodyHTML += `<td class="${colClass}">${escapeHTML(val || '')}</td>`;
        } 
        else if (col === DATA_KEYS.stock) {
          let orderVal = Number(item[DATA_KEYS.order] || 0);
          let stockVal = Number(val || 0);
          let badgeColorClass = stockVal < orderVal ? 'red' : 'green';
          
          tbodyHTML += `<td class="${colClass}"><span class="order-badge ${badgeColorClass}">${escapeHTML(val || '0')}</span></td>`;
        } 
        else {
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
  
  DOM.dashboardContainer.appendChild(fragment);

  // Fetch images securely if not in presentation mode
  if (!state.isPresentationMode) {
    sortedCategories.forEach(category => {
      const pCode = category.split(/\s+/)[0].trim();
      loadSecureDashboardImage(pCode);
    });
  }

  if (state.sortableInstance) {
    state.sortableInstance.destroy();
  }
  
  if (typeof Sortable !== 'undefined') {
    state.sortableInstance = new Sortable(DOM.dashboardContainer, {
      animation: 150,
      disabled: !state.isPresentationMode,
      onEnd: function (evt) {
        const cards = Array.from(DOM.dashboardContainer.children);
        state.customCategoryOrder = cards.map(card => card.getAttribute('data-category')).filter(Boolean);
      }
    });
  }

  if (state.isPresentationMode) {
    requestAnimationFrame(() => {
      adjustPresentationScale();
    });
  } else {
    DOM.dashboardContainer.style.transform = 'none';
  }
}

async function loadSecureDashboardImage(pCode) {
  const imgEl = document.getElementById(`dashboard-img-${escapeHTML(pCode)}`);
  if (!imgEl) return;
  const url = await getProductImageUrl(pCode);
  imgEl.src = url;
}
