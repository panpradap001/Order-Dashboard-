import { subscribeInventoryAdjustments, checkDocExists, getInventoryAdjustments, saveInventoryAdjustment, deleteInventoryAdjustment, generateNextDocNo } from "../services/inventoryService.js";
import { getProducts, fetchProducts } from "./productView.js";
import { state } from "../store/state.js";
import { escapeHTML } from "../utils/helpers.js";

// DOM Elements
let inventoryListView;
let inventoryFormView;
let inventoryReportView;

let invTableBody;
let itemsTableBody;
let invForm;
let addRowBtn;

// Cache for inventory adjustments
let adjustmentsCache = {};

let selectedReportProducts = ['all'];

export function initInventoryView() {
  inventoryListView = document.getElementById('inventory-list-view');
  inventoryFormView = document.getElementById('inventory-form-view');
  inventoryReportView = document.getElementById('inventory-report-view');
  
  invTableBody = document.getElementById('inventory-table-body');
  itemsTableBody = document.getElementById('inv-items-body');
  invForm = document.getElementById('inventory-form');
  addRowBtn = document.getElementById('inv-add-row-btn');

  // Event Listeners for switching views
  const addInvBtn = document.getElementById('add-inventory-btn');
  if (addInvBtn) addInvBtn.addEventListener('click', openInventoryForm);

  const reportInvBtn = document.getElementById('report-inventory-btn');
  if (reportInvBtn) reportInvBtn.addEventListener('click', openInventoryReport);

  const cancelInventoryForm = () => {
    localStorage.removeItem('inventoryFormDraft');
    showInventoryList();
  };

  const cancelInvBtn = document.getElementById('cancel-inventory-btn');
  if (cancelInvBtn) cancelInvBtn.addEventListener('click', cancelInventoryForm);

  const closeInvBtn = document.getElementById('close-inventory-btn');
  if (closeInvBtn) closeInvBtn.addEventListener('click', cancelInventoryForm);

  const backFromReportBtn = document.getElementById('back-from-report-btn');
  if (backFromReportBtn) backFromReportBtn.addEventListener('click', showInventoryList);

  // Event Listener for Add Row in Form
  if (addRowBtn) addRowBtn.addEventListener('click', addInventoryItemRow);

  // Form Submit
  if (invForm) {
    invForm.addEventListener('submit', handleInventoryFormSubmit);
    invForm.addEventListener('input', saveInventoryFormDraft);
    invForm.addEventListener('change', saveInventoryFormDraft);
  }

  const reportBtn = document.getElementById('generate-report-btn');
  if (reportBtn) reportBtn.addEventListener('click', generateInventoryReport);

  const printBtn = document.getElementById('print-report-btn');
  if (printBtn) printBtn.addEventListener('click', () => { window.print(); });

  const repProductHeader = document.getElementById('rep-product-header');
  const repProductDropdown = document.getElementById('rep-product-dropdown');
  const repProductSearch = document.getElementById('rep-product-search');
  const repProductOptions = document.getElementById('rep-product-options');

  if (repProductHeader) {
    repProductHeader.addEventListener('click', (e) => {
      repProductDropdown.classList.toggle('show');
      if (repProductDropdown.classList.contains('show')) {
        repProductSearch.value = '';
        const labels = repProductOptions.querySelectorAll('label');
        labels.forEach(label => label.style.display = 'flex');
        setTimeout(() => repProductSearch.focus(), 50);
      }
      e.stopPropagation();
    });
  }

  const condHeader = document.getElementById('rep-condition-header');
  const condDropdown = document.getElementById('rep-condition-dropdown');
  if (condHeader && condDropdown) {
    condHeader.addEventListener('click', (e) => {
      condDropdown.classList.toggle('show');
      e.stopPropagation();
    });
    const updateCondText = () => {
      const t = [];
      if (document.getElementById('chk-hide-cancelled').checked) t.push('ซ่อนที่ลบ');
      if (document.getElementById('chk-hide-packer').checked) t.push('ซ่อนชื่อคนแพ็ค');
      condHeader.textContent = t.length > 0 ? t.join(', ') : 'เลือกเงื่อนไข...';
    };
    document.getElementById('chk-hide-cancelled').addEventListener('change', updateCondText);
    document.getElementById('chk-hide-packer').addEventListener('change', updateCondText);
    updateCondText();
  }

  document.addEventListener('click', (e) => {
    const multiSelect = document.getElementById('rep-product-multi-select');
    if (multiSelect && !multiSelect.contains(e.target)) {
      if (repProductDropdown) repProductDropdown.classList.remove('show');
    }
    const condSelect = document.getElementById('rep-condition-multi-select');
    if (condSelect && !condSelect.contains(e.target)) {
      if (condDropdown) condDropdown.classList.remove('show');
    }
  });

  if (repProductSearch) {
    repProductSearch.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const labels = repProductOptions.querySelectorAll('label');
      labels.forEach(label => {
        if (label.textContent.toLowerCase().includes(term)) {
          label.style.display = 'flex';
        } else {
          label.style.display = 'none';
        }
      });
    });
  }

  if (repProductOptions) {
    repProductOptions.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        const val = e.target.value;
        const isChecked = e.target.checked;
        
        if (val === 'all') {
          if (isChecked) {
            selectedReportProducts = ['all'];
            const checkboxes = repProductOptions.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
              if (cb.value !== 'all') cb.checked = false;
            });
          } else {
            e.target.checked = true; // Prevent unchecking "All" if it's the only one
          }
        } else {
          if (isChecked) {
            const allCheckbox = repProductOptions.querySelector('input[value="all"]');
            if (allCheckbox) allCheckbox.checked = false;
            
            selectedReportProducts = selectedReportProducts.filter(p => p !== 'all');
            if (!selectedReportProducts.includes(val)) {
              selectedReportProducts.push(val);
            }
          } else {
            selectedReportProducts = selectedReportProducts.filter(p => p !== val);
            if (selectedReportProducts.length === 0) {
              selectedReportProducts = ['all'];
              const allCheckbox = repProductOptions.querySelector('input[value="all"]');
              if (allCheckbox) allCheckbox.checked = true;
            }
          }
        }
        
        // Update header text
        if (selectedReportProducts.includes('all')) {
          repProductHeader.textContent = 'ทั้งหมด (All)';
        } else if (selectedReportProducts.length === 1) {
          repProductHeader.textContent = selectedReportProducts[0];
        } else {
          repProductHeader.textContent = `เลือก ${selectedReportProducts.length} รายการ`;
        }
      }
    });
  }

  const searchInput = document.getElementById('inv-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderInventoryList(searchInput.value.trim());
    });
  }

  const selectAllCb = document.getElementById('inv-select-all');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.inv-row-checkbox').forEach(cb => {
        cb.checked = isChecked;
      });
      updateDeleteSelectedBtn();
    });
  }

  const deleteSelectedBtn = document.getElementById('delete-selected-inv-btn');
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', deleteSelectedInventoryRecords);
  }

  // Initial load
  loadInventoryAdjustments();
}

