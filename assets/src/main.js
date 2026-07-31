import { setupEventListeners } from "./events/eventListeners.js";
import { fetchData, fetchCustomerOrders, fetchInventoryAdjustments } from "./services/api.js";
import { initAuth } from "./services/auth.js";
import { initUserManagement } from "./views/userManagementView.js";
import { initInventoryView } from "./views/inventoryView.js";

// Global error handler (silent in production — no alert)
window.onerror = function(message, source, lineno, colno, error) {
  console.error("App Error:", message, source, lineno, colno, error);
};

// Initialize app
function init() {
  setupEventListeners();
  
  initAuth(() => {
    fetchData();
    fetchCustomerOrders();
    fetchInventoryAdjustments();
    initUserManagement();
    initInventoryView();
  });
}

// Start App
init();
