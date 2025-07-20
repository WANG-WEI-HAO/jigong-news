// frontend/public/service-worker.js

// === PWA 設定常數 (與 pwa-notifications.js 保持一致) ===
// 如果你的 PWA 部署在子路徑下 (例如: https://yourusername.github.io/your-repo-name/)
// 則 PWA_SUB_PATH 應該是 /your-repo-name。如果直接部署在根目錄，則為 '' (空字串)。
// !!! 本地開發時，請將此處設為 '' (空字串) !!!
// !!! 部署到 GitHub Pages 等子路徑時，請設為 '/your-repo-name'，例如 '/jigong-news' !!!
const PWA_SUB_PATH = "/jigong-news"; // <--- 已修改為本地開發的正確路徑！
// 部署到 GitHub Pages 時，再將其改回 '/jigong-news'

// !!! 請在這裡替換為你的 Render 後端實際 URL (與 pwa-notifications.js 保持一致) !!!
const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com';

// 每次更新預緩存資源時，請務必更新版本號以強制 Service Worker 更新
// 緩存版本號必須不同於舊的，否則 Service Worker 不會重新安裝並更新緩存
const CACHE_NAME = 'jigong-pwa-cache-v18'; // <--- 已更新版本號以強制更新

// 需要預緩存的資源列表
// 確保所有本地資源的路徑都以 PWA_SUB_PATH 開頭
const urlsToCache = [
  PWA_SUB_PATH + '/',              // 應用程式的根路徑 (例如: /)
  PWA_SUB_PATH + '/index.html',    // 顯式指定 index.html
  PWA_SUB_PATH + '/manifest.json', // manifest.json 也應被緩存
  PWA_SUB_PATH + '/posts.json',
  PWA_SUB_PATH + '/pwa-notifications.js',
  PWA_SUB_PATH + '/service-worker.js', // Service Worker 本身也應緩存
  PWA_SUB_PATH + '/zh-tw.js',
  PWA_SUB_PATH + '/icons/icon-192.png',
  PWA_SUB_PATH + '/icons/icon-512.png',
  PWA_SUB_PATH + '/icons/濟公報logo.png',
  PWA_SUB_PATH + '/icons/ios分享icon.jpg',
  PWA_SUB_PATH + '/icons/ios加到主畫面icon.jpg',
  PWA_SUB_PATH + '/ICON/facebook.png', // 確認 ICON 是大寫還是小寫，與實際檔案名稱匹配
  PWA_SUB_PATH + '/ICON/line.png',
  PWA_SUB_PATH + '/ICON/link.png',
  // 外部 CDN 資源直接使用完整 URL
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.js', 
];

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing Service Worker ...', event);
  event.waitUntil(
    (async () => { // 使用一個 async IIFE 來處理異步操作，以便使用 await
      const cache = await caches.open(CACHE_NAME);
      console.log(`[Service Worker] Opened cache: ${CACHE_NAME}. Starting to add URLs.`);

      // 遍歷所有要緩存的 URL
      for (const url of urlsToCache) {
        try {
          // 嘗試逐個緩存每個 URL
          const response = await fetch(url);
          // 對於同源請求，檢查響應是否成功 (例如 200 OK)
          // 對於跨域的 opaque 響應 (response.type === 'opaque')，response.ok 總是 false，但它們仍然可以被緩存
          if (!response.ok && response.type === 'basic') {
            // 如果是同源請求且響應不成功（例如 404, 500），拋出錯誤
            throw new Error(`Failed to fetch ${url}: Status ${response.status} ${response.statusText}`);
          }
          // 重要：將 response 複製一份放入緩存，因為原始的 response 可能會被消費掉
          await cache.put(url, response.clone()); 
          console.log(`[Service Worker] Successfully cached: ${url}`);
        } catch (error) {
          // 捕獲單個 URL 緩存失敗的錯誤，記錄下來。
          // 如果任何一個預緩存失敗，整個 Service Worker 安裝就會失敗。
          console.error(`[Service Worker] Failed to cache ${url}:`, error);
          throw error; // 重新拋出錯誤以確保 Promise 被拒絕，Service Worker 不會被激活
        }
      }
      console.log('[Service Worker] All specified URLs attempted to be cached successfully.');
      console.log('[Service Worker] Install complete. Skipping waiting...');
      self.skipWaiting(); // 強制新的 Service Worker 在安裝後立即激活
    })().catch(error => {
      console.error('[Service Worker] Installation failed overall. Please check logs for failed URL:', error);
      // 您可以選擇在這裡顯示一個通知，通知用戶 Service Worker 安裝失敗
      // self.registration.showNotification('Service Worker Error', {
      //   body: '無法完全啟用離線功能和推播通知。請檢查網絡或重新載入。',
      //   icon: PWA_SUB_PATH + '/icons/icon-192.png'
      // });
      throw error; // 重新拋出錯誤以確保 Promise 被拒絕，Service Worker 不會被激活
    })
  );
});

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating Service Worker ....', event);
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      console.log('[Service Worker] Found caches:', cacheNames);
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          } else {
            console.log(`[Service Worker] Keeping cache: ${cacheName}`);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Old caches cleaned up. Claiming clients...');
      return self.clients.claim(); // 確保 Service Worker 控制所有客户端
    })
    .then(() => {
      console.log('[Service Worker] Activation successful and clients claimed.');
    })
    .catch(error => {
      console.error('[Service Worker] Activation failed:', error);
    })
  );
});