let inventoryUnsubscribe = null;

export function loadInventoryAdjustments() {
  if (inventoryUnsubscribe) return; // Already subscribed
  
  inventoryUnsubscribe = subscribeInventoryAdjustments((data) => {
    adjustmentsCache = data;
    const searchInput = document.getElementById('inv-search-input');
    renderInventoryList(searchInput ? searchInput.value.trim() : '');
  });
}

function renderInventoryList(searchTerm = '') {
  if (!invTableBody) return;
  
  invTableBody.innerHTML = '';
  
  // Flatten in case of previous corrupted data with nested paths due to '/'
  const validEntries = [];
  if (adjustmentsCache) {
    Object.entries(adjustmentsCache).forEach(([key, value]) => {
      if (value && value.docNo) {
        validEntries.push([key, value]);
      } else if (value && typeof value === 'object') {
        Object.entries(value).forEach(([subKey, subValue]) => {
          if (subValue && subValue.docNo) {
            validEntries.push([`${key}/${subKey}`, subValue]);
          }
        });
      }
    });
  }

  const entries = validEntries.sort((a, b) => {
    // Sort descending by timestamp (newest first)
    const timeA = a[1].timestamp || 0;
    const timeB = b[1].timestamp || 0;
    
    if (timeB !== timeA) {
      return timeB - timeA;
    }

    // Fallback for older records without timestamp
    const dateA = a[1].docDate || '';
    const dateB = b[1].docDate || '';
    return dateB.localeCompare(dateA) || b[0].localeCompare(a[0]);
  }).filter(([docId, doc]) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const docNoMatch = doc.docNo && doc.docNo.toLowerCase().includes(term);
    const userMatch = doc.recordedBy && doc.recordedBy.toLowerCase().includes(term);
    return docNoMatch || userMatch;
  });

  if (entries.length === 0) {
    invTableBody.innerHTML = `<tr><td colspan="7" style="padding: 3rem 0;"><div style="text-align: center; color: var(--text-secondary); font-size: 1rem;">ไม่มีข้อมูลใบปรับปรุงยอดสินค้า</div></td></tr>`;
    const selectAllCb = document.getElementById('inv-select-all');
    if (selectAllCb) {
      selectAllCb.checked = false;
      selectAllCb.disabled = true;
    }
    updateDeleteSelectedBtn();
    return;
  }
  
  const selectAllCb = document.getElementById('inv-select-all');
  if (selectAllCb) {
    selectAllCb.checked = false;
    selectAllCb.disabled = false;
  }

  entries.forEach(([docId, doc], index) => {
    const tr = document.createElement('tr');
    
    if (doc.isDeleted) {
      tr.style.backgroundColor = '#fee2e2'; // red-100
      tr.style.color = '#ef4444'; // red-500
    }

    
    // Format date DD/MM/YYYY
    let displayDate = doc.docDate;
    if (displayDate && displayDate.includes('-')) {
      const parts = displayDate.split('-');
      if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    tr.innerHTML = `
      <td style="text-align: left; padding-left: 1rem;"><input type="checkbox" class="inv-row-checkbox" data-id="${docId}"></td>
      <td style="text-align: left;">${index + 1}</td>
      <td style="text-align: left; font-weight: 600; color: var(--primary-color);">${escapeHTML(doc.docNo)}</td>
      <td style="text-align: left;">${escapeHTML(displayDate)}</td>
      <td style="text-align: left;">${escapeHTML(doc.recordedBy || '-')}</td>
      <td style="text-align: left;">${escapeHTML(doc.remark || '')}</td>
      <td style="text-align: left;">
        <button class="btn-view-inv" data-id="${docId}" style="background: none; border: none; color: #3b82f6; cursor: pointer; padding: 4px; margin-right: 8px;" title="ดูข้อมูล">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button class="btn-del-inv" data-id="${docId}" data-deleted="${doc.isDeleted ? 'true' : 'false'}" style="background: none; border: none; color: ${doc.isDeleted ? '#9ca3af' : '#ef4444'}; cursor: ${doc.isDeleted ? 'not-allowed' : 'pointer'}; padding: 4px;" title="ลบข้อมูล" ${doc.isDeleted ? 'disabled' : ''}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>
    `;
    invTableBody.appendChild(tr);
  });

  // Attach event listeners for View and Delete buttons
  document.querySelectorAll('.btn-view-inv').forEach(btn => {
    btn.addEventListener('click', (e) => {
      viewInventoryDetails(e.target.dataset.id);
    });
  });

  document.querySelectorAll('.btn-del-inv').forEach(btn => {
    btn.addEventListener('click', (e) => {
      deleteInventoryRecord(e.target.dataset.id);
    });
  });

  document.querySelectorAll('.inv-row-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const allCb = document.querySelectorAll('.inv-row-checkbox');
      const checkedCb = document.querySelectorAll('.inv-row-checkbox:checked');
      const selectAllCb = document.getElementById('inv-select-all');
      if (selectAllCb) {
        selectAllCb.checked = (allCb.length > 0 && allCb.length === checkedCb.length);
      }
      updateDeleteSelectedBtn();
    });
  });
  updateDeleteSelectedBtn();
}

function showInventoryList() {
  if (inventoryListView) inventoryListView.style.display = 'block';
  if (inventoryFormView) inventoryFormView.style.display = 'none';
  if (inventoryReportView) inventoryReportView.style.display = 'none';
  
  const inventoryHeader = document.getElementById('inventory-header');
  if (inventoryHeader) inventoryHeader.style.display = '';
}

function saveInventoryFormDraft() {
  if (!itemsTableBody) return;
  const docDate = document.getElementById('inv-doc-date')?.value || '';
  const user = document.getElementById('inv-doc-user')?.value || '';
  const remark = document.getElementById('inv-doc-remark')?.value || '';

  const rows = itemsTableBody.querySelectorAll('tr');
  const items = [];
  rows.forEach(row => {
    items.push({
      pCode: row.querySelector('.item-pcode')?.value || '',
      pName: row.querySelector('.item-pname')?.value || '',
      color: row.querySelector('.item-color')?.value || '',
      qtyIn: row.querySelector('.item-qty-in')?.value || '',
      qtyOut: row.querySelector('.item-qty-out')?.value || '',
      lot: row.querySelector('.item-lot')?.value || '',
      packer: row.querySelector('.item-packer')?.value || ''
    });
  });

  const draft = { docDate, user, remark, items };
  localStorage.setItem('inventoryFormDraft', JSON.stringify(draft));
}

