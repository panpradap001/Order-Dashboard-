import { DOM } from "../utils/dom.js";
import { escapeHTML } from "../utils/helpers.js";
import { listenForUsers, createNewUserWithCloudFunction, deleteUserFromAuth, updateUserRole, toUsername } from "../services/auth.js";
import { state } from "../store/state.js";

export function initUserManagement() {
  if (state.currentUser?.role !== 'admin') return;
  
  // Listen for changes in users
  listenForUsers((users) => {
    renderUsersTable(users);
  });
  
  // Handle role creation/update
  if (DOM.createUserForm) {
    DOM.createUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = DOM.newUserUsername.value.trim();
      const password = DOM.newUserPassword ? DOM.newUserPassword.value : '';
      const role = DOM.newUserRole.value;
      const submitBtn = document.getElementById('save-role-btn');
      
      if (!username || !role) return;

      if (!password || password.length < 6) {
         if (DOM.userMsg) {
             DOM.userMsg.style.color = '#ef4444';
             DOM.userMsg.textContent = 'กรุณาระบุรหัสผ่านอย่างน้อย 6 ตัวอักษร (สำหรับการสร้างบัญชีใหม่)';
         }
         return;
      }

      if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'กำลังบันทึก...';
      }
      
      if (DOM.userMsg) {
        DOM.userMsg.style.color = '#3b82f6';
        DOM.userMsg.textContent = 'กำลังประมวลผลบนเซิร์ฟเวอร์...';
      }
      
      const result = await createNewUserWithCloudFunction(username, password, role);
      
      if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'บันทึกผู้ใช้';
      }

      if (DOM.userMsg) {
        if (result.success) {
          DOM.userMsg.style.color = '#10b981'; 
          DOM.userMsg.textContent = 'สร้างบัญชีและกำหนดสิทธิ์สำเร็จ!';
          DOM.newUserUsername.value = '';
          if (DOM.newUserPassword) DOM.newUserPassword.value = '';
          setTimeout(() => DOM.userMsg.textContent = '', 4000);
        } else {
          DOM.userMsg.style.color = '#ef4444'; 
          let errorMsg = result.data?.message || result.error;
          if (errorMsg && (errorMsg.includes('already-exists') || errorMsg.includes('already-in-use'))) {
            errorMsg = 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว';
          }
          DOM.userMsg.textContent = 'เกิดข้อผิดพลาด: ' + errorMsg;
        }
      }
    });
  }
}

function renderUsersTable(users) {
  if (!DOM.usersTableBody) return;
  
  DOM.usersTableBody.innerHTML = '';
  
  if (users.length === 0) {
    DOM.usersTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">ไม่มีข้อมูลผู้ใช้งาน</td></tr>';
    return;
  }
  
  let html = '';
  users.forEach(user => {
    const isSelf = user.uid === state.currentUser?.uid;
    const displayUsername = escapeHTML(user.username || toUsername(user.email) || user.uid);
    
    html += `
      <tr>
        <td style="width: 40%; text-align: left; font-weight: 500;">
          ${displayUsername} 
          ${isSelf ? '<span style="font-size: 0.75rem; color: var(--primary-color, #3b82f6); font-weight: 600; margin-left: 6px;">(คุณ)</span>' : ''}
        </td>
        <td style="width: 40%; text-align: left;">
          <select class="role-select-dropdown search-input" data-uid="${escapeHTML(user.uid)}" ${isSelf ? 'disabled title="ไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้"' : ''} style="padding: 0.35rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-color); background-color: var(--bg-color); color: var(--text-primary); font-size: 0.85rem; cursor: ${isSelf ? 'not-allowed' : 'pointer'}; font-weight: 500; transition: all 0.2s; width: auto; max-width: 100%;">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User (ผู้ใช้ทั่วไป)</option>
            <option value="sales" ${user.role === 'sales' ? 'selected' : ''}>Sales (พนักงานฝ่ายขาย)</option>
            <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>Employee (พนักงาน)</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin (ผู้ดูแลระบบ)</option>
          </select>
        </td>
        <td style="width: 20%; text-align: center;">
           <button class="delete-role-btn" data-uid="${escapeHTML(user.uid)}" ${isSelf ? 'disabled style="background: none; border: none; color: #9ca3af; cursor: not-allowed; font-size: 0.85rem;" title="ไม่สามารถลบบัญชีตัวเองได้"' : 'style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.85rem; text-decoration: underline; padding: 0;"'}>ลบบัญชีผู้ใช้</button>
        </td>
      </tr>
    `;
  });
  
  DOM.usersTableBody.innerHTML = html;
  
  const deleteBtns = DOM.usersTableBody.querySelectorAll('.delete-role-btn');
  deleteBtns.forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', async (e) => {
      const uid = e.target.getAttribute('data-uid');
      if (confirm('คุณต้องการลบบัญชีและสิทธิ์ของผู้ใช้นี้ออกจากระบบอย่างถาวร ใช่หรือไม่?')) {
        const originalText = e.target.textContent;
        e.target.textContent = 'กำลังลบ...';
        const result = await deleteUserFromAuth(uid);
        if (!result.success) {
            alert('ลบไม่สำเร็จ: ' + (result.data?.message || result.error));
            e.target.textContent = originalText;
        }
      }
    });
  });

  const roleSelects = DOM.usersTableBody.querySelectorAll('.role-select-dropdown');
  roleSelects.forEach(select => {
    if (select.disabled) return;
    let prevValue = select.value;
    select.addEventListener('focus', () => { prevValue = select.value; });
    select.addEventListener('change', async (e) => {
      const uid = e.target.getAttribute('data-uid');
      const newRole = e.target.value;
      const roleNameThai = newRole === 'admin' ? 'Admin (ผู้ดูแลระบบ)' : (newRole === 'sales' ? 'Sales (พนักงานฝ่ายขาย)' : 'Employee (พนักงาน)');
      
      if (!confirm(`คุณต้องการเปลี่ยนสิทธิ์ผู้ใช้งานนี้เป็น "${roleNameThai}" ใช่หรือไม่?`)) {
        select.value = prevValue;
        return;
      }

      select.disabled = true;
      select.style.opacity = '0.6';
      
      const result = await updateUserRole(uid, newRole);
      
      if (!result.success) {
        alert('อัปเดตสิทธิ์ไม่สำเร็จ: ' + (result.data?.message || result.error));
        select.value = prevValue;
        select.style.borderColor = '#ef4444';
        setTimeout(() => { select.style.borderColor = 'var(--border-color)'; }, 1500);
      } else {
        prevValue = newRole;
        select.style.borderColor = '#10b981';
        select.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        setTimeout(() => { 
          select.style.borderColor = 'var(--border-color)';
          select.style.backgroundColor = 'var(--bg-color)'; 
        }, 1500);
      }
      select.disabled = false;
      select.style.opacity = '1';
    });
  });
}
