import { state } from "../store/state.js";
import { DOM } from "../utils/dom.js";
import { escapeHTML } from "../utils/helpers.js";

export function renderStoreList() {
  if (!DOM.storeListContainer) return;
  
  let uniqueCustomers = [...new Set(state.storeRawData.map(item => item['ชื่อลูกค้า']).filter(Boolean))];
  
  const storeSearchInput = document.getElementById('store-search');
  const searchTerm = storeSearchInput ? storeSearchInput.value.toLowerCase().trim() : '';
  
  if (searchTerm) {
    uniqueCustomers = uniqueCustomers.filter(customer => 
      customer.toLowerCase().includes(searchTerm)
    );
  }

  const grandTotal = state.storeRawData.reduce((sum, item) => sum + Number(item['มูลค่ารวม'] || 0), 0);
  
  const statusTotals = {};
  state.storeRawData.forEach(item => {
    const status = item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ';
    if (!statusTotals[status]) statusTotals[status] = 0;
    statusTotals[status] += Number(item['มูลค่ารวม'] || 0);
  });
  
  const uniqueStatuses = Object.keys(statusTotals).sort();
  const filterStatuses = [...uniqueStatuses];
  
  let statusListHTML = '';
  filterStatuses.forEach((status) => {
    const btnBg = (status === state.activeStoreListFilter) ? '#f97316' : '#3b82f6';
    const totalAmount = (status === 'ทั้งหมด') ? grandTotal : statusTotals[status];
    const totalStatus = totalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2});
    
    statusListHTML += `
      <div class="store-filter-btn" data-status="${escapeHTML(status)}" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; cursor: pointer; opacity: ${status === state.activeStoreListFilter ? '1' : '0.6'}; transition: opacity 0.2s;">
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
      <div style="background: linear-gradient(180deg, #5b86e5, #367bdc); color: white; padding: 0.75rem 1.5rem; border-radius: 8px; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: var(--shadow-md); min-width: 180px; flex-shrink: 0; align-self: center;">
        <div style="font-size: 0.95rem; margin-bottom: 0.25rem; font-weight: 500;">ยอดขายสุทธิ</div>
        <div style="font-size: 1.4rem; font-weight: 700;">${grandTotal.toLocaleString('th-TH', {minimumFractionDigits: 2})}</div>
      </div>
      
      <div style="display: flex; flex-direction: column; justify-content: flex-start; flex: 1; background: white; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); min-width: 320px; max-width: 380px;">
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">ยอดตามสถานะ</div>
        <div style="max-height: 100px; overflow-y: auto; padding-right: 5px;">
          ${statusListHTML}
        </div>
      </div>
    </div>
  `;

  if (storeSearchInput) {
    const headerContainer = storeSearchInput.closest('.dashboard-header');
    if (headerContainer) {
      let dynamicSummary = document.getElementById('dynamic-store-summary');
      
      if (!dynamicSummary) {
        dynamicSummary = document.createElement('div');
        dynamicSummary.id = 'dynamic-store-summary';
        
        dynamicSummary.style.display = 'flex';
        dynamicSummary.style.gap = '30px';
        dynamicSummary.style.alignItems = 'center';
        dynamicSummary.style.flex = '1';
        dynamicSummary.style.justifyContent = 'flex-start';
        dynamicSummary.style.marginLeft = '20px';
        
        const controlsWrapper = storeSearchInput.closest('.controls-wrapper') || storeSearchInput.parentNode;
        headerContainer.insertBefore(dynamicSummary, controlsWrapper);
      }
      
      dynamicSummary.innerHTML = summaryHTML;
      
      const filterBtns = dynamicSummary.querySelectorAll('.store-filter-btn');
      filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const clickedStatus = e.currentTarget.getAttribute('data-status');
          if (state.activeStoreListFilter === clickedStatus) {
            state.activeStoreListFilter = 'ทั้งหมด';
          } else {
            state.activeStoreListFilter = clickedStatus;
          }
          renderStoreList();
        });
      });
    }
  }

  if (state.activeStoreListFilter !== 'ทั้งหมด') {
    uniqueCustomers = uniqueCustomers.filter(customer => {
      return state.storeRawData.some(item => 
        item['ชื่อลูกค้า'] === customer && 
        (item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ') === state.activeStoreListFilter
      );
    });
  }

  DOM.storeListContainer.innerHTML = '';

  if (uniqueCustomers.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.innerHTML = '<p>ไม่พบข้อมูลร้านค้า</p>';
    DOM.storeListContainer.appendChild(noResults);
    return;
  }

  const gridContainer = document.createElement('div');
  gridContainer.className = 'dashboard-grid store-grid';
  gridContainer.style.display = 'grid'; 
  
  const fragment = document.createDocumentFragment();

  uniqueCustomers.forEach(customer => {
    const card = document.createElement('div');
    card.className = 'store-card';
    card.style.display = 'flex';
    card.style.flexDirection = 'row';
    card.style.justifyContent = 'space-between';
    card.style.alignItems = 'center';
    
    let customerOrders = state.storeRawData.filter(item => item['ชื่อลูกค้า'] === customer);
    
    if (state.activeStoreListFilter !== 'ทั้งหมด') {
      customerOrders = customerOrders.filter(item => (item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ') === state.activeStoreListFilter);
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
        <div class="store-stats" style="color: var(--text-secondary); font-size: 0.85rem;">รายการสั่งซื้อ: ${escapeHTML(String(totalItems))} รายการ</div>
      </div>
      <div class="store-total-badge" style="background-color: var(--highlight-bg); color: var(--accent-color); padding: 0.75rem 1.25rem; border-radius: 8px; font-weight: 700; font-size: 1.1rem; min-width: 140px; text-align: right; border: 1px solid rgba(59, 130, 246, 0.2);">
        ${escapeHTML(formattedTotal)}
      </div>
    `;
    
    card.addEventListener('click', () => {
      renderStoreDetail(customer);
    });
    
    fragment.appendChild(card);
  });
  
  gridContainer.appendChild(fragment);
  DOM.storeListContainer.appendChild(gridContainer);
}

export function renderStoreDetail(customerName) {
  state.currentStoreDetailName = customerName;
  
  document.getElementById('view-store-list').style.display = 'none';
  document.getElementById('view-store-detail').style.display = 'block';
  
  if (DOM.storeDetailTitle) DOM.storeDetailTitle.textContent = customerName;
  
  const customerOrders = state.storeRawData.filter(item => item['ชื่อลูกค้า'] === customerName);
  
  if (customerOrders.length === 0) {
    DOM.storeDetailContainer.innerHTML = `<div class="no-results"><p>ไม่พบรายการสั่งซื้อ</p></div>`;
    return;
  }

  const uniqueStatuses = ['ทั้งหมด', ...new Set(customerOrders.map(item => item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ'))];
  
  let activeStatus = uniqueStatuses[0];

  const renderContent = () => {
    DOM.storeDetailContainer.innerHTML = ''; 
    
    const tabContainer = document.createElement('div');
    tabContainer.style.display = 'flex';
    tabContainer.style.gap = '10px';
    tabContainer.style.marginBottom = '20px';

    uniqueStatuses.forEach(status => {
      const btn = document.createElement('button');
      btn.textContent = status; 
      btn.className = 'btn-primary'; 
      
      if (status !== activeStatus) {
        btn.style.backgroundColor = 'var(--surface-color)';
        btn.style.color = 'var(--text-primary)';
        btn.style.border = '1px solid var(--border-color)';
      }
      
      btn.addEventListener('click', () => {
        activeStatus = status;
        renderContent(); 
      });
      
      tabContainer.appendChild(btn);
    });
    
    DOM.storeDetailContainer.appendChild(tabContainer);

    const activeOrders = activeStatus === 'ทั้งหมด' 
      ? customerOrders 
      : customerOrders.filter(item => (item['สถานะ'] || item['สถานนะ'] || 'ไม่ระบุ') === activeStatus);

    let theadHTML = `
      <tr>
        <th style="width: 50px; text-align: center;">
          <input type="checkbox" id="selectAllCheckbox" checked style="cursor: pointer;">
        </th>
        <th class="col-product">ชื่อสินค้า</th>
        <th class="col-orders">จำนวน</th>
        <th class="col-stock" style="text-align: right;">ราคารวม (บาท)</th>
      </tr>
    `;
    
    let tbodyHTML = '';
    activeOrders.forEach((item, index) => {
      const productName = item['ชื่อสินค้า'] || '';
      const quantity = item['จำนวน'] || '0';
      const totalValue = Number(item['มูลค่ารวม'] || 0); 
      
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
    DOM.storeDetailContainer.appendChild(tableWrapper);

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
    DOM.storeDetailContainer.appendChild(summaryContainer);

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
          row.style.opacity = '1';
          row.style.backgroundColor = '';
        } else {
          row.style.opacity = '0.4'; 
          row.style.backgroundColor = 'var(--bg-color)';
        }
      });
      totalDisplay.textContent = total.toLocaleString('th-TH', {minimumFractionDigits: 2});
    };

    selectAllCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      rowCheckboxes.forEach(cb => cb.checked = isChecked);
      calculateTotal();
    });

    rowCheckboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const allChecked = Array.from(rowCheckboxes).every(c => c.checked);
        selectAllCheckbox.checked = allChecked;
        calculateTotal();
      });
    });

    calculateTotal();
  };

  renderContent();
}
