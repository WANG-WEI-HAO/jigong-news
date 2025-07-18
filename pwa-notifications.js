// jigongbao-pwa/frontend/public/pwa-notifications.js (最新修改版，完整 PWA 功能)

// !!! 請在這裡替換為你的 Render 後端實際 URL !!!
const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com/'; // <-- 替換這個！

const subscribeButton = document.getElementById('subscribe-btn');
let swRegistration = null;

// --- PWA 安装相关变量和 DOM 元素 ---
let deferredPrompt; // 用于保存 beforeinstallprompt 事件
// 确保这些 ID 在 index.html 中存在，并且是 PWA 安装提示弹窗的正确元素
const installAppPrompt = document.getElementById('installAppPrompt'); 
const installAppButton = document.getElementById('installAppButton'); 
const closeInstallPromptButton = document.getElementById('closeInstallPrompt'); 


// --- 辅助函数：检测PWA是否已安装 ---
function isPWAInstalled() {
    // 检查 display-mode 是否为 standalone, fullscreen, 或 minimal-ui
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches) {
        return true;
    }
    // 针对 iOS Safari "添加到主屏幕" 后的行为 (旧版判断，但仍可用)
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
        // 如果访问 window.top 被阻止 (例如跨域 iframe)，则认为在 iframe 中
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

// --- PWA 安装提示逻辑的显示/隐藏函数 ---
function showInstallPrompt() {
    if (installAppPrompt) {
        installAppPrompt.style.display = 'block'; // 显示安装提示
    }
}

function hideInstallPrompt() {
    if (installAppPrompt) {
        installAppPrompt.style.display = 'none';
    }
}

// --- 更新通知按钮 UI 状态的函数 ---
function updateNotificationUI(isSubscribed, permissionState, isSandboxedEnvironment = false) {
    if (isSandboxedEnvironment) {
        subscribeButton.textContent = '➡️ 進入濟公報開啟通知';
        subscribeButton.disabled = false;
        subscribeButton.style.backgroundColor = '#6c757d'; // 灰色
        subscribeButton.title = '您正在受限環境中。請點擊前往完整網站以啟用通知功能。';
        
        // 移除所有旧的事件监听器，只绑定跳转逻辑
        subscribeButton.onclick = null; // 清除之前可能存在的 onclick 属性
        subscribeButton.removeEventListener('click', handleSubscribeButtonClick); // 移除订阅逻辑监听器
        
        subscribeButton.addEventListener('click', () => {
            const pwaDirectUrl = "https://wang-wei-hao.github.io/jigong-news/?openExternalBrowser=1"; // 确保是你的PWA部署的绝对路径
            window.open(pwaDirectUrl, '_blank');
        });
        return;
    }
    
    // 正常环境下的推播按钮逻辑
    // 移除旧的跳转逻辑，确保绑定的是订阅/取消订阅逻辑
    subscribeButton.onclick = null; // 清除可能存在的 onclick 属性
    subscribeButton.removeEventListener('click', handleSubscribeButtonClick); // 移除之前的订阅逻辑监听器
    subscribeButton.addEventListener('click', handleSubscribeButtonClick); // 重新绑定订阅逻辑


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

// --- 检查订阅状态并更新 UI 的函数 ---
async function checkSubscriptionAndUI() {
    // 优先检测是否在沙箱环境 (这里重复检查一次以确保即使异步调用也能正确识别)
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
        updateNotificationUI(!!subscription, permissionState, isSandboxed()); // 传递 isSandboxed() 结果
    } catch (error) {
        console.error('檢查訂閱狀態時出錯或Service Worker未準備好:', error);
        updateNotificationUI(false, 'error'); 
        subscribeButton.textContent = '通知功能錯誤';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#dc3545';
        subscribeButton.title = '通知功能啟動失敗，請重新載入頁面或檢查瀏覽器設定。';
    }
}

// --- 订阅通知的逻辑 ---
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

// --- 取消订阅通知的逻辑 ---
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

// --- 订阅/取消订阅按钮点击的统一处理函数 ---
async function handleSubscribeButtonClick() {
    const currentSubscription = await swRegistration.pushManager.getSubscription();
    if (currentSubscription) {
        unsubscribeUser();
    } else {
        subscribeUser();
    }
}

// --- 初始化通知相关的功能 (Service Worker 注册等) ---
// 将 Service Worker 注册和初始检查集中到这个函数
function initializeNotificationFeatures() {
    // 如果是沙箱环境，直接处理按钮状态并返回
    if (isSandboxed()) {
        updateNotificationUI(false, 'default', true);
        console.warn('PWA 運行於受限沙箱環境中，通知功能可能受限。');
        return;
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
                updateNotificationUI(false, 'registration-failed');
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
}

// --- DOMContentLoaded 主入口 ---
document.addEventListener('DOMContentLoaded', () => {
    // PWA 安装提示逻辑 (确保 DOM 元素已加载)
    if (installAppPrompt && installAppButton && closeInstallPromptButton) {
        // 如果是 PWA 已安装模式，则不显示安装提示，直接初始化通知功能
        if (isPWAInstalled()) {
            console.log('PWA 已安裝，不顯示安裝提示。');
            hideInstallPrompt(); // 隐藏安装提示
        } else if (isSandboxed()) {
            console.log('PWA 運行於受限沙箱環境中，不顯示安裝提示。');
            hideInstallPrompt(); // 沙箱中也不显示安装提示
        } else {
            // 如果不是已安装 PWA 也不是沙箱，则监听 beforeinstallprompt 事件
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
                // 安装后，PWA 会以 standalone 模式运行，检查通知功能
                checkSubscriptionAndUI(); 
            });

            // 为安装提示按钮添加事件监听器
            installAppButton.addEventListener('click', async () => {
                hideInstallPrompt();
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log(`用户对安装的响应: ${outcome}`);
                    deferredPrompt = null;
                }
            });

            closeInstallPromptButton.addEventListener('click', () => {
                hideInstallPrompt();
                deferredPrompt = null;
            });
        }
    } else {
        console.warn('PWA 安装提示相关 DOM 元素未找到。');
    }

    // 确保 subscribeButton 元素存在才初始化通知功能
    if (subscribeButton) {
        initializeNotificationFeatures(); // 调用初始化通知功能的函数
    } else {
        console.error('未能找到 ID 为 subscribe-btn 的按钮。');
    }
});