function loadInventoryFormDraft() {
  const draftStr = localStorage.getItem('inventoryFormDraft');
  if (!draftStr) return false;
  try {
    const draft = JSON.parse(draftStr);
    if (!draft.items || draft.items.length === 0) return false;

    if (draft.docDate) document.getElementById('inv-doc-date').value = draft.docDate;
    if (draft.user) document.getElementById('inv-doc-user').value = draft.user;
    if (draft.remark) document.getElementById('inv-doc-remark').value = draft.remark;
    
    itemsTableBody.innerHTML = ''; 
    draft.items.forEach(item => {
      addInventoryItemRow();
      const lastRow = itemsTableBody.lastElementChild;
      
      const pCodeSelect = lastRow.querySelector('.item-pcode');
      pCodeSelect.value = item.pCode;
      if (item.pCode) {
         pCodeSelect.dispatchEvent(new Event('input')); 
         const autocomplete = document.getElementById('pcode-autocomplete');
         if (autocomplete) autocomplete.style.display = 'none';
      }
      
      lastRow.querySelector('.item-pname').value = item.pName;
      const colorSelect = lastRow.querySelector('.item-color');
      if (colorSelect && item.color) colorSelect.value = item.color;
      
      lastRow.querySelector('.item-qty-in').value = item.qtyIn;
      lastRow.querySelector('.item-qty-out').value = item.qtyOut;
      lastRow.querySelector('.item-lot').value = item.lot;
      lastRow.querySelector('.item-packer').value = item.packer;
    });
    
    itemsTableBody.querySelectorAll('.item-qty-in').forEach(el => el.dispatchEvent(new Event('input')));
    return true;
  } catch (e) {
    console.error('Error parsing draft', e);
    return false;
  }
}

async function openInventoryForm() {
  if (inventoryListView) inventoryListView.style.display = 'none';
  if (inventoryFormView) inventoryFormView.style.display = 'block';
  if (inventoryReportView) inventoryReportView.style.display = 'none';
  
  const inventoryHeader = document.getElementById('inventory-header');
  if (inventoryHeader) inventoryHeader.style.display = 'none';

  // Fetch products if not loaded yet
  const products = getProducts();
  if (Object.keys(products).length === 0) {
    await fetchProducts();
  }

  // Reset form
  if (invForm) invForm.reset();
  if (itemsTableBody) itemsTableBody.innerHTML = '';

  // Generate Default Doc No
  const dateObj = new Date();
  
  document.getElementById('inv-doc-no').value = 'กำลังโหลด...';
  const nextDocNo = await generateNextDocNo();
  document.getElementById('inv-doc-no').value = nextDocNo;
  
  // Default date
  document.getElementById('inv-doc-date').value = dateObj.toISOString().split('T')[0];
  
  // Clear user field to force manual input
  document.getElementById('inv-doc-user').value = '';

  // Add one empty row or load draft
  if (!loadInventoryFormDraft()) {
    addInventoryItemRow();
  }
}

async function openInventoryReport() {
  if (inventoryListView) inventoryListView.style.display = 'none';
  if (inventoryFormView) inventoryFormView.style.display = 'none';
  if (inventoryReportView) inventoryReportView.style.display = 'block';
  
  const inventoryHeader = document.getElementById('inventory-header');
  if (inventoryHeader) inventoryHeader.style.display = 'none';

  // Extract unique products from adjustmentsCache
  const uniqueProducts = new Map(); // pCode -> pName
  if (adjustmentsCache) {
    Object.values(adjustmentsCache).forEach(val => {
      if (val && val.docNo) {
        (val.items || []).forEach(item => {
          if (item.pCode) uniqueProducts.set(item.pCode, item.pName);
        });
      } else if (val && typeof val === 'object') {
        Object.values(val).forEach(subVal => {
          if (subVal && subVal.docNo) {
             (subVal.items || []).forEach(item => {
               if (item.pCode) uniqueProducts.set(item.pCode, item.pName);
             });
          }
        });
      }
    });
  }

  // Populate product dropdown
  const optionsContainer = document.getElementById('rep-product-options');
  if (optionsContainer) {
    optionsContainer.innerHTML = '';
    
    // Add "All" option
    const allLabel = document.createElement('label');
    allLabel.className = 'multi-select-option';
    const allInput = document.createElement('input');
    allInput.type = 'checkbox';
    allInput.value = 'all';
    allInput.checked = selectedReportProducts.includes('all');
    allLabel.appendChild(allInput);
    allLabel.appendChild(document.createTextNode(' ทั้งหมด (All)'));
    optionsContainer.appendChild(allLabel);

    // Add unique products
    Array.from(uniqueProducts.keys()).sort().forEach(pCode => {
      const pName = uniqueProducts.get(pCode) || '';
      const label = document.createElement('label');
      label.className = 'multi-select-option';
      
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = pCode;
      input.checked = selectedReportProducts.includes(pCode);
      
      label.appendChild(input);
      label.appendChild(document.createTextNode(` ${escapeHTML(pCode)} - ${escapeHTML(pName)}`));
      
      optionsContainer.appendChild(label);
    });
  }
}

function updateRowNumbers() {
  if (!itemsTableBody) return;
  const rows = itemsTableBody.querySelectorAll('tr');
  rows.forEach((row, index) => {
    const numCell = row.querySelector('.row-number');
    if (numCell) numCell.textContent = index + 1;
  });
}

