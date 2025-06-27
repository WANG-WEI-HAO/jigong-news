const CACHE_NAME = 'jigong-paper-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './posts.json',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  'https://npmcdn.com/flatpickr/dist/l10n/zh-tw.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 安裝 Service Worker
self.addEventListener('install', event => {
  // 執行安裝步驟
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 攔截網路請求並從快取或網路回應
self.addEventListener('fetch', event => {
  // 對於 posts.json，採用網路優先策略，確保使用者重新整理時能看到最新內容
  if (event.request.url.includes('posts.json')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // 如果成功從網路取得，就更新快取
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request)) // 網路失敗時從快取讀取
    );
    return;
  }

  // 其他請求，優先使用快取
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果快取中有，就直接回傳
        return response || fetch(event.request);
      })
  );
});

// 啟用 Service Worker 時，刪除舊的快取
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 處理週期性背景同步事件
self.addEventListener('periodicsync', event => {
  if (event.tag === 'content-check') {
    console.log('執行背景內容檢查...');
    event.waitUntil(checkForUpdatesAndNotify());
  }
});

// 檢查更新並發送通知的函式
async function checkForUpdatesAndNotify() {
  try {
    console.log('背景同步：正在檢查 posts.json 更新...');
    const cache = await caches.open(CACHE_NAME);
    const request = new Request('./posts.json', { cache: 'no-store' }); // 確保從網路獲取

    const networkResponse = await fetch(request);
    if (!networkResponse.ok) {
      console.error('背景同步失敗：無法從網路獲取 posts.json。');
      return;
    }

    const cachedResponse = await cache.match(request);
    const networkResponseForCache = networkResponse.clone();

    if (cachedResponse) {
      const networkText = await networkResponse.text();
      const cachedText = await cachedResponse.text();

      if (networkText !== cachedText) {
        console.log('背景檢查發現新內容，發送推播通知。');
        await cache.put(request, networkResponseForCache); // 更新快取
        self.registration.showNotification('濟公報有新內容！', {
          body: '點擊查看最新聖賢語錄。',
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png', // 用於 Android 通知欄的小圖示
          tag: 'content-update' // 使用標籤讓新通知取代舊的，避免轟炸
        });
      } else {
        console.log('背景同步：內容無更新。');
      }
    } else {
      // 如果沒有快取，表示是第一次同步，直接快取最新版本
      console.log('背景同步：無快取版本，正在快取新內容。');
      await cache.put(request, networkResponseForCache);
    }
  } catch (error) {
    console.error('背景內容檢查出錯：', error);
  }
}

// 處理通知點擊事件
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./index.html'));
});