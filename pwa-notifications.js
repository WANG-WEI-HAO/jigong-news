// jigongbao-pwa/frontend/public/pwa-notifications.js (最新修改版)

// !!! 請在這裡替換為你的 Render 後端實際 URL !!!
// 例如: const BACKEND_BASE_URL = 'https://your-backend-service-name.onrender.com';
const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com'; // <-- 替換這個！

const subscribeButton = document.getElementById('subscribe-btn');
let swRegistration = null;

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
function updateNotificationUI(isSubscribed, permissionState) {
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
}

// 检查订阅状态并更新 UI
async function checkSubscriptionAndUI() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        subscribeButton.textContent = '瀏覽器不支持通知';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#6c757d';
        subscribeButton.title = '您的瀏覽器不支持 Service Worker 或推播通知。';
        return;
    }

    try {
        swRegistration = await navigator.serviceWorker.ready;
        const subscription = await swRegistration.pushManager.getSubscription();
        const permissionState = Notification.permission;
        updateNotificationUI(!!subscription, permissionState);
    } catch (error) {
        console.error('檢查訂閱狀態時出錯:', error);
        subscribeButton.textContent = '檢查狀態錯誤';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#dc3545';
        subscribeButton.title = '檢查訂閱狀態時發生錯誤。';
    }
}

// 订阅通知的逻辑
async function subscribeUser() {
    if (!swRegistration) {
        console.warn('Service Worker 尚未準備好。');
        return;
    }

    // 弹窗确认
    const confirmSubscribe = confirm('您確定要訂閱每日濟公報推播通知嗎？');
    if (!confirmSubscribe) {
        updateNotificationUI(false, Notification.permission); // 用户取消，恢复按钮状态
        return;
    }

    subscribeButton.disabled = true;
    subscribeButton.textContent = '正在請求權限...';
    subscribeButton.style.backgroundColor = '#ffc107'; // 黄色，表示处理中

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        console.warn('用戶拒絕了通知權限。');
        alert('您已拒絕通知權限。若要訂閱，請至瀏覽器設定中手動開啟。');
        updateNotificationUI(false, permission);
        return;
    }

    subscribeButton.textContent = '正在訂閱...';
    subscribeButton.style.backgroundColor = '#ffc107'; // 黄色，表示处理中

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
                    //await navigator.permissions.request({ name: 'periodic-background-sync' });
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
        console.warn('Service Worker 尚未準備好。');
        return;
    }

    // 弹窗确认
    const confirmUnsubscribe = confirm('您確定要取消訂閱濟公報推播通知嗎？');
    if (!confirmUnsubscribe) {
        updateNotificationUI(true, Notification.permission); // 用户取消，恢复按钮状态
        return;
    }

    subscribeButton.disabled = true;
    subscribeButton.textContent = '正在取消訂閱...';
    subscribeButton.style.backgroundColor = '#ffc107'; // 黄色，表示处理中

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

// 绑定按钮事件和 Service Worker 注册（在 DOMContentLoaded 确保元素加载）
document.addEventListener('DOMContentLoaded', () => {
    if (subscribeButton) {
        subscribeButton.addEventListener('click', async () => {
            if (!swRegistration) {
                alert('Service Worker 尚未準備好，請稍後再試。');
                return;
            }
            const currentSubscription = await swRegistration.pushManager.getSubscription();
            if (currentSubscription) {
                unsubscribeUser();
            } else {
                subscribeUser();
            }
        });
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(function(registration) {
                console.log('Service Worker 註冊成功，作用域: ', registration.scope);
                swRegistration = registration;
                checkSubscriptionAndUI();
            })
            .catch(function(error) {
                console.error('Service Worker 註冊失敗: ', error);
                subscribeButton.textContent = '服務無法啟用';
                subscribeButton.disabled = true;
                subscribeButton.style.backgroundColor = '#dc3545';
                subscribeButton.title = 'Service Worker 註冊失敗，推播功能無法啟用。';
            });
    } else {
        subscribeButton.textContent = '瀏覽器不支持';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#6c757d';
        subscribeButton.title = '您的瀏覽器不支持 Service Worker，推播功能不可用。';
    }

    if ('permissions' in navigator && 'PushManager' in window) {
        navigator.permissions.query({ name: 'notifications' }).then(notificationPerm => {
            notificationPerm.onchange = () => {
                console.log('通知權限狀態已改變:', notificationPerm.state);
                checkSubscriptionAndUI();
            };
        });
    }
});