self.addEventListener('fetch', event => {
  // 檢查是否是後端 API 請求，如果是則直接從網路獲取，不緩存
  if (event.request.url.startsWith(BACKEND_BASE_URL)) {
    // console.log(`[Service Worker] Fetching from backend: ${event.request.url}`);
    return event.respondWith(fetch(event.request));
  }

  // 對於 posts.json，始終嘗試從網路獲取最新版本，失敗則回退到緩存
  const postsJsonFullPath = new URL(`${PWA_SUB_PATH}/posts.json`, self.location.origin).href;
  if (event.request.url === postsJsonFullPath) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // 如果網路請求成功，則更新緩存
          if (networkResponse && networkResponse.ok) { 
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // 如果網路請求失敗，則嘗試從緩存中獲取
          console.warn('[Service Worker] Network for posts.json failed, falling back to cache.');
          return caches.match(event.request);
        })
    );
    return;
  }

  // 對於其他資源，優先從緩存中獲取，如果沒有則從網路獲取
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // console.log(`[Service Worker] Serving from cache: ${event.request.url}`);
          return response;
        }
        // console.log(`[Service Worker] Fetching from network: ${event.request.url}`);
        return fetch(event.request).then(networkResponse => {
          // 如果網路響應有效，則緩存它以供將來使用
          // 對於同源請求，檢查 response.ok 和 status 200
          // 對於跨域的 opaque 響應，只需要檢查 networkResponse 是否存在即可緩存
          const isSameOrigin = new URL(event.request.url).origin === self.location.origin;
          if (networkResponse && (networkResponse.ok || !isSameOrigin)) { 
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(error => {
          console.error(`[Service Worker] Network fetch failed for ${event.request.url}:`, error);
          // 在這裡可以返回一個離線頁面或其他錯誤響應
          // 例如：return caches.match(PWA_SUB_PATH + '/offline.html');
        });
      })
  );
});

// === 推播通知相關事件處理 ===

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  const data = event.data ? event.data.json() : {};

  console.log('[Service Worker] Push data:', data);

  const title = data.title || '濟公報推播通知';
  const body = data.body || '您有新的濟公報更新，請點擊查看！';
  // 確保 icon 和 badge 使用 PWA_SUB_PATH
  const icon = data.icon || PWA_SUB_PATH + '/icons/icon-192.png';
  const badge = data.badge || PWA_SUB_PATH + '/icons/濟公報logo.png'; // 針對 Android 的徽章圖標
  const url = data.url || PWA_SUB_PATH + '/'; // 點擊通知後打開的 URL

  const options = {
    body: body,
    icon: icon,
    badge: badge,
    image: data.image, // 如果推播內容包含圖片
    tag: data.tag || 'jigong-news-push', // 用於控制通知的唯一性
    renotify: data.renotify || true, // 允許重新顯示相同的通知標籤
    vibrate: [200, 100, 200], // 震動模式
    data: { // 將 URL 儲存到 data 中，方便點擊事件使用
      url: url,
      // 其他您可能需要的數據
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close(); // 關閉通知

  const urlToOpen = (event.notification.data && event.notification.data.url) || PWA_SUB_PATH + '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        // 檢查是否有已經打開的窗口且 URL 匹配，則聚焦該窗口
        // 使用 new URL() 構建完整的 URL 進行比較，處理 PWA_SUB_PATH 的情況
        // 比較 pathname 確保即使是不同的origin (例如http和https) 也能匹配相對路徑
        if (new URL(client.url).pathname === new URL(urlToOpen, self.location.origin).pathname && 'focus' in client) {
          console.log(`[Service Worker] Focusing existing window: ${client.url}`);
          return client.focus();
        }
      }
      // 如果沒有匹配的窗口，或者 clients.openWindow 可用，則打開新窗口
      if (self.clients.openWindow) {
        console.log(`[Service Worker] Opening new window: ${urlToOpen}`);
        return self.clients.openWindow(urlToOpen);
      }
      return null;
    })
  );
});

