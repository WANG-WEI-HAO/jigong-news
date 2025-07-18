// jigongbao-pwa/frontend/public/pwa-notifications.js (最新修改版，使用JS动态弹窗)

// !!! 請在這裡替換為你的 Render 後端實際 URL !!!
const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com'; // 請確認這個URL是否正確，通常不需要末尾的斜杠

const subscribeButton = document.getElementById('subscribe-btn');
let swRegistration = null;

let deferredPrompt; // 用于保存 beforeinstallprompt 事件

// --- 辅助函数：环境检测 ---
function isPWAInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
}

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

// --- JS 动态安装提示弹窗逻辑 ---
// 这个函数现在负责创建、显示和管理弹窗
function showInstallPrompt() {
    let promptOverlay = document.getElementById('customInstallPromptOverlay');

    if (!promptOverlay) {
        // 创建背景遮罩
        promptOverlay = document.createElement('div');
        promptOverlay.id = 'customInstallPromptOverlay';
        promptOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7); /* 半透明黑色背景 */
            z-index: 9999; /* 确保在最上层 */
            display: flex; /* 使用 flexbox 居中其子元素 */
            justify-content: center;
            align-items: center;
            opacity: 0; /* 初始透明，用于渐入效果 */
            transition: opacity 0.3s ease-in-out; /* 渐入动画 */
            backdrop-filter: blur(5px); /* 模糊背景，可选 */
        `;
        document.body.appendChild(promptOverlay);

        // 创建弹窗容器
        const promptDiv = document.createElement('div');
        promptDiv.id = 'customInstallPrompt';
        promptDiv.style.cssText = `
            background-color: #333;
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
            z-index: 10000; /* 比遮罩更高 */
            font-size: 1.1em;
            text-align: center;
            /* 响应式宽度：最小300px，最大500px，自适应屏幕90% */
            width: clamp(300px, 90vw, 500px); 
            box-sizing: border-box;
            transform: scale(0.9); /* 初始缩小，用于放大效果 */
            transition: transform 0.3s ease-in-out; /* 放大动画 */
            position: relative; /* 允许取消按钮定位 */
            display: flex; /* 内部内容也使用 flex */
            flex-direction: column;
            align-items: center;
            gap: 15px; /* 间距 */
        `;

        // Dark Mode 适配（动态添加类名或直接设置样式）
        if (document.body.classList.contains('dark-mode')) {
            promptDiv.style.backgroundColor = '#2c2c2c';
            promptDiv.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.1)';
        }

        promptDiv.innerHTML = `
            <p style="margin: 0;">希望每天自動收到濟公報更新嗎？</p>
            <p style="margin: 0; font-size: 0.9em; opacity: 0.8;">安裝應用程式以獲取最佳體驗和推播通知！</p>
            <div style="display: flex; gap: 15px; margin-top: 10px;">
                <button id="customInstallAppButton" style="
                    background-color: #5a4fcf;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 1em;
                    transition: background-color 0.2s, transform 0.1s;
                    min-width: 100px;
                ">立即安裝</button>
            </div>
            <button id="customCancelInstallButton" style="
                background-color: transparent;
                color: #bbb;
                font-size: 1.5em; /* 放大取消按鈕 */
                position: absolute;
                top: 8px; /* 调整位置 */
                right: 12px; /* 调整位置 */
                padding: 0 5px;
                line-height: 1;
                border: none;
                cursor: pointer;
                transition: color 0.2s;
            ">×</button>
        `;

        promptOverlay.appendChild(promptDiv);

        // 绑定事件监听器到动态创建的按钮
        const customInstallAppButton = document.getElementById('customInstallAppButton');
        const customCancelInstallButton = document.getElementById('customCancelInstallButton');

        if (customInstallAppButton) {
            customInstallAppButton.addEventListener('click', async () => {
                hideInstallPrompt(); // 隐藏自定义提示
                if (deferredPrompt) {
                    deferredPrompt.prompt(); // 触发浏览器默认的安装提示
                    const { outcome } = await deferredPrompt.userChoice; // 等待用户选择
                    console.log(`User response to the install prompt: ${outcome}`);
                    deferredPrompt = null; // 清除事件
                }
            });
        }

        if (customCancelInstallButton) {
            customCancelInstallButton.addEventListener('click', () => {
                hideInstallPrompt(); // 隐藏自定义提示
                deferredPrompt = null; // 清除事件
            });
        }

        // 点击遮罩外部也隐藏弹窗
        promptOverlay.addEventListener('click', (e) => {
            if (e.target === promptOverlay) { // 确保点击的是遮罩本身，而不是内部弹窗
                hideInstallPrompt();
            }
        });
    }

    // 显示遮罩和弹窗，并应用动画效果
    promptOverlay.style.display = 'flex';
    setTimeout(() => { // 短暂延迟后应用透明度，触发 CSS 渐入
        promptOverlay.style.opacity = '1';
        const promptDiv = document.getElementById('customInstallPrompt');
        if (promptDiv) {
            promptDiv.style.transform = 'scale(1)'; // 放大到正常大小
        }
    }, 50); // 微小延迟，确保 display:flex先生效

}

function hideInstallPrompt() {
    const promptOverlay = document.getElementById('customInstallPromptOverlay');
    const promptDiv = document.getElementById('customInstallPrompt');
    if (promptOverlay && promptDiv) {
        promptOverlay.style.opacity = '0'; // 渐出效果
        promptDiv.style.transform = 'scale(0.9)'; // 缩小效果
        
        // 动画结束后移除元素，避免DOM堆积
        promptOverlay.addEventListener('transitionend', function handler() {
            promptOverlay.style.display = 'none';
            // 可以选择移除整个 overlay 或只移除 promptDiv，这里只隐藏
            // promptOverlay.remove(); // 如果选择移除，下次需要重新创建
            promptOverlay.removeEventListener('transitionend', handler); // 移除监听器，避免重复触发
        });
    }
}


// --- updateNotificationUI, checkSubscriptionAndUI 等函数保持不变 ---

// 更新 UI 状态（按钮文本和可用性）
function updateNotificationUI(isSubscribed, permissionState, isSandboxedEnvironment = false) {
    if (isSandboxedEnvironment) {
        subscribeButton.textContent = '➡️ 進入濟公報開啟通知';
        subscribeButton.disabled = false;
        subscribeButton.style.backgroundColor = '#6c757d'; // 灰色
        subscribeButton.title = '您正在受限環境中。請點擊前往完整網站以啟用通知功能。';
        
        subscribeButton.onclick = null; // 清除可能存在的 onclick 属性
        subscribeButton.removeEventListener('click', handleSubscribeButtonClick); // 移除订阅逻辑监听器
        subscribeButton.addEventListener('click', () => { // 重新绑定跳转逻辑
            const pwaDirectUrl = "https://wang-wei-hao.github.io/jigong-news/?openExternalBrowser=1"; // 确保是你的PWA部署的绝对路径
            window.open(pwaDirectUrl, '_blank');
        });
        return;
    }
    
    subscribeButton.onclick = null; // 清除可能存在的 onclick 属性
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
        updateNotificationUI(!!subscription, permissionState, isSandboxed()); 
    } catch (error) {
        console.error('檢查訂閱狀態時出錯或Service Worker未準備好:', error);
        updateNotificationUI(false, 'error'); 
        subscribeButton.textContent = '通知功能錯誤';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#dc3545';
        subscribeButton.title = '通知功能啟動失敗，請重新載入頁面或檢查瀏覽器設定。';
    }
}

// --- subscribeUser, unsubscribeUser, handleSubscribeButtonClick 函数保持不变 ---
async function subscribeUser() {
    if (!swRegistration) {
        alert('Service Worker 尚未準備好，無法訂閱。請重新載入頁面。');
        return;
    }

    // 将确认对话框替换为更友好的提示或直接请求，或者放在自定义弹窗中
    // const confirmSubscribe = confirm('您確定要訂閱每日濟公報推播通知嗎？');
    // if (!confirmSubscribe) {
    //     updateNotificationUI(false, Notification.permission);
    //     return;
    // }

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
            if ('periodicSync' in swRegistration) { // periodicSync 是實驗性功能，瀏覽器支持有限
                try {
                    await swRegistration.periodicSync.register('content-check', {
                        minInterval: 24 * 60 * 60 * 1000 // 每天檢查一次
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
            await subscription.unsubscribe(); // 后端失败，前端也取消订阅
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
                // return; 不要 return，即使后端失败也要尝试在前端取消
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
    // 确保 subscribeButton 元素存在才初始化通知功能
    if (subscribeButton) {
        initializeNotificationFeatures(); // 调用初始化通知功能的函数
    } else {
        console.error('未能找到 ID 为 subscribe-btn 的按钮。');
    }

    // PWA 安装提示逻辑 (确保 DOM 元素已加载)
    if (isPWAInstalled() || isSandboxed()) { 
        if(isPWAInstalled()){
             console.log('PWA 已安裝，不顯示安裝提示。');
        }
    } else {
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
});
