// jigongbao-pwa/frontend/public/pwa-notifications.js (最新修改版，完整 PWA 功能)

// !!! 請在這裡替換為你的 Render 後端實際 URL !!!
const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com/'; // <-- 替換這個！

const subscribeButton = document.getElementById('subscribe-btn');
let swRegistration = null;

// --- 新增 PWA 安装相关变量和 DOM 元素 ---
let deferredPrompt; // 用于保存 beforeinstallprompt 事件
const installAppModal = document.getElementById('installAppModal'); // 确保这个 ID 存在于 index.html
const installAppBtn = document.getElementById('installAppBtn');   // 确保这个 ID 存在于 index.html
const cancelInstallBtn = document.getElementById('cancelInstallBtn'); // 确保这个 ID 存在于 index.html


// --- 辅助函数：检测PWA是否已安装 ---
function isPWAInstalled() {
    // 检查 display-mode 是否为 standalone, fullscreen, 或 minimal-ui
    // 或者检查 navigator.standalone (iOS Safari)
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches) {
        return true;
    }
    // 针对 iOS Safari "添加到主屏幕" 后的行为
    if (navigator.standalone) {
        return true;
    }
    return false;
}

// --- 辅助函数：检测沙箱或iframe环境 ---
function isInIframe() {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

function isSandboxed() {
    return isInIframe(); // 简化判断：如果在 iframe 里就认为是沙箱
}

// 辅助函数：将 Base64 字符串转换为 Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// 更新 UI 状态（按钮文本和可用性）
function updateNotificationUI(isSubscribed, permissionState, isSandboxedEnvironment = false) {
    if (isSandboxedEnvironment) {
        subscribeButton.textContent = '➡️ 進入濟公報開啟通知';
        subscribeButton.disabled = false;
        subscribeButton.style.backgroundColor = '#6c757d'; // 灰色
        subscribeButton.title = '您正在受限環境中。請點擊前往完整網站以啟用通知功能。';
        
        subscribeButton.onclick = () => {
            const pwaDirectUrl = "https://wang-wei-hao.github.io/jigong-news/?openExternalBrowser=1"; 
            window.open(pwaDirectUrl, '_blank');
        };
        return;
    }
    
    // 确保按钮点击事件是订阅/取消订阅逻辑，而不是跳转
    // 移除可能存在的旧的onclick属性赋值
    subscribeButton.onclick = null; 
    // 移除所有旧的事件监听器，避免重复添加，并重新添加
    // 为了防止重复添加，可以移除所有旧的监听器再添加
    subscribeButton.removeEventListener('click', handleSubscribeButtonClick); 
    subscribeButton.addEventListener('click', handleSubscribeButtonClick);

    if (permissionState === 'denied') {
        subscribeButton.textContent = '🚫 通知已拒絕';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#dc3545';
        subscribeButton.title = '請在瀏覽器設定中啟用通知權限。';
    } else if (isSubscribed) {
        subscribeButton.textContent = '🔕 關閉通知';
        subscribeButton.disabled = false;
        subscribeButton.style.backgroundColor = '#6c757d';
        subscribeButton.title = '點擊以取消訂閱推播通知。';
    } else {
        subscribeButton.textContent = '🔔 開啟通知';
        subscribeButton.disabled = false;
        subscribeButton.style.backgroundColor = '#007bff';
        subscribeButton.title = '點擊以訂閱每日推播通知。';
    }
}

// 检查订阅状态并更新 UI
async function checkSubscriptionAndUI() {
    if (isSandboxed()) {
        updateNotificationUI(false, 'default', true);
        console.warn('PWA 運行於受限沙箱環境中，通知功能可能受限。');
        return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        updateNotificationUI(false, 'not-supported');
        subscribeButton.textContent = '瀏覽器不支持通知';
        subscribeButton.title = '您的瀏覽器不支持 Service Worker 或推播通知。';
        return;
    }

    try {
        swRegistration = await navigator.serviceWorker.ready;
        const subscription = await swRegistration.pushManager.getSubscription();
        const permissionState = Notification.permission;
        updateNotificationUI(!!subscription, permissionState);
    } catch (error) {
        console.error('檢查訂閱狀態時出錯或Service Worker未準備好:', error);
        updateNotificationUI(false, 'error'); // 使用 'error' 状态来表示 Service Worker 启动问题
        subscribeButton.textContent = '通知功能錯誤';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#dc3545';
        subscribeButton.title = '通知功能啟動失敗，請重新載入頁面或檢查瀏覽器設定。';
    }
}

// 订阅通知的逻辑 (subscribeUser, unsubscribeUser 保持不变)
async function subscribeUser() {
    if (!swRegistration) {
        alert('Service Worker 尚未準備好，無法訂閱。請重新載入頁面。');
        return;
    }

    const confirmSubscribe = confirm('您確定要訂閱每日濟公報推播通知嗎？');
    if (!confirmSubscribe) {
        updateNotificationUI(false, Notification.permission);
        return;
    }

    subscribeButton.disabled = true;
    subscribeButton.textContent = '正在請求權限...';
    subscribeButton.style.backgroundColor = '#ffc107';

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        console.warn('用戶拒絕了通知權限。');
        alert('您已拒絕通知權限。若要訂閱，請至瀏覽器設定中手動開啟。');
        updateNotificationUI(false, permission);
        return;
    }

    subscribeButton.textContent = '正在訂閱...';
    subscribeButton.style.backgroundColor = '#ffc107';

    try {
        const vapidPublicKeyResponse = await fetch(`${BACKEND_BASE_URL}/api/vapid-public-key`);
        if (!vapidPublicKeyResponse.ok) {
            throw new Error(`無法獲取 VAPID 公鑰: ${vapidPublicKeyResponse.statusText}`);
        }
        const VAPID_PUBLIC_KEY = await vapidPublicKeyResponse.text();
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });

        console.log('Push Subscription:', subscription);

        const response = await fetch(`${BACKEND_BASE_URL}/api/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscription)
        });

        if (response.ok) {
            console.log('訂閱成功並發送到後端。');
            alert('您已成功訂閱每日濟公報推播通知！');
            updateNotificationUI(true, Notification.permission);
            if ('periodicSync' in swRegistration) {
                try {
                    await swRegistration.periodicSync.register('content-check', {
                        minInterval: 24 * 60 * 60 * 1000
                    });
                    console.log('Periodic background sync registered successfully.');
                } catch (e) {
                    console.warn('Periodic background sync registration failed:', e);
                }
            }
        } else {
            const errorText = await response.text();
            console.error('發送訂閱信息到後端失敗:', response.status, errorText);
            alert(`訂閱失敗: ${errorText || '未知錯誤'}`);
            await subscription.unsubscribe();
        }
    } catch (error) {
        console.error('訂閱失敗:', error);
        alert(`訂閱失敗: ${error.message}`);
    } finally {
        checkSubscriptionAndUI();
    }
}

async function unsubscribeUser() {
    if (!swRegistration) {
        alert('Service Worker 尚未準備好，無法取消訂閱。請重新載入頁面。');
        return;
    }

    const confirmUnsubscribe = confirm('您確定要取消訂閱濟公報推播通知嗎？');
    if (!confirmUnsubscribe) {
        updateNotificationUI(true, Notification.permission);
        return;
    }

    subscribeButton.disabled = true;
    subscribeButton.textContent = '正在取消訂閱...';
    subscribeButton.style.backgroundColor = '#ffc107';

    try {
        const subscription = await swRegistration.pushManager.getSubscription();

        if (subscription) {
            const response = await fetch(`${BACKEND_BASE_URL}/api/unsubscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('發送取消訂閱信息到後端失敗:', response.status, errorText);
                alert(`取消訂閱失敗: ${errorText || '未知錯誤'}`);
                return;
            }

            await subscription.unsubscribe();
            console.log('Push Subscription Unsubscribed.');
            alert('您已成功取消訂閱濟公報推播通知！');
            updateNotificationUI(false, Notification.permission);

            if ('periodicSync' in swRegistration) {
                try {
                    await swRegistration.periodicSync.unregister('content-check');
                    console.log('Periodic background sync unregistration successfully.');
                } catch (e) {
                    console.warn('Periodic background sync unregistration failed:', e);
                }
            }
        } else {
            console.log('您當前沒有訂閱。');
            updateNotificationUI(false, Notification.permission);
        }
    } catch (error) {
        console.error('取消訂閱失敗:', error);
        alert(`取消訂閱失敗: ${error.message}`);
    } finally {
        checkSubscriptionAndUI();
    }
}

