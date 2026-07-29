import { ref, onValue } from "firebase/database";
import { database } from "../config/firebase.js";
import { state, DATA_KEYS } from "../store/state.js";
import { DOM } from "../utils/dom.js";
import { updateCategoryDropdown, renderDashboard } from "../views/dashboardView.js";
import { renderStoreList, renderStoreDetail } from "../views/storeView.js";

export function fetchData() {
  const ordersRef = ref(database, 'orders/orders');
  
  onValue(ordersRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      let fetchedData = Array.isArray(data) ? data : Object.values(data);
      fetchedData = fetchedData.filter(item => item !== null && typeof item === 'object');
      
      state.rawData = fetchedData.map(item => {
        let newItem = { ...item }; 
        if (newItem[DATA_KEYS.productCode] && newItem[DATA_KEYS.category]) {
          let shortCode = String(newItem[DATA_KEYS.productCode]).split('-')[0];
          newItem[DATA_KEYS.category] = `${shortCode}\u00A0\u00A0\u00A0${newItem[DATA_KEYS.category]}`;
          delete newItem[DATA_KEYS.productCode]; 
        }
        return newItem;
      });
      
      updateCategoryDropdown(state.rawData);
      renderDashboard();
    } else {
      if(DOM.loadingSpinner) DOM.loadingSpinner.textContent = "No data found in database.";
    }
  }, (error) => {
    console.error("Firebase Read Error: ", error);
    if(DOM.loadingSpinner) DOM.loadingSpinner.textContent = "Error connecting to Firebase. Check console and configuration.";
  });
}

export function fetchCustomerOrders() {
  const customerOrdersRef = ref(database, 'orders/customerOrders');
  
  onValue(customerOrdersRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      let fetchedData = Array.isArray(data) ? data : Object.values(data);
      state.storeRawData = fetchedData.filter(item => item !== null && typeof item === 'object');
      renderStoreList();
      
      if (state.currentStoreDetailName) {
        renderStoreDetail(state.currentStoreDetailName);
      }
    }
  }, (error) => {
    console.error("Firebase Read Error (Store): ", error);
  });
}

export function fetchInventoryAdjustments() {
  const invRef = ref(database, 'inventory_adjustments');
  onValue(invRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      state.inventoryAdjustments = Array.isArray(data) ? data : Object.values(data);
    } else {
      state.inventoryAdjustments = [];
    }
    
    // Re-render dashboard to apply adjustments if rawData is loaded
    if (state.rawData && state.rawData.length > 0) {
      renderDashboard();
    }
  }, (error) => {
    console.error("Firebase Read Error (Inventory): ", error);
  });
}
