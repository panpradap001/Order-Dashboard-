import { ref as dbRef, get, set, remove } from "firebase/database";
import { ref as storageRef, uploadBytes, deleteObject, getDownloadURL } from "firebase/storage";
import { database, storage } from "../config/firebase.js";
import { state, DATA_KEYS } from "../store/state.js";
import { DOM } from "../utils/dom.js";
import { escapeHTML } from "../utils/helpers.js";
import { getProductImageUrl } from "../services/imageService.js";

// Global cache for product data
let productsCache = {};

export function getProducts() {
  return productsCache;
}

export async function fetchProducts() {
  try {
    const pRef = dbRef(database, 'products');
    const snapshot = await get(pRef);
    if (snapshot.exists()) {
      productsCache = snapshot.val();
    } else {
      productsCache = {};
    }
  } catch (error) {
    console.error("Error fetching products:", error);
  }
}

export async function saveProduct(data, imageFile) {
  try {
    const { pCode, pName, colors, features } = data;
    
    // 1. Upload Image to Storage (if selected)
    if (imageFile) {
      // Delete old images first to prevent ghost images if extension changes
      const tryDeleteOldImage = async (ext) => {
        try {
          const oldRef = storageRef(storage, `picture/${pCode}.${ext}`);
          await deleteObject(oldRef);
        } catch (e) {}
      };
      await tryDeleteOldImage('jpg');
      await tryDeleteOldImage('png');

      const ext = imageFile.name.split('.').pop().toLowerCase();
      const fileName = `${pCode}.${ext}`;
      const imgRef = storageRef(storage, `picture/${fileName}`);
      await uploadBytes(imgRef, imageFile);
      
      // Invalidate the cache so the UI fetches the new image URL
      if (state.imageCache && state.imageCache[pCode]) {
        delete state.imageCache[pCode];
      }
    }
    
    // 2. Save Data to Realtime Database
    const productRef = dbRef(database, `products/${pCode}`);
    await set(productRef, {
      pCode,
      pName,
      colors,
      features
    });
    
    // Update cache
    productsCache[pCode] = { pCode, pName, colors, features };
    
    return { success: true };
  } catch (error) {
    console.error("Error saving product:", error);
    return { success: false, error: error.message };
  }
}

