import { getInventoryAdjustments, saveInventoryAdjustment, deleteInventoryAdjustment, generateNextDocNo } from "../services/inventoryService.js";
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

  const cancelInvBtn = document.getElementById('cancel-inventory-btn');
  if (cancelInvBtn) cancelInvBtn.addEventListener('click', showInventoryList);

  const closeInvBtn = document.getElementById('close-inventory-btn');
  if (closeInvBtn) closeInvBtn.addEventListener('click', showInventoryList);

  const backFromReportBtn = document.getElementById('back-from-report-btn');
  if (backFromReportBtn) backFromReportBtn.addEventListener('click', showInventoryList);

  // Event Listener for Add Row in Form
  if (addRowBtn) addRowBtn.addEventListener('click', addInventoryItemRow);

  // Form Submit
  if (invForm) invForm.addEventListener('submit', handleInventoryFormSubmit);

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

  document.addEventListener('click', (e) => {
    const multiSelect = document.getElementById('rep-product-multi-select');
    if (multiSelect && !multiSelect.contains(e.target)) {
      if (repProductDropdown) repProductDropdown.classList.remove('show');
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

export async function loadInventoryAdjustments() {
  adjustmentsCache = await getInventoryAdjustments();
  const searchInput = document.getElementById('inv-search-input');
  renderInventoryList(searchInput ? searchInput.value.trim() : '');
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
      <td style="text-align: left;">${escapeHTML(doc.remark || '')}</td>
      <td style="text-align: left;">${escapeHTML(doc.recordedBy || '-')}</td>
      <td style="text-align: left;">
        <button class="btn-view-inv" data-id="${docId}" style="background: none; border: none; color: #3b82f6; cursor: pointer; padding: 4px; margin-right: 8px;" title="ดูข้อมูล">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button class="btn-del-inv" data-id="${docId}" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px;" title="ลบข้อมูล">
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

  // Add one empty row
  addInventoryItemRow();
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

  // Prepare product options datalist (only create once)
  let dataList = document.getElementById('pcode-datalist');
  if (!dataList) {
    dataList = document.createElement('datalist');
    dataList.id = 'pcode-datalist';
    document.body.appendChild(dataList);
  }
  
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

  dataList.innerHTML = '';
  Object.keys(validProducts).forEach(pCode => {
    dataList.innerHTML += `<option value="${escapeHTML(pCode)}">${escapeHTML(validProducts[pCode].pName)}</option>`;
  });

  tr.innerHTML = `
    <td class="row-number" style="text-align: center; font-weight: bold;"></td>
    <td>
      <input type="text" list="pcode-datalist" class="search-input item-pcode" style="width: 100%; padding: 0.5rem;" placeholder="รหัสสินค้า" required>
    </td>
    <td><input type="text" class="search-input item-pname" style="width: 100%; padding: 0.5rem;" placeholder="ชื่อสินค้า" required></td>
    <td><select class="search-input item-color" style="width: 100%; padding: 0.5rem;" required><option value="">ระบุสี</option></select></td>
    <td><input type="text" class="search-input item-division" style="width: 100%; padding: 0.5rem;" placeholder="สาขา"></td>
    <td><input type="text" class="search-input item-unit" style="width: 100%; padding: 0.5rem;" placeholder="ตัว/ชิ้น"></td>
    <td><input type="number" class="search-input item-qty-in" style="width: 100%; padding: 0.5rem;" placeholder="0" min="1" required></td>
    <td><input type="number" class="search-input item-qty-out" style="width: 100%; padding: 0.5rem;" value="0" min="0"></td>
    <td><input type="text" class="search-input item-lot" style="width: 100%; padding: 0.5rem;" placeholder="Lot"></td>
    <td style="text-align: center;"><button type="button" class="btn-remove-row" style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold; font-size: 1.2rem;">&times;</button></td>
  `;

  itemsTableBody.appendChild(tr);
  updateRowNumbers();

  // Auto-fill product name when code is inputted/selected
  const pCodeSelect = tr.querySelector('.item-pcode');
  const pNameInput = tr.querySelector('.item-pname');
  
  pCodeSelect.addEventListener('input', () => {
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

  pCodeSelect.addEventListener('change', () => {
    const selectedCode = pCodeSelect.value.trim();
    if (selectedCode && !validProducts[selectedCode]) {
      alert("ข้อมูลนี้ไม่ถูกต้อง หรือยังไม่มีข้อมูลนี้อยู่ใน google sheet");
      pCodeSelect.value = '';
      pNameInput.value = '';
      const colorSelect = tr.querySelector('.item-color');
      if (colorSelect) colorSelect.innerHTML = '<option value="">ระบุสี</option>';
    }
  });

  // Remove row handler
  tr.querySelector('.btn-remove-row').addEventListener('click', () => {
    if (itemsTableBody.children.length > 1) {
      tr.remove();
      updateRowNumbers();
    } else {
      alert("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ");
    }
  });
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
    const divisionInput = row.querySelector('.item-division');
    const unitInput = row.querySelector('.item-unit');
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
      division: divisionInput.value.trim(),
      unit: unitInput.value.trim(),
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

  const saveBtn = document.getElementById('save-inventory-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'กำลังบันทึก...';

  // Use docNo as the document ID, replace invalid firebase characters INCLUDING slash
  const docId = docNo.replace(/[.#$[\]\/]/g, '_');

  const docData = {
    docNo,
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
    showInventoryList();
    loadInventoryAdjustments();
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
        flatEntries.push(val);
      } else if (val && typeof val === 'object') {
        Object.values(val).forEach(subVal => {
          if (subVal && subVal.docNo) flatEntries.push(subVal);
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

  // Aggregate Data
  let reportHtml = `<div class="printable-report" style="background: white; padding: 1.5rem; border-radius: 8px; border: 1px solid var(--border-color); color: #000;">`;
  reportHtml += `<style>
    @media print {
      body * { visibility: hidden; }
      .printable-report, .printable-report * { visibility: visible; }
      .printable-report { position: absolute; left: 0; top: 0; width: 100%; border: none; }
    }
  </style>`;
  reportHtml += `<h3 style="margin-bottom: 0.5rem; text-align: center;">รายงานใบปรับปรุงยอดสินค้า</h3>`;
  reportHtml += `<p style="text-align: center; margin-bottom: 1.5rem; color: #475569;">ตั้งแต่ ${formatD(startDate)} ถึง ${formatD(endDate)}</p>`;
  
  if (groupRadio === 'Date') {
    let totalQtyIn = 0;
    let totalQtyOut = 0;
    
    // Sort by Date
    entries.sort((a, b) => a.docDate.localeCompare(b.docDate)).forEach(doc => {
      // Filter valid items first
      const validItems = doc.items.filter(item => selectedReportProducts.includes('all') || selectedReportProducts.includes(item.pCode));
      
      if (validItems.length > 0) {
        reportHtml += `<div style="margin-bottom: 2rem;">
          <div style="display: flex; gap: 3rem; margin-bottom: 0.5rem; font-size: 1.1rem; color: #1e293b;">
            <span style="min-width: 150px;">${doc.docNo}</span>
            <span>${formatD(doc.docDate)}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; color: #475569;">
            <thead><tr style="border-bottom: 1px solid #cbd5e1; color: #64748b; font-size: 0.9rem;">
              <th style="padding: 8px 4px; border: none; width: 12%;">รหัสสินค้า</th>
              <th style="padding: 8px 4px; border: none; width: 25%;">ชื่อสินค้า</th>
              <th style="padding: 8px 4px; border: none; width: 10%;">สี</th>
              <th style="padding: 8px 4px; border: none; width: 15%;">สาขา</th>
              <th style="padding: 8px 4px; border: none; width: 8%;">หน่วยนับ</th>
              <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">รับ</th>
              <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">จ่าย</th>
              <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">Lot</th>
            </tr></thead>
            <tbody>`;
            
        validItems.forEach(item => {
          totalQtyIn += (item.qtyIn || 0);
          totalQtyOut += (item.qtyOut || 0);
          
          let qtyInText = item.qtyIn ? `<span style="color: #166534;">${Number(item.qtyIn)}</span>` : '-';
          let qtyOutText = item.qtyOut ? `<span style="color: #b91c1c;">${Number(item.qtyOut)}</span>` : '-';
          
          reportHtml += `<tr>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${item.pCode}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${item.pName}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${item.color || '-'}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${item.division || '-'}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${item.unit || '-'}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyInText}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyOutText}</td>
            <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${item.lot || '-'}</td>
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
      doc.items.forEach(item => {
        if (selectedReportProducts.includes('all') || selectedReportProducts.includes(item.pCode)) {
          if (!productGroups[item.pCode]) {
            productGroups[item.pCode] = { name: item.pName, unit: item.unit, totalIn: 0, totalOut: 0, details: [] };
          }
          productGroups[item.pCode].totalIn += (item.qtyIn || 0);
          productGroups[item.pCode].totalOut += (item.qtyOut || 0);
          grandTotalIn += (item.qtyIn || 0);
          grandTotalOut += (item.qtyOut || 0);
          productGroups[item.pCode].details.push({ 
            date: doc.docDate, docNo: doc.docNo, 
            qtyIn: (item.qtyIn || 0), qtyOut: (item.qtyOut || 0), 
            division: item.division, lot: item.lot,
            color: item.color, unit: item.unit
          });
        }
      });
    });
    
    Object.keys(productGroups).forEach(pCode => {
      const g = productGroups[pCode];
      reportHtml += `<div style="margin-bottom: 2rem;">
        <div style="display: flex; gap: 3rem; margin-bottom: 0.5rem; font-size: 1.1rem; color: #1e293b;">
          <span>สินค้า: ${pCode} - ${g.name}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; color: #475569;">
          <thead><tr style="border-bottom: 1px solid #cbd5e1; color: #64748b; font-size: 0.9rem;">
            <th style="padding: 8px 4px; border: none; width: 12%;">วันที่</th>
            <th style="padding: 8px 4px; border: none; width: 18%;">เลขที่เอกสาร</th>
            <th style="padding: 8px 4px; border: none; width: 10%;">สี</th>
            <th style="padding: 8px 4px; border: none; width: 15%;">สาขา</th>
            <th style="padding: 8px 4px; border: none; width: 8%;">หน่วยนับ</th>
            <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">รับ</th>
            <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">จ่าย</th>
            <th style="padding: 8px 4px; border: none; width: 17%; text-align: right;">Lot</th>
          </tr></thead><tbody>`;
          
      g.details.sort((a,b) => a.date.localeCompare(b.date)).forEach(d => {
        let qtyInText = d.qtyIn ? `<span style="color: #166534;">${Number(d.qtyIn)}</span>` : '-';
        let qtyOutText = d.qtyOut ? `<span style="color: #b91c1c;">${Number(d.qtyOut)}</span>` : '-';
        
        reportHtml += `<tr>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${formatD(d.date)}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${d.docNo}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${d.color || '-'}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${d.division || '-'}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${d.unit || '-'}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyInText}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyOutText}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${d.lot || '-'}</td>
        </tr>`;
      });
      reportHtml += `<tr style="font-weight: bold; color: #1e293b;">
        <td colspan="5" style="padding: 8px 4px; text-align: right;">รวมสินค้านี้</td>
        <td style="padding: 8px 4px; text-align: right; color: #166534;">${Number(g.totalIn)}</td>
        <td style="padding: 8px 4px; text-align: right; color: #b91c1c;">${Number(g.totalOut)}</td>
        <td style="padding: 8px 4px;"></td>
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
      doc.items.forEach(item => {
        if (selectedReportProducts.includes('all') || selectedReportProducts.includes(item.pCode)) {
          const lotKey = item.lot ? item.lot.trim() : 'ไม่มี Lot';
          if (!lotGroups[lotKey]) {
            lotGroups[lotKey] = { totalIn: 0, totalOut: 0, details: [] };
          }
          lotGroups[lotKey].totalIn += (item.qtyIn || 0);
          lotGroups[lotKey].totalOut += (item.qtyOut || 0);
          grandTotalIn += (item.qtyIn || 0);
          grandTotalOut += (item.qtyOut || 0);
          lotGroups[lotKey].details.push({ 
            date: doc.docDate, docNo: doc.docNo, pCode: item.pCode, pName: item.pName, color: item.color,
            qtyIn: (item.qtyIn || 0), qtyOut: (item.qtyOut || 0), 
            division: item.division, unit: item.unit
          });
        }
      });
    });
    
    Object.keys(lotGroups).sort().forEach(lotKey => {
      const g = lotGroups[lotKey];
      reportHtml += `<div style="margin-bottom: 2rem;">
        <div style="display: flex; gap: 3rem; margin-bottom: 0.5rem; font-size: 1.1rem; color: #1e293b;">
          <span>Lot: ${lotKey}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem; color: #475569;">
          <thead><tr style="border-bottom: 1px solid #cbd5e1; color: #64748b; font-size: 0.9rem;">
            <th style="padding: 8px 4px; border: none; width: 12%;">วันที่</th>
            <th style="padding: 8px 4px; border: none; width: 18%;">เลขที่เอกสาร</th>
            <th style="padding: 8px 4px; border: none; width: 25%;">รหัส/ชื่อสินค้า</th>
            <th style="padding: 8px 4px; border: none; width: 15%;">สาขา</th>
            <th style="padding: 8px 4px; border: none; width: 10%;">หน่วยนับ</th>
            <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">รับ</th>
            <th style="padding: 8px 4px; border: none; width: 10%; text-align: right;">จ่าย</th>
          </tr></thead><tbody>`;
          
      g.details.sort((a,b) => a.date.localeCompare(b.date)).forEach(d => {
        let qtyInText = d.qtyIn ? `<span style="color: #166534;">${Number(d.qtyIn)}</span>` : '-';
        let qtyOutText = d.qtyOut ? `<span style="color: #b91c1c;">${Number(d.qtyOut)}</span>` : '-';
        
        reportHtml += `<tr>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${formatD(d.date)}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${d.docNo}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${d.pCode} - ${d.pName}${d.color ? ` (${d.color})` : ''}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${d.division || '-'}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; vertical-align: top;">${d.unit || '-'}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyInText}</td>
          <td style="padding: 6px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; vertical-align: top;">${qtyOutText}</td>
        </tr>`;
      });
      reportHtml += `<tr style="font-weight: bold; color: #1e293b;">
        <td colspan="5" style="padding: 8px 4px; text-align: right;">รวม Lot นี้</td>
        <td style="padding: 8px 4px; text-align: right; color: #166534;">${Number(g.totalIn)}</td>
        <td style="padding: 8px 4px; text-align: right; color: #b91c1c;">${Number(g.totalOut)}</td>
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
          <div><strong style="color: #475569;">เลขที่เอกสาร:</strong> <span style="font-weight: 600;">${foundDoc.docNo}</span></div>
          <div><strong style="color: #475569;">วันที่:</strong> <span>${displayDate}</span></div>
          <div><strong style="color: #475569;">ผู้บันทึก:</strong> <span>${foundDoc.recordedBy || '-'}</span></div>
          <div><strong style="color: #475569;">หมายเหตุ:</strong> <span>${foundDoc.remark || ''}</span></div>
        </div>

        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
          <thead>
            <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 10px; border: 1px solid #cbd5e1;">รหัส/ชื่อสินค้า</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1;">สาขา</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1;">Lot</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; color: #166534;">รับ</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; color: #b91c1c;">จ่าย</th>
            </tr>
          </thead>
          <tbody>
            ${(foundDoc.items || []).map(item => `
              <tr>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.pCode} - ${item.pName}${item.color ? ` (${item.color})` : ''}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.division || '-'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${item.lot || '-'}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #166534;">${item.qtyIn || 0} <span style="font-weight: normal; font-size: 0.85em; color: #64748b;">${item.unit || ''}</span></td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #b91c1c;">${item.qtyOut || 0} <span style="font-weight: normal; font-size: 0.85em; color: #64748b;">${item.unit || ''}</span></td>
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
      loadInventoryAdjustments();
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
    loadInventoryAdjustments();
  }
}
