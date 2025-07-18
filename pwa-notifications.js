// jigongbao-pwa/frontend/public/pwa-notifications.js

// !!! 請在這裡替換為你的 Render 後端實際 URL !!!
const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com'; // 修正錯字：jonggong -> jigong

// !!! 請在這裡替換為你的 PWA 實際部署的公開網域 (例如 GitHub Pages 的網域) !!!
const OFFICIAL_PWA_ORIGIN = 'https://wang-wei-hao.github.io'; 

// === START: 關鍵修改 ===
// 允許的本地開發主機名稱列表
const ALLOWED_DEV_HOSTNAMES = ['localhost', '127.0.0.1'];
// === END: 關鍵修改 ===

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
    // 這裡我們擴展一下沙箱的定義：如果在 iframe 裡，或者在已安裝的 PWA 裡，
    // 對於通知功能來說，都算是需要「跳轉到瀏覽器」的受限環境。
    return isInIframe() || isPWAInstalled();
}

// 检测是否为 Apple 设备 (iPhone/iPad/iPod)
function isAppleMobileDevice() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// 检测是否为 macOS 上的 Safari 浏览器
function isMacSafari() {
    return navigator.userAgent.includes('Macintosh') && navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome');
}

// === START: 關鍵修改 ===
// 检测当前页面是否运行在官方域名上
function isOfficialOrigin() {
    // 檢查是否為允許的本地開發主機
    if (ALLOWED_DEV_HOSTNAMES.includes(window.location.hostname)) {
        return true;
    }
    // 檢查是否為官方部署的域名
    return window.location.origin === OFFICIAL_PWA_ORIGIN;
}
// === END: 關鍵修改 ===

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
    // 只有在官方域名下才显示安装提示
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
            <p style="margin: 0; font-weight: bold;">在您的 Apple 裝置上安裝濟公報應用程式</p>
            <p style="margin: 0; font-size: 0.95em; opacity: 0.9;">請按照以下步驟，將本網站添加到主畫面：</p>
            <ol style="text-align: left; padding-left: 25px; margin: 10px 0; font-size: 0.9em; line-height: 1.4; color: #e0e0e0;">
                <li>1. 點擊瀏覽器底部的 <strong style="font-size:1.1em;">分享按鈕</strong> (<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Share_iOS_14_icon.svg/50px-Share_iOS_14_icon.svg.png" alt="分享圖示" style="height: 1.2em; vertical-align: middle; filter: invert(1);">)</li>
                <li>2. 選擇「<strong>加入主畫面</strong>」選項</li>
                <li>3. 確認添加，即可像應用程式一樣使用！</li>
            </ol>
            <p style="margin: 0; font-size: 0.85em; opacity: 0.7;">（若無此選項，請更新您的 iOS 系統或嘗試其他瀏覽器）</p>
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
    if (!isOfficialOrigin()) {
        if (subscribeButton) { 
            subscribeButton.textContent = '❌ 非官方來源';
            subscribeButton.disabled = true;
            subscribeButton.style.backgroundColor = '#6c757d'; 
            subscribeButton.title = '通知和安裝功能僅限於官方網站提供。';
            subscribeButton.onclick = null; 
            subscribeButton.removeEventListener('click', handleSubscribeButtonClick); 
        }
        console.warn('PWA 運行於非官方來源，通知功能已禁用。');
        return; 
    }

    if (isSandboxedEnvironment) {
        subscribeButton.textContent = '➡️ 進入濟公報開啟通知';
        subscribeButton.disabled = false;
        subscribeButton.style.backgroundColor = '#6c757d'; 
        subscribeButton.title = '您正在受限環境中。請點擊前往完整網站以啟用通知功能。';
        
        subscribeButton.onclick = null; 
        subscribeButton.removeEventListener('click', handleSubscribeButtonClick); 
        subscribeButton.addEventListener('click', () => { 
            // === START: 關鍵修改 ===
            // 使用 window.open(..., '_blank') 來在系統瀏覽器中打開新標籤頁
            const pwaDirectUrl = "https://wang-wei-hao.github.io/jigong-news/?openExternalBrowser=1"; 
            window.open(pwaDirectUrl, '_blank');
            // === END: 關鍵修改 ===
        });
        return;
    }
    
    subscribeButton.onclick = null; 
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
    if (!isOfficialOrigin()) {
        updateNotificationUI(false, 'default', false); 
        return;
    }
    
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

async function subscribeUser() {
    if (!swRegistration) {
        alert('Service Worker 尚未準備好，無法訂閱。請重新載入頁面。');
        return;
    }
    if (!isOfficialOrigin()) {
        alert('推播訂閱功能僅限於官方網站提供。');
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
    if (!isOfficialOrigin()) {
        updateNotificationUI(false, 'default', false); 
        return;
    }

    if (isSandboxed()) {
        updateNotificationUI(false, 'default', true);
        console.warn('PWA 運行於受限沙箱環境中，通知功能可能受限。');
        return;
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(function(registration) {
                console.log('Service Worker 註冊成功，作用域: ', registration.scope);
                swRegistration = registration;
                checkSubscriptionAndUI(); 
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
        updateNotificationUI(false, 'not-supported');
    }

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
    if (subscribeButton) {
        initializeNotificationFeatures(); 
    } else {
        console.error('未能找到 ID 為 subscribe-btn 的按鈕。');
    }

    if (isPWAInstalled() || isSandboxed() || !isOfficialOrigin()) { 
        if(isPWAInstalled()){
             console.log('PWA 已安裝，不顯示安裝提示。');
        }
    } else {
        if (isAppleMobileDevice() || isMacSafari()) {
            console.log('偵測到 Apple 裝置，準備顯示安裝指南。');
            const hasSeenInstallPrompt = localStorage.getItem('hasSeenAppleInstallPrompt');
            if (!hasSeenInstallPrompt) {
                setTimeout(() => {
                    showCustomInstallPrompt('ios');
                    localStorage.setItem('hasSeenAppleInstallPrompt', 'true'); 
                }, 3000); 
            }
        } else {
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault(); 
                deferredPrompt = e;
                console.log('beforeinstallprompt 事件已保存。');
                showCustomInstallPrompt('default'); 
            });

            window.addEventListener('appinstalled', () => {
                console.log('PWA 已成功安裝！');
                hideInstallPrompt();
                deferredPrompt = null;
                checkSubscriptionAndUI(); 
            });
        }
    }
});