function addInventoryItemRow() {
  if (!itemsTableBody) return;
  
  const tr = document.createElement('tr');
  const rowId = 'row_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  tr.id = rowId;

  const products = getProducts();
  
  const validProducts = {};
  if (state.rawData) {
    state.rawData.forEach(item => {
      if (item['หมวดหมู่']) {
        const parts = item['หมวดหมู่'].split('\u00A0\u00A0\u00A0');
        if (parts.length >= 2) {
          const pCode = parts[0].trim();
          const pName = parts[1].trim();
          if (!validProducts[pCode]) validProducts[pCode] = { pName };
        }
      }
    });
  }

  // Create a floating autocomplete container if it doesn't exist
  let pcodeAutocompleteContainer = document.getElementById('pcode-autocomplete');
  if (!pcodeAutocompleteContainer) {
    pcodeAutocompleteContainer = document.createElement('div');
    pcodeAutocompleteContainer.id = 'pcode-autocomplete';
    pcodeAutocompleteContainer.style.cssText = 'display: none; position: absolute; z-index: 9999; background: white; border: 1px solid #ccc; max-height: 250px; overflow-y: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border-radius: 4px; font-size: 0.95rem; color: #1e293b;';
    document.body.appendChild(pcodeAutocompleteContainer);
  }

  const validProductsArr = Object.keys(validProducts).map(code => ({ code, name: validProducts[code].pName }));

  tr.innerHTML = `
    <td class="row-number" style="text-align: center; font-weight: bold;"></td>
    <td>
      <input type="text" class="search-input item-pcode" style="width: 100%; padding: 0.5rem;" placeholder="รหัสสินค้า" autocomplete="off" required>
    </td>
    <td><input type="text" class="search-input item-pname" style="width: 100%; padding: 0.5rem;" placeholder="ชื่อสินค้า" required></td>
    <td><select class="search-input item-color" style="width: 100%; padding: 0.5rem;" required><option value="">ระบุสี</option></select></td>
    <td><input type="number" class="search-input item-qty-in" style="width: 100%; padding: 0.5rem;" placeholder="0" min="0"></td>
    <td><input type="number" class="search-input item-qty-out" style="width: 100%; padding: 0.5rem;" placeholder="0" min="0"></td>
    <td><input type="text" class="search-input item-lot" style="width: 100%; padding: 0.5rem;" placeholder="Lot"></td>
    <td><input type="text" class="search-input item-packer" style="width: 100%; padding: 0.5rem;" placeholder="ชื่อพนักงาน" required></td>
    <td style="text-align: center;"><button type="button" class="btn-remove-row" style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold; font-size: 1.2rem;">&times;</button></td>
  `;

  itemsTableBody.appendChild(tr);
  updateRowNumbers();

  // Auto-fill product name when code is inputted/selected
  const pCodeSelect = tr.querySelector('.item-pcode');
  const pNameInput = tr.querySelector('.item-pname');
  
  const qtyInInput = tr.querySelector('.item-qty-in');
  const qtyOutInput = tr.querySelector('.item-qty-out');
  
  const updateQtyValidity = () => {
    const qIn = parseInt(qtyInInput.value) || 0;
    const qOut = parseInt(qtyOutInput.value) || 0;
    if (qIn === 0 && qOut === 0) {
      qtyInInput.setCustomValidity("กรุณาระบุจำนวน รับ หรือ จ่าย อย่างน้อย 1 ช่อง");
    } else {
      qtyInInput.setCustomValidity("");
    }
    
    let anyOut = false;
    document.querySelectorAll('.item-qty-out').forEach(input => {
      if ((parseInt(input.value) || 0) > 0) anyOut = true;
    });
    const remarkInput = document.getElementById('inv-doc-remark');
    if (remarkInput) remarkInput.required = anyOut;
  };
  
  qtyInInput.addEventListener('input', updateQtyValidity);
  qtyOutInput.addEventListener('input', updateQtyValidity);
  updateQtyValidity();
  
  const showAutocomplete = () => {
    const term = pCodeSelect.value.trim().toLowerCase();
    pcodeAutocompleteContainer.innerHTML = '';
    
    const filtered = validProductsArr.filter(p => p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term));
    if (filtered.length === 0) {
      pcodeAutocompleteContainer.style.display = 'none';
      return;
    }
    
    filtered.forEach(p => {
      const div = document.createElement('div');
      div.style.padding = '8px 12px';
      div.style.cursor = 'pointer';
      div.style.borderBottom = '1px solid #f1f5f9';
      div.innerHTML = `<strong>${escapeHTML(p.code)}</strong> - ${escapeHTML(p.name)}`;
      
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pCodeSelect.value = p.code;
        pcodeAutocompleteContainer.style.display = 'none';
        pCodeSelect.dispatchEvent(new Event('input'));
      });
      div.addEventListener('mouseover', () => div.style.backgroundColor = '#f8fafc');
      div.addEventListener('mouseout', () => div.style.backgroundColor = 'transparent');
      
      pcodeAutocompleteContainer.appendChild(div);
    });
    
    const rect = pCodeSelect.getBoundingClientRect();
    pcodeAutocompleteContainer.style.left = `${rect.left + window.scrollX}px`;
    pcodeAutocompleteContainer.style.top = `${rect.bottom + window.scrollY}px`;
    pcodeAutocompleteContainer.style.width = `${rect.width}px`;
    pcodeAutocompleteContainer.style.display = 'block';
  };

  pCodeSelect.addEventListener('focus', showAutocomplete);

  pCodeSelect.addEventListener('blur', () => {
    pcodeAutocompleteContainer.style.display = 'none';
    const selectedCode = pCodeSelect.value.trim();
    if (selectedCode && !validProducts[selectedCode]) {
      alert("ข้อมูลนี้ไม่ถูกต้อง หรือยังไม่มีข้อมูลนี้อยู่ใน google sheet");
      pCodeSelect.value = '';
      pNameInput.value = '';
      const colorSelect = tr.querySelector('.item-color');
      if (colorSelect) colorSelect.innerHTML = '<option value="">ระบุสี</option>';
    }
  });

  const tc = document.querySelector('.table-container');
  if (tc && !tc.dataset.hasScrollListener) {
    tc.addEventListener('scroll', () => {
      if (pcodeAutocompleteContainer) pcodeAutocompleteContainer.style.display = 'none';
    });
    tc.dataset.hasScrollListener = 'true';
  }

  pCodeSelect.addEventListener('input', () => {
    showAutocomplete();
    const selectedCode = pCodeSelect.value.trim();
    
    if (selectedCode && validProducts[selectedCode]) {
      pNameInput.value = validProducts[selectedCode].pName || '';
    } else {
      pNameInput.value = '';
    }
    
    // Fetch colors from state.rawData and product config
    const colorSelect = tr.querySelector('.item-color');
    if (colorSelect) {
      colorSelect.innerHTML = '<option value="">ระบุสี</option>';
      if (selectedCode) {
        const uniqueColors = new Set();
        const prefixMatch = `${selectedCode}\u00A0\u00A0\u00A0`;
        
        if (state.rawData) {
          state.rawData.forEach(item => {
            if (item['หมวดหมู่'] && item['หมวดหมู่'].startsWith(prefixMatch) && item['สี']) {
               uniqueColors.add(item['สี']);
            }
          });
        }
        
        if (products[selectedCode] && products[selectedCode].colors) {
          products[selectedCode].colors.split(',').forEach(c => {
            if (c.trim()) uniqueColors.add(c.trim());
          });
        }
        
        uniqueColors.forEach(color => {
          colorSelect.innerHTML += `<option value="${escapeHTML(color)}">${escapeHTML(color)}</option>`;
        });
      }
    }
  });

  // blur handles the validation now

  // Remove row handler
  tr.querySelector('.btn-remove-row').addEventListener('click', () => {
    if (itemsTableBody.children.length > 1) {
      tr.remove();
      updateRowNumbers();
      
      let anyOut = false;
      document.querySelectorAll('.item-qty-out').forEach(input => {
        if ((parseInt(input.value) || 0) > 0) anyOut = true;
      });
      const remarkInput = document.getElementById('inv-doc-remark');
      if (remarkInput) remarkInput.required = anyOut;
      saveInventoryFormDraft();
    } else {
      alert("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ");
    }
  });
  
  // Save when a new row is initially added
  saveInventoryFormDraft();
}

