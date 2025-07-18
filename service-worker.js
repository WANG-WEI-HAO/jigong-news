// frontend/public/service-worker.js

const CACHE_NAME = 'jigong-pwa-cache-v2'; // 如果内容有大变化，可以更新版本号以强制更新缓存
const urlsToCache = [
  './',
  './index.html',
  './posts.json',
  './pwa-notifications.js', // 更新为新的合并后的 JS 文件名
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr',
  './zh-tw.js', 
  './icons/icon-192.png',
  './icons/icon-512.png',
  // 确保你的分享图标也缓存
  './ICON/facebook.png',
  './ICON/instagram.png',
  './ICON/line.png',
  './ICON/link.png'
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
        self.skipWaiting(); // 确保 Service Worker 立即激活
      })
      .catch(error => {
        console.error('[Service Worker] Installation failed:', error);
        throw error; // 抛出错误以防止 Service Worker 注册成功但安装失败
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
      return self.clients.claim(); // 确保 Service Worker 控制所有客户端
    })
    .then(() => {
      console.log('[Service Worker] Activation successful and clients claimed.');
    })
    .catch(error => {
      console.error('[Service Worker] Activation failed:', error);
      // 可以在这里显示一个通知，通知用户 Service Worker 激活失败
      // self.registration.showNotification('Service Worker Error', {
      //   body: '無法完全啟用離線功能和推播通知。',
      //   icon: './icons/icon-192.png'
      // });
      throw error; // 抛出错误以在控制台显示堆栈信息
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('posts.json')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

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
        await cache.put(request, networkResponse.clone());
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
      await cache.put(request, networkResponse.clone());
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