// 订阅/取消订阅按钮点击的统一处理函数
async function handleSubscribeButtonClick() {
    const currentSubscription = await swRegistration.pushManager.getSubscription();
    if (currentSubscription) {
        unsubscribeUser();
    } else {
        subscribeUser();
    }
}

// 首次绑定事件，确保 DOM 元素已加载
document.addEventListener('DOMContentLoaded', () => {
    // 确保按钮元素存在，并且只绑定一次
    if (subscribeButton) {
        // updateNotificationUI 内部会负责 addEventListener，这里不需要重复添加
    }

    // --- PWA 安装逻辑 ---
    // 如果是 PWA 已安装模式，则不显示安装提示，直接初始化通知功能
    if (isPWAInstalled()) {
        console.log('PWA 已安裝，不顯示安裝提示。');
        initializeNotificationFeatures(); // 即使已安装，通知功能也要正常
        return; // 已安装则不再执行下面的 beforeinstallprompt 监听和沙箱检查
    }

    // 如果不在沙箱，且未安装 PWA，则监听 beforeinstallprompt 事件
    if (!isSandboxed()) {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            console.log('beforeinstallprompt 事件已保存。');
            showInstallPrompt(); // 显示自定义安装提示
        });

        window.addEventListener('appinstalled', () => {
            console.log('PWA 已成功安裝！');
            hideInstallPrompt();
            deferredPrompt = null;
            checkSubscriptionAndUI(); // PWA 安装后，可能需要重新检查通知功能
        });
    }

    // --- 初始化通知相关的功能 (Service Worker 注册等) ---
    // 确保这个函数在 DOMContentLoaded 中被调用，因为其他逻辑依赖它
    initializeNotificationFeatures();

    // 为安装提示按钮添加事件监听器 (确保它们在 DOMContentLoaded 后被绑定)
    if (installAppBtn) {
        installAppBtn.addEventListener('click', async () => {
            hideInstallPrompt();
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`用户对安装的响应: ${outcome}`);
                deferredPrompt = null;
            }
        });
    }

    if (cancelInstallBtn) {
        cancelInstallBtn.addEventListener('click', () => {
            hideInstallPrompt();
            deferredPrompt = null;
        });
    }

    // 在用户修改通知权限后重新检查 UI 状态
    if ('permissions' in navigator && 'PushManager' in window) {
        navigator.permissions.query({ name: 'notifications' }).then(notificationPerm => {
            notificationPerm.onchange = () => {
                console.log('通知權限狀態已改變:', notificationPerm.state);
                checkSubscriptionAndUI();
            };
        });
    }
});
