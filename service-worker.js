// frontend/public/service-worker.js

// **重要提醒：每次您有靜態檔案 (HTML, CSS, JS) 或 Service Worker 本身的大更新時，請修改此版本號！**
// 例如，當您修改 index.html, style.css, pwa-notifications.js 等檔案時，將 v2 改為 v3。
const CACHE_NAME = 'jigong-pwa-cache-v2';
const urlsToCache = [
  './',
  './index.html',
  './posts.json',
  './pwa-notifications.js', // 更新為新的合併後的 JS 文件名
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  './zh-tw.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // 確保你的分享圖示也快取 (假設這些在 ICON 資料夾內，路徑需確認)
  // 如果這些圖示位於 'frontend/public/ICON'，請確保路徑正確
  './ICON/facebook.png',
  './ICON/instagram.png',
  './ICON/line.png',
  './ICON/link.png',
  // 新增 iOS 安裝提示圖示
  './icons/ios加到主畫面icon.jpg',
  './icons/ios分享icon.jpg'
];

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing Service Worker ...', event);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Opened cache and added all URLs.');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[Service Worker] Install complete. Skipping waiting...');
        self.skipWaiting(); // 確保 Service Worker 立即激活，不再等待當前頁面關閉
      })
      .catch(error => {
        console.error('[Service Worker] Installation failed:', error);
        throw error; // 拋出錯誤以防止 Service Worker 註冊成功但安裝失敗
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating Service Worker ....', event);
  const cacheWhitelist = [CACHE_NAME]; // 僅保留當前版本的快取
  event.waitUntil(
    caches.keys().then(cacheNames => {
      console.log('[Service Worker] Found caches:', cacheNames);
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName); // 刪除所有舊版本的快取
          } else {
            console.log(`[Service Worker] Keeping cache: ${cacheName}`);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Old caches cleaned up. Claiming clients...');
      return self.clients.claim(); // 確保 Service Worker 控制所有客戶端，使其立即生效
    })
    .then(() => {
      console.log('[Service Worker] Activation successful and clients claimed.');
    })
    .catch(error => {
      console.error('[Service Worker] Activation failed:', error);
      throw error; // 拋出錯誤以在控制台顯示堆棧信息
    })
  );
});

self.addEventListener('fetch', event => {
  // 對於 posts.json，優先從網路獲取最新數據，並更新快取
  if (event.request.url.includes('posts.json')) {
    event.respondWith(
      fetch(event.request) // 總是優先嘗試從網路獲取最新數據
        .then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache); // 將最新內容快取起來
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request)) // 如果網路失敗，則回傳快取內容
    );
    return;
  }

  // 對於其他資源，嘗試從快取中獲取，否則從網路獲取
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  const data = event.data.json();

  console.log('[Service Worker] Push data:', data);

  const title = data.title || '新通知';
  const options = {
    body: data.body || '您有一條新消息。',
    icon: data.icon || './icons/icon-192.png',
    badge: data.badge || './icons/icon-192.png',
    image: data.image,
    tag: data.tag || 'web-push-notification',
    renotify: data.renotify || true,
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

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
    // 強制從網路獲取 posts.json，不使用快取
    const request = new Request('./posts.json', { cache: 'no-store' });

    const networkResponse = await fetch(request);
    if (!networkResponse.ok) {
      console.error('[Service Worker] 背景同步失敗：無法從網路獲取 posts.json。');
      return;
    }

    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      const networkText = await networkResponse.clone().text();
      const cachedText = await cachedResponse.text();

      if (networkText !== cachedText) {
        console.log('[Service Worker] 背景檢查發現新內容，發送推播通知。');
        await cache.put(request, networkResponse.clone()); // 更新快取
        self.registration.showNotification('濟公報有新內容！', {
          body: '點擊查看最新聖賢語錄。',
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: 'jigongbao-content-update',
          data: {
            url: './index.html?source=periodicsync'
          }
        });
      } else {
        console.log('[Service Worker] 背景同步：內容無更新。');
      }
    } else {
      console.log('[Service Worker] 背景同步：無快取版本，正在快取新內容。');
      await cache.put(request, networkResponse.clone()); // 快取新內容
    }
  } catch (error) {
    console.error('[Service Worker] 背景內容檢查出錯：', error);
  }
}

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close();

  const clickedNotification = event.notification;
  const urlToOpen = clickedNotification.data && clickedNotification.data.url ? clickedNotification.data.url : 'https://wang-wei-hao.github.io/jigong-news/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === new URL(urlToOpen, self.location.origin).href && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});
