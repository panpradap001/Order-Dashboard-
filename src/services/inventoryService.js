import { ref as dbRef, get, set, remove, update, query, orderByChild } from "firebase/database";
import { database } from "../config/firebase.js";

/**
 * Fetch all inventory adjustment documents
 */
export async function getInventoryAdjustments() {
  try {
    const invRef = dbRef(database, 'inventory_adjustments');
    const snapshot = await get(invRef);
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return {};
  } catch (error) {
    console.error("Error fetching inventory adjustments:", error);
    return {};
  }
}

/**
 * Save a new or existing inventory adjustment document
 */
export async function saveInventoryAdjustment(docId, docData) {
  try {
    const invRef = dbRef(database, `inventory_adjustments/${docId}`);
    await set(invRef, docData);
    return { success: true };
  } catch (error) {
    console.error("Error saving inventory adjustment:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete an inventory adjustment document (Soft Delete)
 */
export async function deleteInventoryAdjustment(docId) {
  try {
    const invRef = dbRef(database, `inventory_adjustments/${docId}`);
    await update(invRef, { isDeleted: true });
    return { success: true };
  } catch (error) {
    console.error("Error deleting inventory adjustment:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate the next document number (AJP-YY/XXXX)
 */
export async function generateNextDocNo() {
  try {
    const fullYear = new Date().getFullYear();
    const prefix = `AI-${fullYear}/`;
    
    const adjustments = await getInventoryAdjustments();
    
    // Flatten nested objects caused by previous bug with '/'
    const flatAdjustments = {};
    if (adjustments) {
      Object.keys(adjustments).forEach(key => {
        const val = adjustments[key];
        if (val && val.docNo) {
          flatAdjustments[key] = val;
        } else if (val && typeof val === 'object') {
          Object.keys(val).forEach(subKey => {
            if (val[subKey] && val[subKey].docNo) {
              flatAdjustments[`${key}_${subKey}`] = val[subKey];
            }
          });
        }
      });
    }
    
    let maxNumber = 0;
    
    Object.keys(flatAdjustments).forEach(key => {
      const docNo = flatAdjustments[key].docNo || "";
      if (docNo.startsWith(prefix)) {
        const parts = docNo.split('/');
        if (parts.length === 2) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    });
    
    const nextNumber = maxNumber + 1;
    // Format to 4 digits (e.g., 0001)
    const formattedNumber = String(nextNumber).padStart(4, '0');
    return `${prefix}${formattedNumber}`;
    
  } catch (error) {
    console.error("Error generating next doc no:", error);
    // Fallback if error
    const fullYear = new Date().getFullYear();
    return `AI-${fullYear}/0000`;
  }
}