async function handleInventoryFormSubmit(e) {
  e.preventDefault();
  
  const docNo = document.getElementById('inv-doc-no').value.trim();
  const docDate = document.getElementById('inv-doc-date').value;
  const recordedBy = document.getElementById('inv-doc-user').value;
  const remark = document.getElementById('inv-doc-remark').value.trim();
  
  if (!docNo || !docDate) return;

  const rows = itemsTableBody.querySelectorAll('tr');
  const items = [];
  
  const validProductsSubmit = {};
  if (state.rawData) {
    state.rawData.forEach(item => {
      if (item['หมวดหมู่']) {
        const parts = item['หมวดหมู่'].split('\u00A0\u00A0\u00A0');
        if (parts.length >= 2) validProductsSubmit[parts[0].trim()] = true;
      }
    });
  }

  let isValid = true;
  let invalidMsg = "กรุณาเลือกสินค้าให้ครบทุกรายการ";
  rows.forEach(row => {
    const pCodeSelect = row.querySelector('.item-pcode');
    const pNameInput = row.querySelector('.item-pname');
    const colorSelect = row.querySelector('.item-color');
    const packerInput = row.querySelector('.item-packer');
    const lotInput = row.querySelector('.item-lot');
    const qtyInInput = row.querySelector('.item-qty-in');
    const qtyOutInput = row.querySelector('.item-qty-out');
    
    const codeVal = pCodeSelect.value.trim();
    if (!codeVal || !validProductsSubmit[codeVal]) {
      isValid = false;
      pCodeSelect.style.borderColor = 'red';
      if (codeVal && !validProductsSubmit[codeVal]) {
        invalidMsg = "ข้อมูลนี้ไม่ถูกต้อง หรือยังไม่มีข้อมูลนี้อยู่ใน google sheet";
      }
      return;
    } else {
      pCodeSelect.style.borderColor = '';
    }

    const colorVal = colorSelect ? colorSelect.value : '';
    if (!colorVal) {
      isValid = false;
      if (colorSelect) colorSelect.style.borderColor = 'red';
      invalidMsg = "กรุณาระบุสีสำหรับสินค้าทุกรายการ";
      return;
    } else {
      if (colorSelect) colorSelect.style.borderColor = '';
    }

    const qtyIn = parseInt(qtyInInput.value) || 0;
    const qtyOut = parseInt(qtyOutInput.value) || 0;

    items.push({
      pCode: pCodeSelect.value,
      pName: pNameInput.value.trim(),
      color: colorSelect ? colorSelect.value : '',
      packerName: packerInput.value.trim(),
      unit: "ตัว",
      lot: lotInput.value.trim(),
      qtyIn: qtyIn,
      qtyOut: qtyOut
    });
  });

  if (!isValid) {
    alert(invalidMsg);
    return;
  }
  
  if (items.length === 0) {
    alert("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ");
    return;
  }

  // Check for negative stock
  const currentStock = {};
  if (state.inventoryAdjustments) {
    state.inventoryAdjustments.forEach(entry => {
      if (entry && entry.items) {
        if (entry.isDeleted) return;
        entry.items.forEach(item => {
           const key = `${item.pCode}|${item.color || ''}`;
           if (!currentStock[key]) currentStock[key] = 0;
           currentStock[key] += (Number(item.qtyIn) || 0) - (Number(item.qtyOut) || 0);
        });
      } else if (entry && typeof entry === 'object') {
        Object.values(entry).forEach(subDoc => {
          if (subDoc && subDoc.items) {
            if (subDoc.isDeleted) return;
            subDoc.items.forEach(item => {
               const key = `${item.pCode}|${item.color || ''}`;
               if (!currentStock[key]) currentStock[key] = 0;
               currentStock[key] += (Number(item.qtyIn) || 0) - (Number(item.qtyOut) || 0);
            });
          }
        });
      }
    });
  }

  let hasNegativeStockWarning = false;
  items.forEach(item => {
    if (item.qtyOut > 0) {
      const key = `${item.pCode}|${item.color || ''}`;
      const stock = currentStock[key] || 0;
      if (item.qtyOut > stock) {
        hasNegativeStockWarning = true;
      }
    }
  });

  if (hasNegativeStockWarning) {
    if (!confirm("จำนวนสต๊อกน้อยกว่าจำนวนจ่าย ถ้ากดตกลง เลขสต๊อกก็จะติดลบ ต้องการทำรายการต่อหรือไม่?")) {
      return;
    }
  }

  const saveBtn = document.getElementById('save-inventory-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'กำลังบันทึก...';

  let finalDocNo = docNo;
  let docId = finalDocNo.replace(/[.#$[\]\/]/g, '_');
  
  // Check for duplicate docId
  let exists = await checkDocExists(docId);
  if (exists) {
    finalDocNo = await generateNextDocNo();
    docId = finalDocNo.replace(/[.#$[\]\/]/g, '_');
    alert(`เลขที่เอกสาร ${docNo} มีการใช้งานไปแล้ว ระบบได้สร้างเลขใหม่ให้เป็น ${finalDocNo}`);
    document.getElementById('inv-doc-no').value = finalDocNo;
  }

  const docData = {
    docNo: finalDocNo,
    docDate,
    recordedBy,
    remark,
    status: 'W', // Default Wait status
    items,
    timestamp: Date.now()
  };

  const result = await saveInventoryAdjustment(docId, docData);
  
  if (result.success) {
    alert('บันทึกเอกสารเรียบร้อยแล้ว');
    localStorage.removeItem('inventoryFormDraft');
    showInventoryList();
  } else {
    alert('เกิดข้อผิดพลาดในการบันทึก: ' + result.error);
  }
  
  saveBtn.disabled = false;
  saveBtn.textContent = 'บันทึก';
}

function generateInventoryReport() {
  const startDate = document.getElementById('rep-start-date').value;
  const endDate = document.getElementById('rep-end-date').value;
  // productSelect is now managed by selectedReportProducts state array
  const groupRadio = document.querySelector('input[name="rep_group"]:checked').value;
  const hideCancelled = document.getElementById('chk-hide-cancelled').checked;
  const hidePacker = document.getElementById('chk-hide-packer').checked;
  
  const container = document.getElementById('report-results-container');
  const printBtn = document.getElementById('print-report-btn');
  
  if (!container) return;

  if (!startDate || !endDate) {
    alert('กรุณาเลือกช่วงวันที่ให้ครบถ้วน');
    return;
  }

  // Flatten data
  const flatEntries = [];
  if (adjustmentsCache) {
    Object.values(adjustmentsCache).forEach(val => {
      if (val && val.docNo) {
        if (!hideCancelled || !val.isDeleted) flatEntries.push(val);
      } else if (val && typeof val === 'object') {
        Object.values(val).forEach(subVal => {
          if (subVal && subVal.docNo && (!hideCancelled || !subVal.isDeleted)) flatEntries.push(subVal);
        });
      }
    });
  }

  // Filter Data
  const entries = flatEntries.filter(doc => {
    return doc.docDate >= startDate && doc.docDate <= endDate;
  });

  if (entries.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">ไม่พบข้อมูลเอกสารในช่วงเวลาที่เลือก</div>`;
    if (printBtn) printBtn.style.display = 'none';
    return;
  }
  
  if (printBtn) printBtn.style.display = 'block';

  // Format Dates
  const formatD = (d) => {
    if (!d || !d.includes('-')) return d;
    const p = d.split('-');
    return `${p[2]}/${p[1]}/${p[0]}`;
  };

  let reportHtml = `<div class="printable-report" style="background: white; padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color); color: #000;">`;
  reportHtml += `<style>
    @media print {
      body * { visibility: hidden; }
      .printable-report, .printable-report * { visibility: visible; }
      .printable-report { position: absolute; left: 0; top: 0; width: 100%; border: none; font-size: 9px !important; line-height: 1.1 !important; }
      .printable-report table { font-size: 9px !important; }
      .printable-report th { font-size: 9px !important; padding: 1px 0 !important; border-bottom: 1px solid #000 !important; }
      .printable-report td { font-size: 9px !important; padding: 1px 0 !important; }
      .printable-report h3 { font-size: 12px !important; margin-bottom: 2px !important; }
      .printable-report p { font-size: 9px !important; margin-bottom: 4px !important; line-height: 1.2 !important; }
      .printable-report td span { font-size: 9px !important; }
      .printable-report > div { margin-bottom: 6px !important; } 
      .printable-report div[style*="font-size: 1.1rem"] { font-size: 10px !important; margin-bottom: 1px !important; gap: 1rem !important; font-weight: bold; }
      .printable-report div[style*="font-size: 1.2rem"] { font-size: 11px !important; padding: 4px !important; margin-bottom: 0 !important; border: none !important; }
      .hide-on-print { display: none !important; }
    }
  </style>`;
  
  let condTexts = [];
  if (hideCancelled) condTexts.push('ไม่แสดงรายการที่ลบ');
  if (hidePacker) condTexts.push('ไม่แสดงคนแพ็ค');
  const condStr = condTexts.length > 0 ? condTexts.join(', ') : 'ไม่มี';
  
  let prodStr = selectedReportProducts.includes('all') ? 'ทั้งหมด' : `${selectedReportProducts.length} รายการ`;
  let groupStr = groupRadio === 'Date' ? 'สรุปตามวันที่' : (groupRadio === 'Product' ? 'สรุปตามสินค้า' : 'สรุปตาม Lot');

  reportHtml += `<h3 style="margin-bottom: 0.5rem; text-align: center;">รายงานใบปรับปรุงยอดสินค้า</h3>`;
  reportHtml += `<p style="text-align: center; margin-bottom: 1.5rem; color: #475569; line-height: 1.5;">
    วันที่: <strong>${formatD(startDate)} ถึง ${formatD(endDate)}</strong><br>
    รูปแบบ: <strong>${groupStr}</strong> | สินค้า: <strong>${prodStr}</strong><span class="hide-on-print"> | เงื่อนไข: <strong>${condStr}</strong></span>
  </p>`;
  
  const packerTh = hidePacker ? '' : '<th style="padding: 8px 4px; border: none; width: 15%;">พนักงานแพ็คสินค้า</th>';
  const packerTd = (val) => hidePacker ? '' : `<td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${escapeHTML(val || '-')}</td>`;
  
  if (groupRadio === 'Date') {
    let totalQtyIn = 0;
    let totalQtyOut = 0;
    
    // Sort by Date
    entries.sort((a, b) => a.docDate.localeCompare(b.docDate)).forEach(doc => {
      // Filter valid items first
      const validItems = (doc.items || []).filter(item => selectedReportProducts.includes('all') || selectedReportProducts.includes(item.pCode));
      
      if (validItems.length > 0) {
        reportHtml += `<div style="margin-bottom: 2rem;">
          <div style="display: flex; gap: 3rem; margin-bottom: 0.5rem; font-size: 1.1rem; color: #1e293b;">
            <span style="min-width: 150px;">${escapeHTML(doc.docNo)}</span>
            <span>${formatD(doc.docDate)}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; color: #475569;">
            <thead><tr style="border-bottom: 1px solid #cbd5e1; color: #64748b; font-size: 0.9rem;">
              <th style="padding: 8px 4px; border: none; width: 12%;">รหัสสินค้า</th>
              <th style="padding: 8px 4px; border: none; width: 25%;">ชื่อสินค้า</th>
              <th style="padding: 8px 4px; border: none; width: 10%;">สี</th>
              <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">รับ</th>
              <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">จ่าย</th>
              <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">Lot</th>
              ${packerTh}
            </tr></thead>
            <tbody>`;
            
        validItems.forEach(item => {
          if (!doc.isDeleted) {
            totalQtyIn += (Number(item.qtyIn) || 0);
            totalQtyOut += (Number(item.qtyOut) || 0);
          }
          
          let qtyInText = item.qtyIn ? `<span style="color: #166534;">${Number(item.qtyIn)}</span>` : '-';
          let qtyOutText = item.qtyOut ? `<span style="color: #b91c1c;">${Number(item.qtyOut)}</span>` : '-';
          
          let trStyle = "";
          if (doc.isDeleted) trStyle = "text-decoration: line-through; color: #ef4444; opacity: 0.6;";
          
          reportHtml += `<tr style="${trStyle}">
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${escapeHTML(item.pCode)}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${escapeHTML(item.pName)}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${escapeHTML(item.color || '-')}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyInText}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyOutText}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${escapeHTML(item.lot || '-')}</td>
            ${packerTd(item.packerName)}
          </tr>`;
        });
        
        reportHtml += `</tbody></table></div>`;
      }
    });
    
    reportHtml += `<div style="text-align: right; padding: 1rem; font-size: 1.2rem; font-weight: bold; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;">
      ยอดรวมทั้งหมด - <span style="color: #166534;">รับ: ${totalQtyIn}</span> | <span style="color: #b91c1c;">จ่าย: ${totalQtyOut}</span>
    </div>`;
  } else if (groupRadio === 'Product') {
    // Group by Product
    const productGroups = {};
    let grandTotalIn = 0;
    let grandTotalOut = 0;
    
    entries.forEach(doc => {
      (doc.items || []).forEach(item => {
        if (selectedReportProducts.includes('all') || selectedReportProducts.includes(item.pCode)) {
          if (!productGroups[item.pCode]) {
            productGroups[item.pCode] = { name: item.pName, unit: item.unit, totalIn: 0, totalOut: 0, details: [] };
          }
          if (!doc.isDeleted) {
            productGroups[item.pCode].totalIn += (Number(item.qtyIn) || 0);
            productGroups[item.pCode].totalOut += (Number(item.qtyOut) || 0);
            grandTotalIn += (Number(item.qtyIn) || 0);
            grandTotalOut += (Number(item.qtyOut) || 0);
          }
          productGroups[item.pCode].details.push({ 
            date: doc.docDate, docNo: doc.docNo, isDeleted: doc.isDeleted,
            qtyIn: (item.qtyIn || 0), qtyOut: (item.qtyOut || 0), 
            packerName: item.packerName, lot: item.lot,
            color: item.color, unit: item.unit
          });
        }
      });
    });
    
    Object.keys(productGroups).forEach(pCode => {
      const g = productGroups[pCode];
      reportHtml += `<div style="margin-bottom: 2rem;">
        <div style="display: flex; gap: 3rem; margin-bottom: 0.5rem; font-size: 1.1rem; color: #1e293b;">
          <span>สินค้า: ${escapeHTML(pCode)} - ${escapeHTML(g.name)}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; color: #475569;">
          <thead><tr style="border-bottom: 1px solid #cbd5e1; color: #64748b; font-size: 0.9rem;">
            <th style="padding: 8px 4px; border: none; width: 12%;">วันที่</th>
            <th style="padding: 8px 4px; border: none; width: 18%;">เลขที่เอกสาร</th>
            <th style="padding: 8px 4px; border: none; width: 10%;">สี</th>
            <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">รับ</th>
            <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">จ่าย</th>
            <th style="padding: 8px 4px; border: none; width: 17%; text-align: right;">Lot</th>
            ${packerTh}
          </tr></thead><tbody>`;
          
      g.details.sort((a,b) => a.date.localeCompare(b.date)).forEach(d => {
        let qtyInText = d.qtyIn ? `<span style="color: #166534;">${Number(d.qtyIn)}</span>` : '-';
        let qtyOutText = d.qtyOut ? `<span style="color: #b91c1c;">${Number(d.qtyOut)}</span>` : '-';
        
        let trStyle = "";
        if (d.isDeleted) trStyle = "text-decoration: line-through; color: #ef4444; opacity: 0.6;";
        
        reportHtml += `<tr style="${trStyle}">
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${formatD(d.date)}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${escapeHTML(d.docNo)}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${escapeHTML(d.color || '-')}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyInText}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyOutText}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${escapeHTML(d.lot || '-')}</td>
          ${packerTd(d.packerName)}
        </tr>`;
      });
      const remainingCols = hidePacker ? 1 : 2;
      reportHtml += `<tr style="font-weight: bold; color: #1e293b;">
        <td colspan="3" style="padding: 8px 4px; text-align: right;">รวมสินค้านี้</td>
        <td style="padding: 8px 4px; text-align: right; color: #166534;">${Number(g.totalIn)}</td>
        <td style="padding: 8px 4px; text-align: right; color: #b91c1c;">${Number(g.totalOut)}</td>
        <td colspan="${remainingCols}" style="padding: 8px 4px;"></td>
      </tr>`;
      reportHtml += `</tbody></table></div>`;
    });
    
    reportHtml += `<div style="text-align: right; padding: 1rem; font-size: 1.2rem; font-weight: bold; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;">
      ยอดรวมทุกรายการ - <span style="color: #166534;">รับ: ${grandTotalIn}</span> | <span style="color: #b91c1c;">จ่าย: ${grandTotalOut}</span>
    </div>`;
  } else if (groupRadio === 'Lot') {
    // Group by Lot
    const lotGroups = {};
    let grandTotalIn = 0;
    let grandTotalOut = 0;
    
    entries.forEach(doc => {
      (doc.items || []).forEach(item => {
        if (selectedReportProducts.includes('all') || selectedReportProducts.includes(item.pCode)) {
          const lotKey = item.lot ? item.lot.trim() : 'ไม่มี Lot';
          if (!lotGroups[lotKey]) {
            lotGroups[lotKey] = { totalIn: 0, totalOut: 0, details: [] };
          }
          if (!doc.isDeleted) {
            lotGroups[lotKey].totalIn += (Number(item.qtyIn) || 0);
            lotGroups[lotKey].totalOut += (Number(item.qtyOut) || 0);
            grandTotalIn += (Number(item.qtyIn) || 0);
            grandTotalOut += (Number(item.qtyOut) || 0);
          }
          lotGroups[lotKey].details.push({ 
            date: doc.docDate, docNo: doc.docNo, isDeleted: doc.isDeleted,
            pCode: item.pCode, pName: item.pName, color: item.color,
            qtyIn: (item.qtyIn || 0), qtyOut: (item.qtyOut || 0), 
            packerName: item.packerName, unit: item.unit
          });
        }
      });
    });
    
    Object.keys(lotGroups).sort().forEach(lotKey => {
      const g = lotGroups[lotKey];
      reportHtml += `<div style="margin-bottom: 2rem;">
        <div style="display: flex; gap: 3rem; margin-bottom: 0.5rem; font-size: 1.1rem; color: #1e293b;">
          <span>Lot: ${escapeHTML(lotKey)}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; color: #475569;">
          <thead><tr style="border-bottom: 1px solid #cbd5e1; color: #64748b; font-size: 0.9rem;">
            <th style="padding: 8px 4px; border: none; width: 12%;">วันที่</th>
            <th style="padding: 8px 4px; border: none; width: 18%;">เลขที่เอกสาร</th>
            <th style="padding: 8px 4px; border: none; width: 25%;">รหัส/ชื่อสินค้า</th>
            <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">รับ</th>
            <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">จ่าย</th>
            ${packerTh}
          </tr></thead><tbody>`;
          
      g.details.sort((a,b) => a.date.localeCompare(b.date)).forEach(d => {
        let qtyInText = d.qtyIn ? `<span style="color: #166534;">${Number(d.qtyIn)}</span>` : '-';
        let qtyOutText = d.qtyOut ? `<span style="color: #b91c1c;">${Number(d.qtyOut)}</span>` : '-';
        
        let trStyle = "";
        if (d.isDeleted) trStyle = "text-decoration: line-through; color: #ef4444; opacity: 0.6;";
        
        reportHtml += `<tr style="${trStyle}">
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${formatD(d.date)}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${escapeHTML(d.docNo)}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${escapeHTML(d.pCode)} - ${escapeHTML(d.pName)}${d.color ? ` (${escapeHTML(d.color)})` : ''}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyInText}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyOutText}</td>
          ${packerTd(d.packerName)}
        </tr>`;
      });
      const remainingCols = hidePacker ? 0 : 1;
      const extraTds = remainingCols > 0 ? `<td colspan="${remainingCols}" style="padding: 8px 4px;"></td>` : '';
      reportHtml += `<tr style="font-weight: bold; color: #1e293b;">
        <td colspan="3" style="padding: 8px 4px; text-align: right;">รวม Lot นี้</td>
        <td style="padding: 8px 4px; text-align: right; color: #166534;">${Number(g.totalIn)}</td>
        <td style="padding: 8px 4px; text-align: right; color: #b91c1c;">${Number(g.totalOut)}</td>
        ${extraTds}
      </tr>`;
      reportHtml += `</tbody></table></div>`;
    });
    
    reportHtml += `<div style="text-align: right; padding: 1rem; font-size: 1.2rem; font-weight: bold; background: #f8fafc; border: 1px solid #cbd5e1;">
      ยอดรวมทุกรายการ - <span style="color: #166534;">รับ: ${grandTotalIn}</span> | <span style="color: #b91c1c;">จ่าย: ${grandTotalOut}</span>
    </div>`;
  }

  reportHtml += `</div>`;
  container.innerHTML = reportHtml;
}

// ----------------------------------------------------
// Action Handlers
// ----------------------------------------------------


function viewInventoryDetails(docIdToFind) {
  let foundDoc = null;
  if (adjustmentsCache) {
    Object.entries(adjustmentsCache).forEach(([key, val]) => {
      if (val && val.docNo) {
        if (key === docIdToFind) foundDoc = val;
      } else if (val && typeof val === 'object') {
        Object.entries(val).forEach(([subKey, subVal]) => {
          if (subVal && subVal.docNo) {
             if (`${key}/${subKey}` === docIdToFind) foundDoc = subVal;
          }
        });
      }
    });
  }

  if (!foundDoc) {
    alert("ไม่พบข้อมูลเอกสาร");
    return;
  }

  // Format date DD/MM/YYYY
  let displayDate = foundDoc.docDate;
  if (displayDate && displayDate.includes('-')) {
    const parts = displayDate.split('-');
    if (parts.length === 3) displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  const modalHtml = `
    <div id="inv-view-modal" style="position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.5); z-index: 1000; display:flex; justify-content:center; align-items:center;">
      <div style="background: white; padding: 2rem; border-radius: 8px; max-width: 800px; width: 90%; max-height: 90vh; overflow-y: auto; position: relative;">
        <h3 style="margin-bottom: 1.5rem; color: var(--primary-color);">รายละเอียดใบปรับปรุงยอดสินค้า</h3>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; background: #f8fafc; padding: 1.25rem; border-radius: 8px; border: 1px solid #cbd5e1;">
          <div><strong style="color: #475569;">เลขที่เอกสาร:</strong> <span style="font-weight: 600;">${escapeHTML(foundDoc.docNo)}</span></div>
          <div><strong style="color: #475569;">วันที่:</strong> <span>${escapeHTML(displayDate)}</span></div>
          <div><strong style="color: #475569;">ผู้บันทึก:</strong> <span>${escapeHTML(foundDoc.recordedBy || '-')}</span></div>
          <div><strong style="color: #475569;">หมายเหตุ:</strong> <span>${escapeHTML(foundDoc.remark || '')}</span></div>
        </div>

        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 10px; border: 1px solid #cbd5e1;">รหัส/ชื่อสินค้า</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; color: #166534;">รับ</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; color: #b91c1c;">จ่าย</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1;">Lot</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1;">พนักงานแพ็คสินค้า</th>
            </tr>
          </thead>
          <tbody>
            ${(foundDoc.items || []).map(item => `
              <tr>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${escapeHTML(item.pCode)} - ${escapeHTML(item.pName)}${item.color ? ` (${escapeHTML(item.color)})` : ''}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #166534;">${item.qtyIn || 0}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #b91c1c;">${item.qtyOut || 0}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${escapeHTML(item.lot || '-')}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${escapeHTML(item.packerName || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="text-align: right; margin-top: 2rem;">
          <button id="close-inv-modal-btn" class="btn-primary" style="background-color: #64748b; border-color: #64748b; padding: 0.5rem 1.5rem;">ปิดหน้าต่าง</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  document.getElementById('close-inv-modal-btn').addEventListener('click', () => {
    const modal = document.getElementById('inv-view-modal');
    if (modal) modal.remove();
  });
}

async function deleteInventoryRecord(docId) {
  if (confirm('คุณต้องการลบใบปรับปรุงยอดสินค้านี้ใช่หรือไม่? การลบจะทำให้สต๊อกที่อัพเดทไว้ถูกยกเลิกด้วย')) {
    const result = await deleteInventoryAdjustment(docId);
    if (result.success) {
      alert('ลบข้อมูลเรียบร้อยแล้ว');
    } else {
      alert('เกิดข้อผิดพลาดในการลบ: ' + result.error);
    }
  }
}

function updateDeleteSelectedBtn() {
  const checkedBoxes = document.querySelectorAll('.inv-row-checkbox:checked');
  const btn = document.getElementById('delete-selected-inv-btn');
  if (!btn) return;
  if (checkedBoxes.length > 0) {
    btn.style.display = 'inline-block';
    btn.textContent = `ลบที่เลือก (${checkedBoxes.length})`;
    btn.disabled = false;
  } else {
    btn.style.display = 'none';
  }
}

async function deleteSelectedInventoryRecords() {
  const checkedBoxes = document.querySelectorAll('.inv-row-checkbox:checked');
  if (checkedBoxes.length === 0) return;
  
  if (confirm(`คุณต้องการลบเอกสารใบปรับปรุงยอดสินค้าจำนวน ${checkedBoxes.length} รายการใช่หรือไม่? การลบจะทำให้สต๊อกที่อัพเดทไว้ถูกยกเลิกด้วย`)) {
    let successCount = 0;
    let errorCount = 0;
    
    const btn = document.getElementById('delete-selected-inv-btn');
    if (btn) btn.disabled = true;
    
    for (const cb of checkedBoxes) {
      const docId = cb.dataset.id;
      const result = await deleteInventoryAdjustment(docId);
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
        console.error('Error deleting doc', docId, result.error);
      }
    }
    
    alert(`ลบข้อมูลสำเร็จ ${successCount} รายการ${errorCount > 0 ? `\nลบไม่สำเร็จ ${errorCount} รายการ` : ''}`);
  }
}
