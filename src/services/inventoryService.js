import { ref as dbRef, get, set, remove, update, query, orderByChild, onValue, runTransaction } from "firebase/database";
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
    const counterRef = dbRef(database, `inventory_counters/${fullYear}`);
    
    // Check if counter exists; if not, initialize from existing documents
    const counterSnap = await get(counterRef);
    if (!counterSnap.exists()) {
      const maxFromDocs = await findMaxDocNumber(fullYear);
      await set(counterRef, maxFromDocs);
    }
    
    // Atomically increment the counter using Firebase Transaction
    const result = await runTransaction(counterRef, (currentValue) => {
      return (currentValue || 0) + 1;
    });
    
    if (result.committed) {
      const nextNumber = result.snapshot.val();
      const formattedNumber = String(nextNumber).padStart(4, '0');
      return `${prefix}${formattedNumber}`;
    } else {
      throw new Error('Transaction not committed');
    }
    
  } catch (error) {
    console.error("Error generating next doc no:", error);
    // Fallback: use timestamp-based unique number to avoid collision
    const fullYear = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    return `AI-${fullYear}/T${timestamp}`;
  }
}

/**
 * Scan existing documents to find the maximum document number for a given year.
 * Used to initialize the counter on first use.
 */
async function findMaxDocNumber(fullYear) {
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
  
  return maxNumber;
}
