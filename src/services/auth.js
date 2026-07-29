import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { ref, get, onValue } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { auth, database, functions } from "../config/firebase.js";
import { state } from "../store/state.js";
import { DOM } from "../utils/dom.js";

// Username/Domain helpers
const DOMAIN_NAME = import.meta.env.VITE_DOMAIN || import.meta.env.DOMAIN || 'company.tmetal';

export function toEmail(username) {
  if (!username) return '';
  if (username.includes('@')) return username; // Fallback if full email is passed
  return `${username}@${DOMAIN_NAME}`;
}

export function toUsername(email) {
  if (!email) return '';
  const suffix = `@${DOMAIN_NAME}`;
  if (email.endsWith(suffix)) {
    return email.slice(0, -suffix.length);
  }
  return email.split('@')[0] || email;
}

// Login
export async function login(usernameOrEmail, password) {
  try {
    const email = toEmail(usernameOrEmail);
    await signInWithEmailAndPassword(auth, email, password);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.code };
  }
}

// Logout
export async function logout() {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.code };
  }
}

// Initialize Auth State Listener
export function initAuth(onLoginSuccess) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Fetch role from DB
      const userRef = ref(database, `users/${user.uid}`);
      const snapshot = await get(userRef);
      let role = 'employee'; // default fallback
      let usernameFromDb = null;
      
      if (snapshot.exists()) {
        const val = snapshot.val();
        if (val.role) role = val.role;
        if (val.username) usernameFromDb = val.username;
      }
      
      const displayUsername = usernameFromDb || toUsername(user.email || user.uid);

      state.currentUser = {
        uid: user.uid,
        email: user.email,
        username: displayUsername,
        role: role
      };
      
      // Update User Profile UI
      const profileText = displayUsername;
      if (DOM.profileEmail) {
        DOM.profileEmail.textContent = profileText;
        DOM.profileEmail.title = profileText;
      }
      if (DOM.settingsProfileEmail) {
        DOM.settingsProfileEmail.textContent = profileText;
      }
      
      const avatarChar = profileText ? profileText.charAt(0).toUpperCase() : 'U';
      if (DOM.profileAvatarText) {
        DOM.profileAvatarText.textContent = avatarChar;
      }
      if (DOM.settingsProfileAvatar) {
        DOM.settingsProfileAvatar.textContent = avatarChar;
      }
      
      if (DOM.profileRole) {
        let roleText = 'พนักงาน';
        if (role === 'admin') roleText = 'ผู้ดูแลระบบ';
        else if (role === 'sales') roleText = 'พนักงานฝ่ายขาย';
        DOM.profileRole.textContent = roleText;
        if (DOM.settingsProfileRole) DOM.settingsProfileRole.textContent = roleText;
      }
      
      // Update UI displays
      if (DOM.loginScreen) DOM.loginScreen.style.display = 'none';
      if (DOM.appLayout) DOM.appLayout.style.display = 'flex';
      
      updateUIForRole();
      
      if (onLoginSuccess) onLoginSuccess();
      
    } else {
      state.currentUser = null;
      if (DOM.loginScreen) DOM.loginScreen.style.display = 'flex';
      if (DOM.appLayout) DOM.appLayout.style.display = 'none';
    }
  });
}

function updateUIForRole() {
  const role = state.currentUser?.role;
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    const view = item.getAttribute('data-view');
    item.style.display = 'flex'; // Reset to show
    
    if (role === 'admin') {
      // Admins see everything
    } else if (role === 'sales') {
      if (view !== 'view-dashboard' && view !== 'view-store' && view !== 'view-products' && view !== 'view-settings') item.style.display = 'none';
    } else {
      // Default (employee)
      if (view !== 'view-dashboard' && view !== 'view-settings') item.style.display = 'none';
    }
  });
  
  // Hide product management buttons for non-admins
  const addProductBtn = document.getElementById('add-product-btn');
  const importExcelBtn = document.getElementById('import-excel-btn');
  if (role !== 'admin') {
    if (addProductBtn) addProductBtn.style.display = 'none';
    if (importExcelBtn) importExcelBtn.style.display = 'none';
  } else {
    if (addProductBtn) addProductBtn.style.display = 'block';
    if (importExcelBtn) importExcelBtn.style.display = 'block';
  }
  
  // Safety fallback: switch view to dashboard if currently on a forbidden view
  if (role !== 'admin') {
    if (DOM.viewSections) {
       DOM.viewSections.forEach(sec => sec.style.display = 'none');
       const defaultView = document.getElementById('view-dashboard');
       if (defaultView) defaultView.style.display = 'block';
    }
    
    // reset active class on nav
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-view') === 'view-dashboard') item.classList.add('active');
    });
  }
}

// Call Cloud Functions
export async function createNewUserWithCloudFunction(usernameOrEmail, password, role) {
  try {
    const email = toEmail(usernameOrEmail);
    const username = toUsername(email);
    const createUserFn = httpsCallable(functions, 'createUser');
    const result = await createUserFn({ email, username, password, role });
    return { success: true, data: result.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteUserFromAuth(uid) {
  try {
    const deleteUserFn = httpsCallable(functions, 'deleteUser');
    const result = await deleteUserFn({ uid });
    return { success: true, data: result.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateUserRole(uid, newRole) {
  try {
    const updateRoleFn = httpsCallable(functions, 'updateUserRole');
    const result = await updateRoleFn({ uid, role: newRole });
    return { success: true, data: result.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Listen for users updates (for User Management Table)
export function listenForUsers(callback) {
  const usersRef = ref(database, 'users');
  onValue(usersRef, (snapshot) => {
    const users = [];
    snapshot.forEach((childSnap) => {
      const val = childSnap.val();
      users.push({
        uid: childSnap.key,
        ...val,
        username: val.username || toUsername(val.email || childSnap.key)
      });
    });
    callback(users);
  });
}