export function renderProductCatalog() {
  const container = document.getElementById('product-catalog-container');
  if (!container) return;
  
  if (Object.keys(productsCache).length === 0) {
    container.innerHTML = `
      <div class="no-results" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
        <p>ยังไม่มีข้อมูลสินค้าในระบบ (กรุณาเพิ่มข้อมูลผ่านปุ่ม จัดการข้อมูลสินค้า)</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  // For each product in the DB, render a small card (Page 1)
  Object.keys(productsCache).forEach(pCode => {
    const product = productsCache[pCode];
    
    const card = document.createElement('div');
    card.className = 'category-card product-item-card';
    card.setAttribute('data-pcode', product.pCode.toLowerCase());
    card.setAttribute('data-pname', (product.pName || '').toLowerCase());
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.padding = '0';
    card.style.overflow = 'hidden';
    card.style.borderRadius = '16px';
    card.style.cursor = 'pointer';
    card.style.transition = 'transform 0.2s, box-shadow 0.2s';
    
    // Hover effect
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-4px)';
      card.style.boxShadow = '0 12px 30px -8px rgba(0, 0, 0, 0.15)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'none';
      card.style.boxShadow = 'var(--card-shadow)';
    });

    // Click to show details (Page 2)
    card.addEventListener('click', () => showProductDetail(product.pCode));

    let colorDotsHTML = '';
    if (product.colors) {
      const colorsList = product.colors.split(',').map(c => c.trim()).filter(c => c !== '');
      if (colorsList.length > 0) {
        colorDotsHTML = `<div style="display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap;">`;
        colorsList.forEach(colorName => {
          let colorDot = '#cbd5e1'; 
          let bgImage = null;
          if (colorName.includes('แดง')) colorDot = '#991b1b';
          if (colorName.includes('น้ำเงิน') || colorName.includes('ฟ้า')) colorDot = '#1d4ed8';
          if (colorName.includes('เทา')) colorDot = '#475569';
          if (colorName.includes('ระเบิด')) {
            // ใส่ URL ของรูปภาพจาก Firebase Storage ตรงนี้
            bgImage = "url('https://firebasestorage.googleapis.com/v0/b/test-372d4.firebasestorage.app/o/color%2Fbomb_color.jpg?alt=media&token=ac76134b-354f-4c39-90ae-fb8c6ebfa550')";
          }
          if (colorName.includes('ดำ')) colorDot = '#000000';
          if (colorName.includes('ขาว')) colorDot = '#ffffff';
          if (colorName.includes('ขาวครีม') || colorName.includes('ครีม')) colorDot = '#fef3c7';
          if (colorName.includes('เหลือง')) colorDot = '#eab308';
          if (colorName.includes('ไม้')) colorDot = '#8b5a2b';
          if (colorName.includes('ส้ม')) colorDot = '#f97316';
          if (colorName.includes('ชมพู')) colorDot = '#ec4899';
          if (colorName.includes('เขียว')) colorDot = '#22c55e';
          
          const bgStyle = bgImage 
            ? `background-image: ${bgImage}; background-size: cover; background-position: center;` 
            : `background-color: ${colorDot};`;
          
          colorDotsHTML += `<div style="width: 16px; height: 16px; border-radius: 50%; ${bgStyle} border: 1px solid #e2e8f0; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);"></div>`;
        });
        colorDotsHTML += `</div>`;
      }
    }

    const html = `
      <div style="width: 100%; height: 220px; background-color: #f8fafc; display: flex; justify-content: center; align-items: center; padding: 1.5rem; border-bottom: 1px solid #f1f5f9;">
        <img 
          id="product-thumb-${escapeHTML(pCode)}"
          src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%23eee'/><text x='50' y='50' font-family='Arial' font-size='14' fill='%23999' text-anchor='middle' alignment-baseline='middle'>Loading...</text></svg>"
          alt="${escapeHTML(product.pCode)}" 
          style="width: 100%; height: 100%; object-fit: contain;"
        >
      </div>
      
      <div style="padding: 1.25rem; width: 100%; background-color: #ffffff; flex-grow: 1; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: 700; color: #3b82f6; font-size: 0.95rem;">${escapeHTML(product.pCode)}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
        <h3 style="font-weight: 700; color: #1e293b; font-size: 1.05rem; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">
          ${escapeHTML(product.pName)}
        </h3>
        ${colorDotsHTML}
      </div>
    `;

    card.innerHTML = html;
    fragment.appendChild(card);
  });

  container.appendChild(fragment);

  // Fetch images securely via SDK for thumbnails
  Object.keys(productsCache).forEach(pCode => {
    loadSecureImage(pCode, true);
  });
}

export function showProductDetail(pCode) {
  const listView = document.getElementById('product-list-view');
  const detailView = document.getElementById('product-detail-view');
  const detailContainer = document.getElementById('product-detail-container');
  
  const addBtn = document.getElementById('add-product-btn');
  const importBtn = document.getElementById('import-excel-btn');
  const searchInput = document.getElementById('product-search-input');
  
  if (listView) listView.style.display = 'none';
  if (detailView) detailView.style.display = 'block';
  
  // Hide top controls and main header in detail view
  const mainHeader = document.getElementById('product-dashboard-header');
  if (mainHeader) mainHeader.style.display = 'none';
  if (addBtn) addBtn.style.display = 'none';
  if (importBtn) importBtn.style.display = 'none';
  if (searchInput) searchInput.parentElement.style.display = 'none';
  
  // Update Breadcrumb
  const breadcrumbCode = document.getElementById('breadcrumb-product-code');
  if (breadcrumbCode) breadcrumbCode.textContent = pCode;

  const product = productsCache[pCode];
  if (!product) return;

  const featuresList = (product.features || '')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => `<li>${escapeHTML(line.trim())}</li>`)
    .join('');

  let leftColumnHTML = `
    <div class="product-detail-left">
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem; display: flex; justify-content: center; align-items: center; min-height: 250px;">
          <img 
          id="product-img-${escapeHTML(pCode)}"
          src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%23eee'/><text x='50' y='50' font-family='Arial' font-size='14' fill='%23999' text-anchor='middle' alignment-baseline='middle'>Loading...</text></svg>"
          alt="${escapeHTML(product.pCode)}" 
          style="width: 100%; max-width: 300px; object-fit: contain; border-radius: 8px;"
        >
      </div>
  `;

  if (product.colors) {
    const colorsList = product.colors.split(',').map(c => c.trim()).filter(c => c !== '');
    if (colorsList.length > 0) {
      leftColumnHTML += `
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem; margin-top: -0.5rem;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 1rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color, #3b82f6)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1.5"></circle><circle cx="17.5" cy="10.5" r="1.5"></circle><circle cx="8.5" cy="7.5" r="1.5"></circle><circle cx="6.5" cy="12.5" r="1.5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>
            <h3 style="font-size: 1.1rem; font-weight: 600; color: var(--text-primary);">สีที่มีจำหน่าย</h3>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 1.5rem;">
      `;
      
      colorsList.forEach((colorName, idx) => {
        let colorDot = '#cbd5e1'; 
        let bgImage = null;
        if (colorName.includes('แดง')) colorDot = '#991b1b';
        if (colorName.includes('น้ำเงิน') || colorName.includes('ฟ้า')) colorDot = '#1d4ed8';
        if (colorName.includes('เทา')) colorDot = '#475569';
        if (colorName.includes('ระเบิด')) {
          // ใส่ URL ของรูปภาพจาก Firebase Storage ตรงนี้ (ลิงก์เดียวกันกับด้านบน)
          bgImage = "url('https://firebasestorage.googleapis.com/v0/b/test-372d4.firebasestorage.app/o/color%2Fbomb_color.jpg?alt=media&token=ac76134b-354f-4c39-90ae-fb8c6ebfa550')";
        }
        if (colorName.includes('ดำ')) colorDot = '#000000';
        if (colorName.includes('ขาว')) colorDot = '#ffffff';
        if (colorName.includes('ขาวครีม') || colorName.includes('ครีม')) colorDot = '#fef3c7';
        if (colorName.includes('เหลือง')) colorDot = '#eab308';
        if (colorName.includes('ไม้')) colorDot = '#8b5a2b';
        if (colorName.includes('ส้ม')) colorDot = '#f97316';
        if (colorName.includes('ชมพู')) colorDot = '#ec4899';
        if (colorName.includes('เขียว')) colorDot = '#22c55e';

        const ringColor = '#e2e8f0';
        const bgStyle = bgImage 
          ? `background-image: ${bgImage}; background-size: cover; background-position: center;` 
          : `background-color: ${colorDot};`;

        leftColumnHTML += `
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; ${bgStyle} border: 3px solid #ffffff; box-shadow: 0 0 0 2px ${ringColor}, 0 2px 6px rgba(0,0,0,0.1);"></div>
            <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); text-align: center;">${escapeHTML(colorName)}</span>
          </div>
        `;
      });
      leftColumnHTML += `
          </div>
        </div>
      `;
    }
  }

  leftColumnHTML += `</div>`;

  let rightColumnHTML = `
    <div class="product-detail-right">
      <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 1rem; position: relative;">
        <div style="display: inline-block; background-color: #e2e8f0; padding: 6px 16px; border-radius: 6px; font-weight: 700; font-size: 1.2rem; margin-bottom: 0.5rem;">
          ${escapeHTML(product.pCode)}
        </div>
        <h2 style="font-size: 1.75rem; color: var(--text-primary); margin-bottom: 0.5rem; font-weight: 700;">${escapeHTML(product.pName)}</h2>
        ${state.currentUser?.role === 'admin' ? `
        <div style="position: absolute; top: 0; right: 0; display: flex; gap: 12px; align-items: center;">
          <button class="edit-product-btn" data-pcode="${product.pCode}" style="background: none; border: none; color: var(--primary-color); cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 0.9rem; font-weight: 600;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            แก้ไข
          </button>
          <button class="delete-product-btn" data-pcode="${product.pCode}" style="background: none; border: none; color: #ef4444; cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 0.9rem; font-weight: 600;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            ลบ
          </button>
        </div>
        ` : ''}
      </div>
      
      ${featuresList ? `
      <div class="product-features-section">
        <h4 style="font-size: 1rem; color: var(--text-secondary); margin-bottom: 0.5rem;">ข้อมูลผลิตภัณฑ์</h4>
        <div style="padding: 1rem 0;">
          <ul style="padding-left: 1.25rem; line-height: 1.8; color: var(--text-primary); font-size: 1.05rem;">
            ${featuresList}
          </ul>
        </div>
      </div>
      ` : ''}
    </div>
  `;

  detailContainer.innerHTML = `
    <div class="product-detail-grid">
      ${leftColumnHTML}
      ${rightColumnHTML}
    </div>
  `;

  // Load high-res image
  loadSecureImage(pCode, false);

  // Bind edit buttons
  detailContainer.querySelectorAll('.edit-product-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      openEditForm(pCode);
    });
  });

  // Bind delete buttons
  detailContainer.querySelectorAll('.delete-product-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm(`ยืนยันการลบสินค้า "${pCode}" ใช่หรือไม่?\nข้อมูลและรูปภาพที่เกี่ยวข้องจะถูกลบออกจากระบบอย่างถาวร`)) {
        btn.textContent = 'กำลังลบ...';
        btn.disabled = true;
        const result = await deleteProduct(pCode);
        if (result.success) {
          document.getElementById('back-to-products-btn').click();
          renderProductCatalog();
        } else {
          alert(`ไม่สามารถลบข้อมูลได้: ${result.error}`);
          btn.textContent = 'ลบ';
          btn.disabled = false;
        }
      }
    });
  });
}

export async function deleteProduct(pCode) {
  try {
    const productRef = dbRef(database, `products/${pCode}`);
    await remove(productRef);

    const tryDeleteImage = async (ext) => {
      try {
        const imgRef = storageRef(storage, `picture/${pCode}.${ext}`);
        await deleteObject(imgRef);
      } catch (e) {
      }
    };
    await tryDeleteImage('jpg');
    await tryDeleteImage('png');

    delete productsCache[pCode];
    if (state.imageCache) delete state.imageCache[pCode];
    return { success: true };
  } catch (err) {
    console.error("Error deleting product:", err);
    return { success: false, error: err.message };
  }
}

async function loadSecureImage(pCode, isThumbnail = false) {
  const imgId = isThumbnail ? `product-thumb-${escapeHTML(pCode)}` : `product-img-${escapeHTML(pCode)}`;
  const imgEl = document.getElementById(imgId);
  if (!imgEl) return;
  const url = await getProductImageUrl(pCode);
  imgEl.src = url;
}

export function openEditForm(pCode = null) {
  const listView = document.getElementById('product-list-view');
  const detailView = document.getElementById('product-detail-view');
  const formContainer = document.getElementById('product-admin-form-container');
  const form = document.getElementById('product-admin-form');
  const addBtn = document.getElementById('add-product-btn');
  const importBtn = document.getElementById('import-excel-btn');
  const searchInput = document.getElementById('product-search-input');
  const mainHeader = document.getElementById('product-dashboard-header');
  
  if (listView) listView.style.display = 'none';
  if (detailView) detailView.style.display = 'none';
  if (formContainer) formContainer.style.display = 'block';
  
  if (mainHeader) mainHeader.style.display = 'none';
  if (addBtn) addBtn.style.display = 'none';
  if (importBtn) importBtn.style.display = 'none';
  if (searchInput) searchInput.parentElement.style.display = 'none';
  
  const msg = document.getElementById('product-save-msg');
  if (msg) msg.textContent = '';
  
  if (pCode && productsCache[pCode]) {
    // Edit mode
    const product = productsCache[pCode];
    document.getElementById('product-code-input').value = product.pCode;
    document.getElementById('product-code-input').readOnly = true; 
    document.getElementById('product-name-input').value = product.pName || '';
    document.getElementById('product-colors-input').value = product.colors || '';
    document.getElementById('product-features-input').value = product.features || '';
  } else {
    // Create mode
    form.reset();
    document.getElementById('product-code-input').readOnly = false;
  }
}

export function closeEditForm() {
  const listView = document.getElementById('product-list-view');
  const formContainer = document.getElementById('product-admin-form-container');
  const addBtn = document.getElementById('add-product-btn');
  const importBtn = document.getElementById('import-excel-btn');
  const searchInput = document.getElementById('product-search-input');
  const mainHeader = document.getElementById('product-dashboard-header');
  
  if (listView) listView.style.display = 'block';
  if (formContainer) formContainer.style.display = 'none';
  
  if (mainHeader) mainHeader.style.display = 'flex';
  if (state.currentUser?.role === 'admin') {
    if (addBtn) addBtn.style.display = 'block';
    if (importBtn) importBtn.style.display = 'block';
  }
  if (searchInput) searchInput.parentElement.style.display = 'flex';
}

export async function importProductsFromExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = window.XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = window.XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (json.length <= 1) {
          return resolve({ success: false, error: 'ไม่พบข้อมูลในไฟล์ Excel' });
        }

        const headers = json[0].map(h => String(h).toLowerCase().trim());
        const pCodeIdx = headers.findIndex(h => h.includes('pcode') || h.includes('รหัส'));
        const pNameIdx = headers.findIndex(h => h.includes('pname') || h.includes('ชื่อ'));
        const colorsIdx = headers.findIndex(h => h.includes('color') || h.includes('สี'));
        const featuresIdx = headers.findIndex(h => h.includes('feature') || h.includes('ข้อมูล') || h.includes('รายละ'));

        if (pCodeIdx === -1) {
          return resolve({ success: false, error: 'ไม่พบคอลัมน์ รหัสสินค้า (pCode)' });
        }

        let successCount = 0;
        
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row || row.length === 0) continue;
          
          const pCode = row[pCodeIdx] ? String(row[pCodeIdx]).trim() : '';
          if (!pCode) continue;

          const pName = pNameIdx !== -1 && row[pNameIdx] ? String(row[pNameIdx]).trim() : '';
          const colors = colorsIdx !== -1 && row[colorsIdx] ? String(row[colorsIdx]).trim() : '';
          const features = featuresIdx !== -1 && row[featuresIdx] ? String(row[featuresIdx]).trim() : '';

          const productRef = dbRef(database, `products/${pCode}`);
          await set(productRef, {
            pCode,
            pName,
            colors,
            features
          });
          
          productsCache[pCode] = { pCode, pName, colors, features };
          successCount++;
        }
        
        resolve({ success: true, count: successCount });
      } catch (err) {
        console.error("Error parsing excel:", err);
        resolve({ success: false, error: `เกิดข้อผิดพลาดในการอ่านไฟล์: ${err.message}` });
      }
    };
    reader.onerror = () => {
      resolve({ success: false, error: 'ไม่สามารถอ่านไฟล์ได้' });
    };
    reader.readAsArrayBuffer(file);
  });
}
