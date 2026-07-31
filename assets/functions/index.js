const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

// Middleware to check admin role
async function checkAdminStatus(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "ต้องเข้าสู่ระบบก่อนดำเนินการ");
    }

    const callerUid = request.auth.uid;
    const callerSnap = await admin.database().ref(`users/${callerUid}`).once("value");
    
    if (!callerSnap.exists() || callerSnap.val().role !== "admin") {
        throw new HttpsError("permission-denied", "เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถทำรายการนี้ได้");
    }
}

// Create User Function
exports.createUser = onCall(async (request) => {
    await checkAdminStatus(request);

    const { email, username, password, role } = request.data;

    if (!email || !password || !role) {
        throw new HttpsError("invalid-argument", "กรุณาระบุ ชื่อผู้ใช้งาน/อีเมล, รหัสผ่าน และระดับสิทธิ์ให้ครบถ้วน");
    }

    const VALID_ROLES = ['admin', 'sales', 'employee']; // Define valid roles
    if (!VALID_ROLES.includes(role)) {
        throw new HttpsError("invalid-argument", "ระดับสิทธิ์ไม่ถูกต้อง ต้องเป็น admin, sales หรือ employee เท่านั้น");
    }

    const finalUsername = username || email.split('@')[0];

    try {
        // 1. Create user in Firebase Auth
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
        });

        // 2. Store role and username in Realtime Database
        await admin.database().ref(`users/${userRecord.uid}`).set({
            email: email,
            username: finalUsername,
            role: role,
            password: password,
            createdAt: admin.database.ServerValue.TIMESTAMP
        });

        return { success: true, message: `สร้างผู้ใช้งาน ${finalUsername} สำเร็จ`, uid: userRecord.uid };
    } catch (error) {
        console.error("Error creating user:", error);
        throw new HttpsError("internal", error.message);
    }
});

// Delete User Function
exports.deleteUser = onCall(async (request) => {
    await checkAdminStatus(request);

    const { uid } = request.data;

    if (!uid) {
        throw new HttpsError("invalid-argument", "ไม่พบ UID ของผู้ใช้ที่ต้องการลบ");
    }

    try {
        // Prevent self-deletion
        if (uid === request.auth.uid) {
             throw new HttpsError("invalid-argument", "ไม่สามารถลบบัญชีตัวเองได้");
        }

        // 1. Delete from Firebase Auth
        await admin.auth().deleteUser(uid);

        // 2. Delete from Realtime Database
        await admin.database().ref(`users/${uid}`).remove();

        return { success: true, message: `ลบผู้ใช้งานรหัส ${uid} สำเร็จ` };
    } catch (error) {
        console.error("Error deleting user:", error);
        throw new HttpsError("internal", error.message);
    }
});

// Update User Role Function
exports.updateUserRole = onCall(async (request) => {
    await checkAdminStatus(request);

    const { uid, role } = request.data;

    if (!uid || !role) {
        throw new HttpsError("invalid-argument", "กรุณาระบุ UID และระดับสิทธิ์ให้ครบถ้วน");
    }

    const VALID_ROLES = ['admin', 'sales', 'employee'];
    if (!VALID_ROLES.includes(role)) {
        throw new HttpsError("invalid-argument", "ระดับสิทธิ์ไม่ถูกต้อง ต้องเป็น admin, sales หรือ employee เท่านั้น");
    }

    if (uid === request.auth.uid && role !== 'admin') {
        throw new HttpsError("invalid-argument", "ไม่สามารถปรับลดสิทธิ์ Admin ของตัวเองได้");
    }

    try {
        await admin.database().ref(`users/${uid}/role`).set(role);
        return { success: true, message: `อัปเดตสิทธิ์ผู้ใช้เป็น ${role} สำเร็จ` };
    } catch (error) {
        console.error("Error updating user role:", error);
        throw new HttpsError("internal", error.message);
    }
});

// Update Username Function
exports.updateUsername = onCall(async (request) => {
    await checkAdminStatus(request);

    const { uid, username } = request.data;

    if (!uid || !username) {
        throw new HttpsError("invalid-argument", "กรุณาระบุ UID และชื่อผู้ใช้งานใหม่ให้ครบถ้วน");
    }

    try {
        await admin.database().ref(`users/${uid}/username`).set(username);
        return { success: true, message: `อัปเดตชื่อผู้ใช้งานเป็น ${username} สำเร็จ` };
    } catch (error) {
        console.error("Error updating username:", error);
        throw new HttpsError("internal", error.message);
    }
});
