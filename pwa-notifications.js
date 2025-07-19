// jigongbao-pwa/frontend/public/pwa-notifications.js

// !!! 請在這裡替換為你的 Render 後端實際 URL !!!
const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com';

// !!! 請在這裡替換為你的 PWA 實際部署的公開網域 (例如 GitHub Pages 的網域) !!!
// 注意：這裡應該是 PWA 的基礎網域，不包含任何路徑。
// 例如，如果你的 PWA 部署在 https://wang-wei-hao.github.io/jigong-news/，
// 那麼你的 OFFICIAL_PWA_BASE_ORIGIN 就是 https://wang-wei-hao.github.io
const OFFICIAL_PWA_BASE_ORIGIN = 'https://wang-wei-hao.github.io'; 

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

// 检测是否为 Apple 设备 (iPhone/iPad/iPod)
function isAppleMobileDevice() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// 检测是否为 macOS 上的 Safari 浏览器
function isMacSafari() {
    // macOS Safari 16.4+ 開始支援 Web Push，但仍有其限制。這裡判斷瀏覽器類型。
    return navigator.userAgent.includes('Macintosh') && navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Edge');
}

// === 新增：检测当前页面是否运行在官方域名上 ===
function isOfficialOrigin() {
    // 在本地開發環境 (localhost) 下，通常也會允許運行，以便調試
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return true;
    }
    // 判斷當前頁面的 Origin 是否以設定的官方基礎 Origin 開頭
    return window.location.origin.startsWith(OFFICIAL_PWA_BASE_ORIGIN);
}
// === 新增结束 ===

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
function showCustomInstallPrompt(type = 'default') {
    // 只有在官方域名下才顯示安裝提示
    if (!isOfficialOrigin()) {
        console.warn('非官方網域，不顯示安裝提示。');
        return;
    }

    let promptOverlay = document.getElementById('customInstallPromptOverlay');

    if (!promptOverlay) {
        promptOverlay = document.createElement('div');
        promptOverlay.id = 'customInstallPromptOverlay';
        promptOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            backdrop-filter: blur(5px);
        `;
        document.body.appendChild(promptOverlay);

        const promptDiv = document.createElement('div');
        promptDiv.id = 'customInstallPrompt';
        promptDiv.style.cssText = `
            background-color: #333;
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
            z-index: 10000;
            font-size: 1.1em;
            text-align: center;
            width: clamp(300px, 90vw, 500px);
            box-sizing: border-box;
            transform: scale(0.9);
            transition: transform 0.3s ease-in-out;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 15px;
        `;

        if (document.body.classList.contains('dark-mode')) {
            promptDiv.style.backgroundColor = '#2c2c2c';
            promptDiv.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.1)';
        }

        promptOverlay.appendChild(promptDiv);

        promptOverlay.addEventListener('click', (e) => {
            if (e.target === promptOverlay) {
                hideInstallPrompt();
            }
        });
    }

    const promptContentDiv = document.getElementById('customInstallPrompt');
    if (!promptContentDiv) return;

    let contentHTML = '';
    let buttonsHTML = '';

    if (type === 'ios') {
        contentHTML = `
            <p style="margin: 0; font-weight: bold;">安裝濟公報應用程式</p>
            <p style="margin: 0; font-size: 0.95em; opacity: 0.9;">請點擊瀏覽器底部的
                <strong style="font-size:1.1em;">分享按鈕</strong>
                (<img src="/icons/ios分享icon.jpg" alt="分享圖示" style="height: 1.2em; vertical-align: middle; filter: invert(1);">)，
                接著選擇「<strong style="font-size:1.1em;">加入主畫面</strong>」
                (<img src="/icons/ios加到主畫面icon.jpg" alt="加到主畫面圖示" style="height: 1.2em; vertical-align: middle; filter: invert(1);">)
                即可安裝應用程式。
            </p>
            <p style="margin: 0; font-size: 0.85em; opacity: 0.7;">（若無此選項，請更新您的 iOS 系統或嘗試其他瀏覽器）</p>
        `;
        buttonsHTML = `
            <div style="display: flex; gap: 15px; margin-top: 10px;">
                <button id="iosDismissButton" style="
                    background-color: transparent;
                    color: #bbb;
                    border: 1px solid #bbb;
                    padding: 8px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 0.9em;
                    transition: background-color 0.2s, color 0.2s;
                    min-width: 80px;
                ">不再提示</button>
            </div>
        `;
    } else { // default for Android/Desktop Chrome/Edge
        contentHTML = `
            <p style="margin: 0;">希望每天自動收到濟公報更新嗎？</p>
            <p style="margin: 0; font-size: 0.9em; opacity: 0.8;">安裝應用程式以獲取最佳體驗和推播通知！</p>
        `;
        buttonsHTML = `
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
        `;
    }

    promptContentDiv.innerHTML = `
        ${contentHTML}
        ${buttonsHTML}
        <button id="customCancelInstallButton" style="
            background-color: transparent;
            color: #bbb;
            font-size: 1.5em;
            position: absolute;
            top: 8px;
            right: 12px;
            padding: 0 5px;
            line-height: 1;
            border: none;
            cursor: pointer;
            transition: color 0.2s;
        ">×</button>
    `;

    const customInstallAppButton = document.getElementById('customInstallAppButton');
    const customCancelInstallButton = document.getElementById('customCancelInstallButton');
    const iosDismissButton = document.getElementById('iosDismissButton'); 

    if (customInstallAppButton) {
        customInstallAppButton.addEventListener('click', async () => {
            hideInstallPrompt();
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                deferredPrompt = null;
            }
        });
    }

    if (iosDismissButton) { 
        iosDismissButton.addEventListener('click', () => {
            localStorage.setItem('hasSeenAppleInstallPrompt', 'dismissed'); 
            hideInstallPrompt();
        });
    }

    if (customCancelInstallButton) {
        customCancelInstallButton.addEventListener('click', () => {
            hideInstallPrompt();
            if (type !== 'ios') {
                deferredPrompt = null;
            }
        });
    }

    promptOverlay.style.display = 'flex';
    setTimeout(() => {
        promptOverlay.style.opacity = '1';
        promptContentDiv.style.transform = 'scale(1)';
    }, 50);
}

function hideInstallPrompt() {
    const promptOverlay = document.getElementById('customInstallPromptOverlay');
    const promptDiv = document.getElementById('customInstallPrompt');
    if (promptOverlay && promptDiv) {
        promptOverlay.style.opacity = '0';
        promptDiv.style.transform = 'scale(0.9)';

        promptOverlay.addEventListener('transitionend', function handler() {
            promptOverlay.style.display = 'none';
            promptOverlay.removeEventListener('transitionend', handler);
        }, { once: true });
    }
}

// 更新 UI 狀態（按鈕文本和可用性）
function updateNotificationUI(isSubscribed, permissionState, isSandboxedEnvironment = false) {
    // 如果按鈕元素不存在，直接返回
    if (!subscribeButton) {
        console.error('未能找到 ID 為 subscribe-btn 的按鈕元素。');
        return;
    }

    // 清除所有舊的事件監聽器，避免重複
    subscribeButton.onclick = null;
    subscribeButton.removeEventListener('click', handleSubscribeButtonClick);
    subscribeButton.removeEventListener('click', handleSandboxOrAppleRedirect); // 移除舊的導向監聽器

    // --- 特殊環境優先處理 ---
    // 如果不是官方來源，直接禁用按鈕並顯示提示
    if (!isOfficialOrigin()) {
        subscribeButton.textContent = '❌ 非官方來源';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#6c757d';
        subscribeButton.title = '通知和安裝功能僅限於官方網站提供。';
        console.warn('PWA 運行於非官方來源，通知功能已禁用。');
        return; 
    }

    // 如果是沙箱環境 或者 是 Apple 裝置且未安裝 PWA
    // 我們讓按鈕都負責引導到正確的 PWA URL
    if (isSandboxedEnvironment || ((isAppleMobileDevice() || isMacSafari()) && !isPWAInstalled())) {
        const pwaDirectUrl = OFFICIAL_PWA_BASE_ORIGIN + "/jigong-news/"; // 指向 PWA 的根路徑

        subscribeButton.textContent = '➡️ 進入濟公報開啟通知';
        subscribeButton.disabled = false;
        subscribeButton.style.backgroundColor = '#007bff'; // 更顯眼
        subscribeButton.title = '點擊前往完整網站或已安裝的應用程式以開啟通知功能。';
        
        // 確保點擊後導向正確的 URL
        function handleSandboxOrAppleRedirect() {
            window.open(pwaDirectUrl, '_blank');
        }
        subscribeButton.addEventListener('click', handleSandboxOrAppleRedirect);
        return;
    }

    // --- 通用瀏覽器或已安裝的 Apple PWA 的邏輯 ---
    // 如果 Service Worker 或 PushManager 不支援
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        subscribeButton.textContent = '瀏覽器不支持通知';
        subscribeButton.disabled = true;
        subscribeButton.style.backgroundColor = '#6c757d';
        subscribeButton.title = '您的瀏覽器不支持 Service Worker 或推播通知。';
        return;
    }

    // 正常情況下的訂閱/取消訂閱邏輯
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
    // 優先檢查是否在官方來源
    if (!isOfficialOrigin()) {
        updateNotificationUI(false, 'default', false); // 禁用按鈕並顯示非官方提示
        return;
    }

    // 檢查是否為沙箱環境 或 Apple 裝置且未安裝 PWA
    if (isSandboxed() || ((isAppleMobileDevice() || isMacSafari()) && !isPWAInstalled())) {
        updateNotificationUI(false, 'default', true); // 使用 isSandboxedEnvironment = true 觸發導向邏輯
        console.warn('PWA 運行於受限沙箱環境或未安裝的 Apple PWA 環境，按鈕將引導至完整網站。');
        return;
    }

    // 只有在非特殊環境下，才檢查 Service Worker 和 PushManager
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        updateNotificationUI(false, 'not-supported');
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
        if (subscribeButton) { 
            subscribeButton.textContent = '通知功能錯誤';
            subscribeButton.disabled = true;
            subscribeButton.style.backgroundColor = '#dc3545';
            subscribeButton.title = '通知功能啟動失敗，請重新載入頁面或檢查瀏覽器設定。';
        }
    }
}

async function subscribeUser() {
    if (!swRegistration) {
        alert('Service Worker 尚未準備好，無法訂閱。請重新載入頁面。');
        return;
    }
    // 确保是在官方来源才执行订阅
    if (!isOfficialOrigin()) {
        alert('推播訂閱功能僅限於官方網站提供。');
        updateNotificationUI(false, Notification.permission);
        return;
    }

    // 如果是沙箱環境 或 Apple 裝置且未安裝 PWA，則不允許訂閱，而是引導用戶
    if (isSandboxed() || ((isAppleMobileDevice() || isMacSafari()) && !isPWAInstalled())) {
        alert('請先前往完整網站或將應用程式加入主畫面，才能開啟推播通知。');
        updateNotificationUI(false, Notification.permission, true); // 重新呼叫以顯示導向按鈕
        return;
    }


    if (subscribeButton) { 
        subscribeButton.disabled = true;
        subscribeButton.textContent = '正在請求權限...';
        subscribeButton.style.backgroundColor = '#ffc107';
    }


    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        console.warn('用戶拒絕了通知權限。');
        alert('您已拒絕通知權限。若要訂閱，請至瀏覽器設定中手動開啟。');
        updateNotificationUI(false, permission);
        return;
    }

    if (subscribeButton) { 
        subscribeButton.textContent = '正在訂閱...';
        subscribeButton.style.backgroundColor = '#ffc107';
    }

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
    // 确保是在官方来源才执行取消订阅
    if (!isOfficialOrigin()) {
        alert('推播取消訂閱功能僅限於官方網站提供。');
        updateNotificationUI(true, Notification.permission); 
        return;
    }

    const confirmUnsubscribe = confirm('您確定要取消訂閱濟公報推播通知嗎？');
    if (!confirmUnsubscribe) {
        updateNotificationUI(true, Notification.permission);
        return;
    }

    if (subscribeButton) { 
        subscribeButton.disabled = true;
        subscribeButton.textContent = '正在取消訂閱...';
        subscribeButton.style.backgroundColor = '#ffc107';
    }

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

// --- 初始化通知相關的功能 (Service Worker 註冊等) ---
function initializeNotificationFeatures() {
    // 優先檢查是否在官方來源。如果不是，禁用所有功能。
    if (!isOfficialOrigin()) {
        updateNotificationUI(false, 'default', false); 
        return;
    }

    // 如果是沙箱環境 或 Apple 裝置且未安裝 PWA，按鈕將引導至完整網站
    if (isSandboxed() || ((isAppleMobileDevice() || isMacSafari()) && !isPWAInstalled())) {
        updateNotificationUI(false, 'default', true); // 使用 isSandboxedEnvironment = true 觸發導向邏輯
        console.warn('PWA 運行於受限沙箱環境或未安裝的 Apple PWA 環境，通知功能會引導至完整網站。');
        return;
    }

    // 正常環境下的 Service Worker 註冊
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(function(registration) {
                console.log('Service Worker 註冊成功，作用域: ', registration.scope);
                swRegistration = registration;
                checkSubscriptionAndUI(); // 註冊後立即檢查訂閱狀態並更新 UI
            })
            .catch(function(error) {
                console.error('Service Worker 註冊失敗:', error);
                updateNotificationUI(false, 'registration-failed');
                if (subscribeButton) { 
                    subscribeButton.textContent = '通知服務無法啟動';
                    subscribeButton.disabled = true;
                    subscribeButton.style.backgroundColor = '#dc3545';
                    subscribeButton.title = 'Service Worker 註冊失敗，推播功能不可用。';
                }
            });
    } else {
        // 瀏覽器不支持 Service Worker
        updateNotificationUI(false, 'not-supported');
    }

    // 在用戶修改通知權限後重新檢查 UI 狀態
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
    // 確保 subscribeButton 元素存在才初始化通知功能
    if (subscribeButton) {
        initializeNotificationFeatures(); // 調用初始化通知功能的函數
    } else {
        console.error('未能找到 ID 為 subscribe-btn 的按鈕。');
    }

    // PWA 安裝提示邏輯
    // 優先檢查是否已安裝或在受限環境，以及是否為官方來源
    if (isPWAInstalled() || isSandboxed() || !isOfficialOrigin()) {
        if(isPWAInstalled()){
            console.log('PWA 已安裝，不顯示安裝提示。');
        }
        // 如果是沙箱環境或非官方來源，安裝提示不會被顯示
    } else {
        // 判斷設備類型以提供不同安裝提示
        if (isAppleMobileDevice() || isMacSafari()) {
            console.log('偵測到 Apple 裝置，準備顯示安裝指南。');
            // 使用 localStorage 控制顯示頻率，允許用戶選擇「不再提示」
            const hasSeenInstallPrompt = localStorage.getItem('hasSeenAppleInstallPrompt');
            if (hasSeenInstallPrompt !== 'dismissed') { 
                setTimeout(() => {
                    showCustomInstallPrompt('ios');
                }, 3000); // 延遲3秒顯示iOS/macOS安裝提示，讓用戶先看到內容
            }
        } else {
            // 其他瀏覽器 (主要是 Chromium based)，監聽 beforeinstallprompt 事件
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault(); // 阻止瀏覽器默認的安裝提示
                deferredPrompt = e;
                console.log('beforeinstallprompt 事件已保存。');
                showCustomInstallPrompt('default'); // 顯示自定義安裝提示 (用於 Android/Desktop Chrome/Edge)
            });

            window.addEventListener('appinstalled', () => {
                console.log('PWA 已成功安裝！');
                hideInstallPrompt();
                deferredPrompt = null;
                checkSubscriptionAndUI(); // PWA 安裝後，可能需要重新檢查通知功能
            });
        }
    }
});
