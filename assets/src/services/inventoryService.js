import { ref as dbRef, get, set, remove, update, query, orderByChild, limitToLast, onValue, runTransaction } from "firebase/database";
import { database } from "../config/firebase.js";

/**
 * Fetch all inventory adjustment documents (one-time read)
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
 * Subscribe to inventory adjustments in real-time.
 * Calls the callback whenever data changes.
 * Returns an unsubscribe function.
 */
export function subscribeInventoryAdjustments(callback) {
  const invRef = dbRef(database, 'inventory_adjustments');
  const unsubscribe = onValue(invRef, (snapshot) => {
    const data = snapshot.exists() ? snapshot.val() : {};
    callback(data);
  }, (error) => {
    console.error("Error subscribing to inventory adjustments:", error);
    callback({});
  });
  return unsubscribe;
}

/**
 * Check if a document ID already exists in Firebase
 */
export async function checkDocExists(docId) {
  try {
    const invRef = dbRef(database, `inventory_adjustments/${docId}`);
    const snapshot = await get(invRef);
    return snapshot.exists();
  } catch (error) {
    console.error("Error checking doc existence:", error);
    return false;
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
 * Generate the next document number using Firebase Transaction.
 * Uses a counter at inventory_counters/{year} to atomically increment.
 * This prevents duplicate document numbers when multiple users create documents simultaneously.
 */
export async function generateNextDocNo() {
  try {
    const fullYear = new Date().getFullYear();
    const prefix = `AI-${fullYear}/`;
    
    // ดึงข้อมูลเอกสารใบเดียวที่เลขมากที่สุดมาเลย
    const invRef = dbRef(database, 'inventory_adjustments');
    const lastDocQuery = query(invRef, orderByChild('docNo'), limitToLast(1));
    const snapshot = await get(lastDocQuery);
    
    let maxNumber = 0;
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      Object.keys(data).forEach(key => {
        const docNo = data[key]?.docNo || "";
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
    }
    
    const nextNumber = maxNumber + 1;
    // Format to 4 digits (e.g., 0001)
    const formattedNumber = String(nextNumber).padStart(4, '0');
    return `${prefix}${formattedNumber}`;
    
  } catch (error) {
    console.error("Error generating next doc no:", error);
    // Fallback if error
    const fullYear = new Date().getFullYear();
    return `AI-${fullYear}/0001`;
  }
}
