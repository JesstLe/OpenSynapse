/**
 * Firebase Admin SDK 初始化
 * 用于服务端签发 custom token 和访问 Firestore
 */

import admin from 'firebase-admin';
import * as fs from 'node:fs';
import * as path from 'node:path';

let firebaseAdmin: typeof admin | null = null;

export function initializeFirebaseAdmin() {
  if (firebaseAdmin) {
    return firebaseAdmin;
  }

  try {
    // 尝试从环境变量读取配置
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (serviceAccountKey) {
      // 从环境变量解析 JSON
      const serviceAccount = JSON.parse(serviceAccountKey);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
    } else {
      // 尝试从本地文件读取（开发环境）
      try {
        const keyPath = path.join(process.cwd(), 'config', 'firebase-service-account.json');
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
      } catch (e) {
        // 如果没有服务账号文件，使用应用默认凭证（ADC）
        // 适用于 Cloud Run、Cloud Functions 等 GCP 环境
        admin.initializeApp({
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
      }
    }

    firebaseAdmin = admin;
    console.log('[Firebase Admin] Initialized successfully');
    return firebaseAdmin;
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed:', error);
    throw error;
  }
}

export function getFirebaseAdmin() {
  if (!firebaseAdmin) {
    return initializeFirebaseAdmin();
  }
  return firebaseAdmin;
}

export function getAuth() {
  return getFirebaseAdmin().auth();
}

export function getFirestore() {
  return getFirebaseAdmin().firestore();
}

/**
 * 创建 Firebase Custom Token
 * 用于第三方登录（微信/QQ）后让前端完成 Firebase 登录
 */
export async function createCustomToken(
  uid: string,
  additionalClaims?: { [key: string]: any }
): Promise<string> {
  const auth = getAuth();
  return await auth.createCustomToken(uid, additionalClaims);
}

/**
 * 验证 Firebase ID Token
 * 用于验证前端请求的合法性
 */
export async function verifyIdToken(idToken: string) {
  const auth = getAuth();
  return await auth.verifyIdToken(idToken);
}

/**
 * 获取或创建用户
 * 用于第三方登录时关联到 Firebase Auth
 */
export async function getOrCreateUser(
  uid: string,
  options: {
    displayName?: string;
    photoURL?: string;
    email?: string;
  }
) {
  const auth = getAuth();
  
  try {
    // 尝试获取现有用户
    return await auth.getUser(uid);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      // 创建新用户
      return await auth.createUser({
        uid,
        displayName: options.displayName,
        photoURL: options.photoURL,
        email: options.email,
      });
    }
    throw error;
  }
}
