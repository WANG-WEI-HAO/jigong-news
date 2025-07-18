// jigongbao-pwa/frontend/public/pwa-notifications.js (最新修改版，含沙箱检测)

// !!! 請在這裡替換為你的 Render 後端實際 URL !!!
const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com/'; // <-- 替換這個！

const subscribeButton = document.getElementById('subscribe-btn');
let swRegistration = null;

// --- 新增：检测沙箱或iframe环境的辅助函数 ---
function isInIframe() {
    try {
        return window.self !== window.top;
    } catch (e) {
        // 如果访问 window.top 被阻止 (例如跨域 iframe)，则认为在 iframe 中
        return true;
    }
}

function isSandboxed() {
    // 检查文档是否被沙箱化
    // 现代浏览器中，document.featurePolicy 或 document.permissions 也可用于更细粒度检测
    // 但最直接的是检查是否在 iframe 中且功能受限
    if (isInIframe()) {
        // 如果在 iframe 中，并且当前 document.body 没有直接的 allow-modals 权限，
        // 或者 Service Worker 无法注册，我们可以认为它处于受限沙箱。
        // 最直接的判断还是基于 Service Worker 是否能成功注册。
        return true; // 简单的判断：如果在 iframe 里就认为是沙箱
    }
    return false;
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
            const confirmRedirect = confirm('您正在受限環境中。點擊「確定」前往濟公報官方網站，以啟用推播通知功能。');
            
            if (confirmRedirect) {
                const pwaBaseUrl = "https://wang-wei-hao.github.io/jigong-news/"; // 你的PWA根URL
                const targetUrl = new URL(pwaBaseUrl);
                targetUrl.searchParams.set('openExternalBrowser', '1'); // 添加或更新参数

                // --- 核心修改：尝试 Android Intent URL ---
                if (navigator.userAgent.includes("Android") && navigator.userAgent.includes("Chrome")) {
                    // 构建 Android Intent URL
                    const androidIntentUrl = `intent://${targetUrl.host}${targetUrl.pathname}${targetUrl.search}#Intent;scheme=${targetUrl.protocol.replace(':', '')};package=com.android.chrome;end`;
                    window.location.href = androidIntentUrl; // 尝试直接导航到 Intent URL
                } else {
                    // 对于其他平台或非Chrome浏览器，退回到 window.open
                    window.open(targetUrl.toString(), '_blank'); 
                }
                // --- 修改结束 ---
            }
        };
        return;
    }

    // --- 正常环境下的逻辑 ---
    if (permissionState === 'denied') {
        subscribeButton.textContent = '🚫 通知已拒絕';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#dc3545'; // 红色
        subscribeButton.title = '請在瀏覽器設定中啟用通知權限。';
    } else if (isSubscribed) {
        subscribeButton.textContent = '🔕 關閉通知';
        subscribeButton.disabled = false;
        subscribeButton.style.backgroundColor = '#6c757d'; // 灰色
        subscribeButton.title = '點擊以取消訂閱推播通知。';
    } else {
        subscribeButton.textContent = '🔔 開啟通知';
        subscribeButton.disabled = false;
        subscribeButton.style.backgroundColor = '#007bff'; // 蓝色
        subscribeButton.title = '點擊以訂閱每日推播通知。';
    }

    // 确保按钮点击事件是订阅/取消订阅逻辑，而不是跳转
    subscribeButton.onclick = null; // 清除之前的跳转逻辑
    subscribeButton.addEventListener('click', handleSubscribeButtonClick); // 重新绑定订阅逻辑
}

// 检查订阅状态并更新 UI
async function checkSubscriptionAndUI() {
    // 优先检测是否在沙箱环境
    if (isSandboxed()) {
        updateNotificationUI(false, 'default', true); // 强制显示沙箱提示
        console.warn('PWA 運行於受限沙箱環境中，通知功能可能受限。');
        return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        updateNotificationUI(false, 'not-supported'); // 使用一个特殊状态表示不支持
        subscribeButton.textContent = '瀏覽器不支持通知'; // 覆盖文本
        subscribeButton.title = '您的瀏覽器不支持 Service Worker 或推播通知。'; // 覆盖提示
        return;
    }

    try {
        // 等待 Service Worker 准备好，如果 Service Worker 注册失败，swRegistration 会为 null，这里会抛错
        swRegistration = await navigator.serviceWorker.ready;
        const subscription = await swRegistration.pushManager.getSubscription();
        const permissionState = Notification.permission;
        updateNotificationUI(!!subscription, permissionState);
    } catch (error) {
        console.error('檢查訂閱狀態時出錯或Service Worker未準備好:', error);
        // 如果 Service Worker 注册失败，也会走到这里
        updateNotificationUI(false, 'error'); // 使用一个特殊状态表示错误
        subscribeButton.textContent = '通知功能錯誤'; // 覆盖文本
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#dc3545';
        subscribeButton.title = '通知功能啟動失敗，請重新載入頁面或檢查瀏覽器設定。';
    }
}

// 订阅通知的逻辑
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
                    // await navigator.permissions.request({ name: 'periodic-background-sync' }); // 这行依然注释掉
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

// 取消订阅通知的逻辑
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

// 绑定按钮事件和 Service Worker 注册（在 DOMContentLoaded 确保元素加载）
document.addEventListener('DOMContentLoaded', () => {
    // 首次加载时就立即检查是否在沙箱，这会影响 Service Worker 注册前的 UI 状态
    if (isSandboxed()) {
        updateNotificationUI(false, 'default', true);
        console.warn('PWA 運行於受限沙箱環境中，通知功能可能受限。');
        return; // 沙箱环境下不尝试注册 Service Worker 和后续逻辑
    }

    // 正常环境下的 Service Worker 注册
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(function(registration) {
                console.log('Service Worker 註冊成功，作用域: ', registration.scope);
                swRegistration = registration;
                checkSubscriptionAndUI(); // 注册后立即检查订阅状态并更新 UI
            })
            .catch(function(error) {
                console.error('Service Worker 註冊失敗:', error);
                updateNotificationUI(false, 'registration-failed'); // 新增一个状态用于注册失败
                subscribeButton.textContent = '通知服務無法啟動';
                subscribeButton.disabled = true;
                subscribeButton.style.backgroundColor = '#dc3545';
                subscribeButton.title = 'Service Worker 註冊失敗，推播功能不可用。';
            });
    } else {
        // 浏览器不支持 Service Worker
        updateNotificationUI(false, 'not-supported');
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
