import { state } from "../store/state.js";
import { DOM } from "../utils/dom.js";
import { renderDashboard, updateCategoryDropdown, updateMultiSelectHeader, adjustPresentationScale } from "../views/dashboardView.js";
import { renderStoreList } from "../views/storeView.js";
import { fetchProducts, renderProductCatalog, saveProduct, openEditForm, closeEditForm, importProductsFromExcel } from "../views/productView.js";
import { login, logout } from "../services/auth.js";

export function setupEventListeners() {
  const sidebar = document.getElementById('app-sidebar');
  const desktopToggle = document.getElementById('desktop-toggle-btn');
  const mobileToggle = document.getElementById('mobile-toggle-btn');
  const overlay = document.getElementById('sidebar-overlay');
  
  if (desktopToggle && sidebar) {
    desktopToggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }
  
  if (mobileToggle && sidebar && overlay) {
    mobileToggle.addEventListener('click', () => {
      sidebar.classList.add('mobile-open');
      overlay.classList.add('active');
    });
    
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  }

  DOM.navItems.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.currentTarget.id === 'logout-btn') return;
      
      if (sidebar && overlay && window.innerWidth <= 768) {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
      }
      DOM.navItems.forEach(n => n.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      
      const viewId = targetBtn.getAttribute('data-view');
      DOM.viewSections.forEach(sec => sec.style.display = 'none');
      
      const targetView = document.getElementById(viewId);
      if (targetView) targetView.style.display = 'block';
      
      if (viewId === 'view-store') {
        document.getElementById('view-store-list').style.display = 'block';
        document.getElementById('view-store-detail').style.display = 'none';
        state.currentStoreDetailName = null;
        renderStoreList();
      } else if (viewId === 'view-products') {
        // Fetch products and render catalog when opening the view
        fetchProducts().then(() => {
          renderProductCatalog();
        });
      }
    });
  });

  if (DOM.backToStoreListBtn) {
    DOM.backToStoreListBtn.addEventListener('click', () => {
      document.getElementById('view-store-list').style.display = 'block';
      document.getElementById('view-store-detail').style.display = 'none';
      state.currentStoreDetailName = null;
    });
  }

  const storeSearchInput = document.getElementById('store-search');
  if (storeSearchInput) {
    storeSearchInput.addEventListener('input', (e) => {
      clearTimeout(state.storeSearchDebounceTimeout);
      state.storeSearchDebounceTimeout = setTimeout(() => {
        renderStoreList();
      }, 300);
    });
  }

  if (DOM.categorySearch) {
    DOM.categorySearch.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().trim();
      const labels = DOM.categoryFilterOptions.querySelectorAll('label');
      labels.forEach(label => {
        const text = label.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
          label.style.display = 'flex';
        } else {
          label.style.display = 'none';
        }
      });
    });
  }

  if (DOM.activeOnlyToggle) {
    DOM.activeOnlyToggle.addEventListener('change', (e) => {
      state.showOnlyActive = e.target.checked;
      state.activeCategories = new Set(); 
      updateCategoryDropdown(state.rawData);
      renderDashboard();
    });
  }

  if (DOM.stockOnlyToggle) {
    DOM.stockOnlyToggle.addEventListener('change', (e) => {
      state.showOnlyStock = e.target.checked;
      state.activeCategories = new Set(); 
      updateCategoryDropdown(state.rawData);
      renderDashboard();
    });
  }

  if (DOM.categoryFilterHeader) {
    DOM.categoryFilterHeader.addEventListener('click', (e) => {
      DOM.categoryFilterDropdown.classList.toggle('show');
      if (DOM.categoryFilterDropdown.classList.contains('show')) {
        DOM.categorySearch.value = '';
        const labels = DOM.categoryFilterOptions.querySelectorAll('label');
        labels.forEach(label => label.style.display = 'flex');
        setTimeout(() => DOM.categorySearch.focus(), 50);
      }
      e.stopPropagation();
    });
  }

  document.addEventListener('click', (e) => {
    if (DOM.categoryMultiSelect && !DOM.categoryMultiSelect.contains(e.target)) {
      if (DOM.categoryFilterDropdown) DOM.categoryFilterDropdown.classList.remove('show');
    }
  });

  if (DOM.categoryFilterOptions) {
    DOM.categoryFilterOptions.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        const val = e.target.value;
        const isChecked = e.target.checked;
        
        if (val === 'all') {
          if (isChecked) {
            state.currentCategories = ['all'];
            const checkboxes = DOM.categoryFilterOptions.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
              if (cb.value !== 'all') cb.checked = false;
            });
          } else {
            e.target.checked = true; 
          }
        } else {
          if (isChecked) {
            const allCheckbox = DOM.categoryFilterOptions.querySelector('input[value="all"]');
            if (allCheckbox) allCheckbox.checked = false;
            
            state.currentCategories = state.currentCategories.filter(c => c !== 'all');
            if (!state.currentCategories.includes(val)) {
              state.currentCategories.push(val);
            }
          } else {
            state.currentCategories = state.currentCategories.filter(c => c !== val);
            if (state.currentCategories.length === 0) {
              state.currentCategories = ['all'];
              const allCheckbox = DOM.categoryFilterOptions.querySelector('input[value="all"]');
              if (allCheckbox) allCheckbox.checked = true;
            }
          }
        }
        
        updateMultiSelectHeader();
        renderDashboard();
      }
    });
  }

  if (DOM.presentationBtn) {
    DOM.presentationBtn.addEventListener('click', () => {
      state.isPresentationMode = true;
      document.body.classList.add('presentation-mode');
      
      if (state.sortableInstance) state.sortableInstance.option('disabled', false);
      
      renderDashboard(); // เรียกใช้ใหม่เพื่อลบคอลัมน์รูปภาพออก
      
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch((e) => console.log(e));
      }
    });
  }

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      state.isPresentationMode = false;
      document.body.classList.remove('presentation-mode');
      if (DOM.dashboardContainer) DOM.dashboardContainer.style.transform = 'none';
      document.documentElement.style.fontSize = ''; 
      if (state.sortableInstance) state.sortableInstance.option('disabled', true);
      renderDashboard();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isPresentationMode) {
      state.isPresentationMode = false;
      document.body.classList.remove('presentation-mode');
      if (DOM.dashboardContainer) DOM.dashboardContainer.style.transform = 'none';
      document.documentElement.style.fontSize = ''; 
      if (state.sortableInstance) state.sortableInstance.option('disabled', true);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch((e) => console.log(e));
      }
      renderDashboard();
    }
  });

  window.addEventListener('resize', () => {
    if (state.isPresentationMode) {
      adjustPresentationScale();
    }
  });

  if (DOM.loginForm) {
    DOM.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = DOM.loginUsername.value.trim();
      const password = DOM.loginPassword.value;
      const submitBtn = document.getElementById('login-submit-btn');
      
      if (submitBtn) {
        submitBtn.textContent = 'กำลังตรวจสอบ...';
        submitBtn.disabled = true;
      }
      
      const result = await login(username, password);
      
      if (!result.success) {
        if (DOM.loginError) {
          DOM.loginError.style.display = 'block';
          DOM.loginError.textContent = 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง';
        }
        if (submitBtn) {
          submitBtn.textContent = 'เข้าสู่ระบบ';
          submitBtn.disabled = false;
        }
      } else {
        if (DOM.loginError) DOM.loginError.style.display = 'none';
        if (submitBtn) {
          submitBtn.textContent = 'เข้าสู่ระบบ';
          submitBtn.disabled = false;
        }
        DOM.loginForm.reset();
      }
    });
  }

  if (DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener('click', async () => {
      if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
        await logout();
      }
    });
  }
  

  // --- Password Toggle Buttons ---
  const togglePasswordVisibility = (toggleBtnId, inputId) => {
    const btn = document.getElementById(toggleBtnId);
    const input = document.getElementById(inputId);
    if (btn && input) {
      btn.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.innerHTML = isPassword
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-off-icon"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" y1="2" x2="22" y2="22"></line></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        btn.style.color = isPassword ? 'var(--primary-color, #3b82f6)' : 'var(--text-secondary)';
      });
    }
  };

  togglePasswordVisibility('toggle-login-password', 'login-password');
  togglePasswordVisibility('toggle-new-user-password', 'new-user-password');

  // --- Back to Top Button ---
  const backToTopBtn = document.getElementById('back-to-top-btn');
  const mainContent = document.querySelector('.main-content');
  
  if (backToTopBtn && mainContent) {
    mainContent.addEventListener('scroll', () => {
      if (mainContent.scrollTop > 300) {
        backToTopBtn.style.display = 'flex';
        // A tiny timeout to ensure transition plays
        setTimeout(() => {
          backToTopBtn.style.opacity = '1';
        }, 10);
      } else {
        backToTopBtn.style.opacity = '0';
        setTimeout(() => {
          if (backToTopBtn.style.opacity === '0') {
            backToTopBtn.style.display = 'none';
          }
        }, 300); // Wait for transition
      }
    });

    backToTopBtn.addEventListener('click', () => {
      mainContent.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // --- Product Management Events ---
  const productSearchInput = document.getElementById('product-search-input');
  if (productSearchInput) {
    let productSearchDebounceTimeout;
    productSearchInput.addEventListener('input', (e) => {
      clearTimeout(productSearchDebounceTimeout);
      productSearchDebounceTimeout = setTimeout(() => {
        const searchTerm = e.target.value.toLowerCase().trim();
        const productCards = document.querySelectorAll('.product-item-card');
        
        productCards.forEach(card => {
          const pCode = card.getAttribute('data-pcode') || '';
          const pName = card.getAttribute('data-pname') || '';
          
          if (pCode.includes(searchTerm) || pName.includes(searchTerm)) {
            card.style.display = 'flex'; // Re-show the card
          } else {
            card.style.display = 'none'; // Hide the card
          }
        });
      }, 300);
    });
  }

  const backToProductsBtn = document.getElementById('back-to-products-btn');
  if (backToProductsBtn) {
    backToProductsBtn.addEventListener('click', () => {
      const listView = document.getElementById('product-list-view');
      const detailView = document.getElementById('product-detail-view');
      const addBtn = document.getElementById('add-product-btn');
      const importBtn = document.getElementById('import-excel-btn');
      const searchInput = document.getElementById('product-search-input');
      const mainHeader = document.getElementById('product-dashboard-header');
      
      if (listView) listView.style.display = 'block';
      if (detailView) detailView.style.display = 'none';
      
      if (mainHeader) mainHeader.style.display = 'flex';
      
      // Re-show controls based on role
      if (state.currentUser?.role === 'admin') {
        if (addBtn) addBtn.style.display = 'block';
        if (importBtn) importBtn.style.display = 'block';
      }
      if (searchInput) searchInput.parentElement.style.display = 'flex';
      
      // We don't need to re-render the catalog because we just hid it
    });
  }

  const addProductBtn = document.getElementById('add-product-btn');
  if (addProductBtn) {
    addProductBtn.addEventListener('click', () => {
      openEditForm();
    });
  }

  // --- Excel Import Events ---
  const importExcelBtn = document.getElementById('import-excel-btn');
  const excelUploadInput = document.getElementById('excel-upload-input');
  
  if (importExcelBtn && excelUploadInput) {
    importExcelBtn.addEventListener('click', () => {
      excelUploadInput.click();
    });

    excelUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const originalText = importExcelBtn.textContent;
      importExcelBtn.textContent = 'กำลังนำเข้าข้อมูล...';
      importExcelBtn.disabled = true;

      const result = await importProductsFromExcel(file);
      
      if (result.success) {
        alert(`นำเข้าข้อมูลสินค้าสำเร็จจำนวน ${result.count} รายการ`);
        renderProductCatalog();
      } else {
        alert(`เกิดข้อผิดพลาด: ${result.error}`);
      }

      importExcelBtn.textContent = originalText;
      importExcelBtn.disabled = false;
      excelUploadInput.value = ''; // Reset input
    });
  }

  const cancelProductBtn = document.getElementById('cancel-product-btn');
  if (cancelProductBtn) {
    cancelProductBtn.addEventListener('click', () => {
      closeEditForm();
    });
  }

  const productAdminForm = document.getElementById('product-admin-form');
  if (productAdminForm) {
    productAdminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const saveBtn = document.getElementById('save-product-btn');
      const msg = document.getElementById('product-save-msg');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'กำลังบันทึก...';
      }
      if (msg) {
        msg.style.color = 'var(--text-secondary)';
        msg.textContent = 'กำลังอัปโหลดข้อมูลและรูปภาพ...';
      }

      const pCode = document.getElementById('product-code-input').value.trim();
      const pName = document.getElementById('product-name-input').value.trim();
      const colors = document.getElementById('product-colors-input').value.trim();
      const features = document.getElementById('product-features-input').value.trim();
      const imageInput = document.getElementById('product-image-input');
      const imageFile = imageInput.files.length > 0 ? imageInput.files[0] : null;

      const result = await saveProduct({ pCode, pName, colors, features }, imageFile);

      if (result.success) {
        if (msg) {
          msg.style.color = 'green';
          msg.textContent = 'บันทึกข้อมูลเรียบร้อยแล้ว!';
        }
        setTimeout(() => {
          closeEditForm();
          renderProductCatalog();
        }, 1500);
      } else {
        if (msg) {
          msg.style.color = 'red';
          msg.textContent = 'เกิดข้อผิดพลาด: ' + result.error;
        }
      }

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'บันทึกข้อมูล';
      }
    });
  }
}