// === 接收前端發送的消息 (用於歡迎推播) ===
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SEND_WELCOME_NOTIFICATION') {
    console.log('[Service Worker] Received SEND_WELCOME_NOTIFICATION message from frontend.');
    const { title, body } = event.data;
    
    const icon = PWA_SUB_PATH + '/icons/icon-192.png';
    const badge = PWA_SUB_PATH + '/icons/濟公報logo.png';
    const url = PWA_SUB_PATH + '/';

    self.registration.showNotification(title, {
      body: body,
      icon: icon,
      badge: badge,
      tag: 'welcome-notification', // 使用 tag 確保只顯示一個歡迎通知
      renotify: false, // 再次發送相同的 tag 時不會觸發重新通知，避免重複顯示
      data: { url: url }
    });
  }
});

// === 後台定期同步 (Periodic Background Sync) ===
self.addEventListener('periodicsync', event => {
  if (event.tag === 'content-check') {
    console.log('[Service Worker] 執行背景內容檢查...');
    event.waitUntil(checkForUpdatesAndNotify());
  }
});

async function checkForUpdatesAndNotify() {
  try {
    console.log('[Service Worker] 背景同步：正在檢查 posts.json 更新...');
    const cache = await caches.open(CACHE_NAME);
    // 構建正確的 posts.json URL，無論 PWA 部署在根目錄還是子路徑
    const postsJsonFullPath = new URL(`${PWA_SUB_PATH}/posts.json`, self.location.origin).href;

    // 總是嘗試從網路獲取最新 posts.json
    const networkResponse = await fetch(postsJsonFullPath, { cache: 'no-store' }); // 確保獲取最新
    if (!networkResponse.ok) {
      console.error('[Service Worker] 背景同步失敗：無法從網路獲取 posts.json。', networkResponse.status, networkResponse.statusText);
      return;
    }

    // 獲取當前緩存中的 posts.json
    const cachedResponse = await cache.match(postsJsonFullPath);

    if (cachedResponse) {
      const networkText = await networkResponse.clone().text();
      const cachedText = await cachedResponse.text();

      if (networkText !== cachedText) {
        console.log('[Service Worker] 背景檢查發現新內容，發送推播通知。');
        await cache.put(postsJsonFullPath, networkResponse.clone()); // 更新緩存中的 posts.json
        self.registration.showNotification('濟公報有新內容！', {
          body: '點擊查看最新聖賢語錄。',
          icon: PWA_SUB_PATH + '/icons/icon-192.png',
          badge: PWA_SUB_PATH + '/icons/濟公報logo.png',
          tag: 'jigongbao-content-update', // 使用 tag 確保重複內容只顯示一個通知
          data: {
            url: PWA_SUB_PATH + '/index.html?source=periodicsync' // 點擊通知打開的頁面
          }
        });
      } else {
        console.log('[Service Worker] 背景同步：內容無更新。');
      }
    } else {
      console.log('[Service Worker] 背景同步：無快取版本，正在快取新內容。');
      await cache.put(postsJsonFullPath, networkResponse.clone()); // 首次緩存 posts.json
    }
  } catch (error) {
    console.error('[Service Worker] 背景內容檢查出錯：', error);
    // 可以考慮在這裡發送一個靜默通知給用戶，表示同步失敗，或者記錄錯誤到日誌服務
  }
}