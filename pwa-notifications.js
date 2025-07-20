/**
 * Initializes all PWA-related features, including Service Worker registration,
 * push notifications, theme toggling, and custom install prompts.
 * This function is designed to be called once the DOM is fully loaded,
 * with all necessary DOM elements passed as arguments.
 *
 * @param {object} domElements - An object containing references to necessary DOM elements.
 * @param {HTMLElement} domElements.settingsBtn
 * @param {HTMLElement} domElements.settingsPanel
 * @param {HTMLElement} domElements.closeSettingsBtn
 * @param {HTMLInputElement} domElements.notificationToggleSwitch
 * @param {HTMLElement} domElements.notificationLabel
 * @param {HTMLInputElement} domElements.themeToggleSwitch
 * @param {HTMLElement} domElements.clearCacheBtn
 * @param {HTMLElement} domElements.overlay
 * @param {HTMLElement} domElements.customInstallPromptOverlay
 * @param {HTMLElement} domElements.notificationConfirmationModalOverlay
 * @param {HTMLElement} domElements.notificationConfirmationModal
 * @param {HTMLElement} domElements.permissionDeniedModalOverlay
 * @param {HTMLElement} domElements.permissionDeniedModal
 */
function initializePwaLogic(domElements) {
    // --- PWA 設定常數 ---
    // !!! 請在這裡替換為你的 Render 後端實際 URL !!!
    const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com'; // 替換為你的後端 API 基礎 URL

    // !!! 請在這裡替換為你的 PWA 實際部署的公開網域 (例如 GitHub Pages 的網域) !!!
    const OFFICIAL_PWA_ORIGIN = 'https://wang-wei-hao.github.io'; 

    // 如果你的 PWA 部署在子路徑下 (例如: https://yourusername.github.io/your-repo-name/)
    const PWA_SUB_PATH = '/jigong-news'; // 請根據您的實際部署路徑設定

    // --- 狀態變數 ---
    let swRegistration = null; // 用於保存 Service Worker 註冊的實例
    let deferredPrompt; // 用於保存 PWA 安裝提示事件
    const localStorageKeyForNotificationPrompt = 'hasUserBeenPromptedForNotifications';


    // --- 設定面板 DOM 元素 (從傳入的 domElements 參數中解構) ---
    const {
        settingsBtn,
        settingsPanel,
        closeSettingsBtn,
        notificationToggleSwitch,
        themeToggleSwitch,
        clearCacheBtn,
        overlay,
        notificationLabel,
        customInstallPromptOverlay,
        notificationConfirmationModalOverlay,
        notificationConfirmationModal,
        permissionDeniedModalOverlay,
        permissionDeniedModal
    } = domElements;


    // --- 輔助函數 ---
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
        return isInIframe(); // 簡化判斷：如果在 iframe 里就認為是沙箱
    }

    // 检测是否为 Apple 设备 (iPhone/iPad/iPod)
    function isAppleMobileDevice() {
        return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // 检测是否为 macOS 上的 Safari 浏览器
    function isMacSafari() {
        return navigator.userAgent.includes('Macintosh') && navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Edge');
    }

    // 检测当前页面是否運行在官方域名上
    function isOfficialOrigin() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return true;
        }
        return window.location.href.startsWith(OFFICIAL_PWA_ORIGIN + PWA_SUB_PATH);
    }
    
    // 將 Base64 字符串轉換為 Uint8Array
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

    // --- PWA 動態安裝提示彈窗邏輯 ---
    function showCustomInstallPrompt(type = 'default') {
        console.log(`[PWA Prompt] Showing custom install prompt, type: ${type}`);
        if (!isOfficialOrigin() || isSandboxed()) {
            console.warn('[PWA Prompt] 非官方網域或沙箱環境，不顯示安裝提示。');
            return;
        }

        if (!customInstallPromptOverlay) {
             console.error("[PWA Prompt] customInstallPromptOverlay 元素不存在，請檢查 index.html。");
             return;
        }
        
        let promptDiv = customInstallPromptOverlay.querySelector('#customInstallPrompt');
        if (!promptDiv) {
            promptDiv = document.createElement('div');
            promptDiv.id = 'customInstallPrompt';
            promptDiv.classList.add('custom-prompt');
            customInstallPromptOverlay.appendChild(promptDiv);
        }

        if (document.body.classList.contains('dark-mode')) {
            promptDiv.style.backgroundColor = '#2c2c2c';
            promptDiv.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.1)';
        } else {
            promptDiv.style.backgroundColor = '#333';
            promptDiv.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5)';
        }

        let contentHTML = '';
        let buttonsHTML = '';

        if (type === 'ios') {
            const PWA_BASE_URL = window.location.origin + PWA_SUB_PATH;
            const SHARE_ICON_PATH = `${PWA_BASE_URL}/icons/ios分享icon.jpg`; 
            const ADD_TO_HOMESCREEN_ICON_PATH = `${PWA_BASE_URL}/icons/ios加到主畫面icon.jpg`; 

            contentHTML = `
                <p style="margin: 0; font-weight: bold;">安裝濟公報應用程式</p>
                <p style="margin: 0; font-size: 0.95em; opacity: 0.9;">請點擊瀏覽器底部的
                    <strong style="font-size:1.1em;">分享按鈕</strong>
                    (<img src="${SHARE_ICON_PATH}" alt="分享圖示">)，
                    接著選擇「<strong style="font-size:1.1em;">加入主畫面</strong>」
                    (<img src="${ADD_TO_HOMESCREEN_ICON_PATH}" alt="加到主畫面圖示">)
                    即可安裝應用程式。
                </p>
                <p style="margin: 0; font-size: 0.85em; opacity: 0.7;">（若無此選項，請更新您的 iOS 系統或嘗試其他瀏覽器）</p>
            `;
            buttonsHTML = `
                <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
                    <button id="iosDismissButton">不再提示</button>
                </div>
            `;
        } else { // default for Android/Desktop Chrome/Edge
            contentHTML = `
                <p style="margin: 0;">希望每天自動收到濟公報更新嗎？</p>
                <p style="margin: 0; font-size: 0.9em; opacity: 0.8;">安裝應用程式以獲取最佳體驗和推播通知！</p>
            `;
            buttonsHTML = `
                <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
                    <button id="customInstallAppButton">立即安裝</button>
                </div>
            `;
        }

        promptDiv.innerHTML = `
            ${contentHTML}
            ${buttonsHTML}
            <button id="customCancelInstallButton" class="close-button">×</button>
        `;

        const customInstallAppButton = promptDiv.querySelector('#customInstallAppButton');
        const customCancelInstallButton = promptDiv.querySelector('#customCancelInstallButton');
        const iosDismissButton = promptDiv.querySelector('#iosDismissButton'); 

        if (customInstallAppButton) {
            customInstallAppButton.onclick = async () => {
                console.log('[PWA Prompt] Custom Install App button clicked.');
                hideInstallPrompt();
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log(`[PWA Prompt] User response to the install prompt: ${outcome}`);
                    deferredPrompt = null;
                }
            };
        }

        if (iosDismissButton) { 
            iosDismissButton.onclick = () => {
                console.log('[PWA Prompt] iOS Dismiss button clicked.');
                localStorage.setItem('hasSeenAppleInstallPrompt', 'dismissed');
                hideInstallPrompt();
            };
        }

        if (customCancelInstallButton) {
            customCancelInstallButton.onclick = () => {
                console.log('[PWA Prompt] Custom Cancel Install button clicked.');
                hideInstallPrompt();
            };
        }

        customInstallPromptOverlay.style.display = 'flex';
        requestAnimationFrame(() => {
            customInstallPromptOverlay.classList.add('visible');
        });
    }

    function hideInstallPrompt() {
        console.log('[PWA Prompt] Hiding install prompt.');
        const promptDiv = customInstallPromptOverlay.querySelector('#customInstallPrompt');
        if (customInstallPromptOverlay && promptDiv) {
            customInstallPromptOverlay.classList.remove('visible');

            customInstallPromptOverlay.addEventListener('transitionend', function handler() {
                customInstallPromptOverlay.style.display = 'none';
                if (promptDiv.parentNode) promptDiv.remove();
                customInstallPromptOverlay.removeEventListener('transitionend', handler);
            }, { once: true });
        }
    }

    // --- 通知權限確認模態框邏輯 (用於 default 權限狀態時的確認) ---
    function showNotificationConfirmationModal() {
        console.log('[Notification Modal] Showing confirmation modal.');
        if (!notificationConfirmationModalOverlay || !notificationConfirmationModal) {
            console.error("[Notification Modal] Notification confirmation modal elements not found in DOM.");
            return;
        }

        if (document.body.classList.contains('dark-mode')) {
            notificationConfirmationModal.style.backgroundColor = '#2c2c2c';
            notificationConfirmationModal.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.1)';
        } else {
            notificationConfirmationModal.style.backgroundColor = '#333';
            notificationConfirmationModal.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5)';
        }

        notificationConfirmationModalOverlay.style.display = 'flex';
        requestAnimationFrame(() => {
            notificationConfirmationModalOverlay.classList.add('visible');
        });

        const confirmBtn = notificationConfirmationModal.querySelector('#confirmEnableNotificationsButton');
        const cancelBtn = notificationConfirmationModal.querySelector('#cancelEnableNotificationsButton');
        const closeXBtn = notificationConfirmationModal.querySelector('#notificationConfirmationCloseXButton');

        const handleConfirm = async () => {
            console.log('[Notification Modal] "開啟通知" button clicked. Proceeding to request permission.');
            hideNotificationConfirmationModal();
            await requestPermissionAndPerformSubscription();
        };

        const handleCancel = () => {
            console.log('[Notification Modal] "取消" button clicked.');
            hideNotificationConfirmationModal();
            if (notificationToggleSwitch) {
                // 確保用戶取消時，開關回到 false，並更新 UI
                notificationToggleSwitch.checked = false;
                updateNotificationToggleSwitchUI(false, Notification.permission);
            }
        };
        
        if (confirmBtn) { confirmBtn.removeEventListener('click', handleConfirm); confirmBtn.addEventListener('click', handleConfirm); }
        if (cancelBtn) { cancelBtn.removeEventListener('click', handleCancel); cancelBtn.addEventListener('click', handleCancel); }
        if (closeXBtn) { closeXBtn.removeEventListener('click', handleCancel); closeXBtn.addEventListener('click', handleCancel); }
    }

    function hideNotificationConfirmationModal() {
        console.log('[Notification Modal] Hiding confirmation modal.');
        if (!notificationConfirmationModalOverlay || !notificationConfirmationModal) return;

        notificationConfirmationModalOverlay.classList.remove('visible');

        notificationConfirmationModalOverlay.addEventListener('transitionend', function handler() {
            notificationConfirmationModalOverlay.style.display = 'none';
            notificationConfirmationModalOverlay.removeEventListener('transitionend', handler);
        }, { once: true });
    }

    // --- 通知權限被拒絕時的指導模態框邏輯 ---
    function showPermissionDeniedGuidanceModal() {
        console.log('[Permission Denied Modal] Showing guidance modal.');
        if (!permissionDeniedModalOverlay || !permissionDeniedModal) {
            console.error("[Permission Denied Modal] Permission denied modal elements not found in DOM.");
            return;
        }

        if (document.body.classList.contains('dark-mode')) {
            permissionDeniedModal.style.backgroundColor = '#2c2c2c';
            permissionDeniedModal.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.1)';
        } else {
            permissionDeniedModal.style.backgroundColor = '#333';
            permissionDeniedModal.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5)';
        }

        permissionDeniedModalOverlay.style.display = 'flex';
        requestAnimationFrame(() => {
            permissionDeniedModalOverlay.classList.add('visible');
        });

        const closeBtn = permissionDeniedModal.querySelector('#permissionDeniedCloseButton');
        const closeXBtn = permissionDeniedModal.querySelector('#permissionDeniedCloseXButton');
        
        const closeHandler = () => {
            console.log('[Permission Denied Modal] Close button clicked.');
            hidePermissionDeniedGuidanceModal();
        };

        if (closeBtn) { closeBtn.removeEventListener('click', closeHandler); closeBtn.addEventListener('click', closeHandler); }
        if (closeXBtn) { closeXXBtn.removeEventListener('click', closeHandler); closeXBtn.addEventListener('click', closeHandler); }
    }

    function hidePermissionDeniedGuidanceModal() {
        console.log('[Permission Denied Modal] Hiding guidance modal.');
        if (!permissionDeniedModalOverlay || !permissionDeniedModal) return;

        permissionDeniedModalOverlay.classList.remove('visible');

        permissionDeniedModalOverlay.addEventListener('transitionend', function handler() {
            permissionDeniedModalOverlay.style.display = 'none';
            permissionDeniedModalOverlay.removeEventListener('transitionend', handler);
        }, { once: true });
    }

    // --- UI 狀態更新 ---
    function updateNotificationToggleSwitchUI(isSubscribed, permissionState) {
        console.log(`[UI Update] Updating notification toggle. isSubscribed: ${isSubscribed}, permissionState: ${permissionState}`);
        if (!notificationToggleSwitch || !notificationLabel) {
            console.error("[UI Update] Toggle switch elements not found for UI update.");
            return;
        }
        
        notificationToggleSwitch.disabled = false; // 預設啟用，先假設可以點擊
        notificationLabel.textContent = '推播通知'; // 重置標籤文本

        if (!isOfficialOrigin() || isSandboxed() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            notificationToggleSwitch.disabled = true;
            notificationToggleSwitch.checked = false; // 確保關閉狀態
            notificationToggleSwitch.title = '此環境不支持推播通知或非官方來源。請前往完整版網站。';
            console.warn('[UI Update] Notification not supported in this environment. Toggle disabled.');
            return;
        }
        
        if (permissionState === 'denied') {
            notificationToggleSwitch.disabled = true; // 明確設置為禁用
            notificationToggleSwitch.checked = false; // 確保關閉狀態
            notificationToggleSwitch.title = '您已拒絕通知權限。請在瀏覽器設定中手動啟用。';
            console.log('[UI Update] Notification permission denied, toggle disabled. Permission state: DENIED');
        } else { // permissionState is 'granted' or 'default'
            notificationToggleSwitch.disabled = false; // 明確設置為啟用
            notificationToggleSwitch.checked = isSubscribed; // 設置開關狀態
            if (isSubscribed) {
                notificationToggleSwitch.title = '推播通知已開啟。點擊以關閉。';
                console.log('[UI Update] Notification subscribed, toggle is ON. Permission state: GRANTED');
            } else {
                notificationToggleSwitch.title = '推播通知已關閉。點擊以開啟。';
                console.log('[UI Update] Notification not subscribed, toggle is OFF. Permission state: GRANTED/DEFAULT');
            }
        }
    }
    
    function updateThemeToggleSwitchUI() {
        if (!themeToggleSwitch) return;
        const isDark = document.body.classList.contains("dark-mode");
        themeToggleSwitch.checked = isDark;
        themeToggleSwitch.title = isDark ? "點擊切換為淺色模式" : "點擊切換為深色模式";
        console.log(`[UI Update] Theme toggle updated. Dark mode: ${isDark}`);
    }

    async function checkSubscriptionAndUI() {
        console.log('[Subscription Check] Starting subscription check...');
        let subscription = null; 
        let permissionState = Notification.permission || 'default';

        try {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                // 等待 Service Worker 準備就緒
                const registration = await navigator.serviceWorker.ready;
                swRegistration = registration; // 確保 swRegistration 被賦值
                subscription = await swRegistration.pushManager.getSubscription();
                permissionState = Notification.permission;
                console.log(`[Subscription Check] Service Worker ready. Current permission: ${permissionState}, Subscription exists: ${!!subscription}`);
            } else {
                console.warn('[Subscription Check] Service Worker or PushManager not supported.');
            }
        } catch (error) { 
            console.error('[Subscription Check] Error checking subscription status:', error); 
            permissionState = 'error'; 
        } finally {
            updateNotificationToggleSwitchUI(!!subscription, permissionState);
            console.log('[Subscription Check] UI update completed.');
        }
    }

    // --- 推播邏輯 ---
    async function requestPermissionAndPerformSubscription() {
        console.log('[Subscription Flow] Initiating permission request and subscription...');
        
        // --- 核心修正: 確保 Service Worker 在這裡準備就緒 ---
        try {
            const registration = await navigator.serviceWorker.ready;
            swRegistration = registration; // 確保 swRegistration 更新為已就緒的 Service Worker
            console.log('[Subscription Flow] Service Worker is ready for subscription.');
        } catch (error) {
            console.error('[Subscription Flow] Service Worker failed to become ready:', error);
            alert('Service Worker 尚未準備好，無法訂閱。請重新載入頁面。');
            checkSubscriptionAndUI();
            return;
        }

        if (notificationToggleSwitch) notificationToggleSwitch.disabled = true;
        if (notificationLabel) notificationLabel.textContent = '推播通知 (處理中...)';
        console.log('[Subscription Flow] UI updated to processing state.');

        try {
            const permission = await Notification.requestPermission();
            console.log(`[Subscription Flow] Notification permission result: ${permission}`);
            
            if (permission !== 'granted') {
                console.warn('[Subscription Flow] 用戶在原生提示中拒絕了通知權限。');
                showPermissionDeniedGuidanceModal();
                return;
            }
            
            const vapidPublicKeyResponse = await fetch(`${BACKEND_BASE_URL}/api/vapid-public-key`);
            if (!vapidPublicKeyResponse.ok) throw new Error(`無法獲取 VAPID 公鑰: ${vapidPublicKeyResponse.statusText}`);
            const VAPID_PUBLIC_KEY = await vapidPublicKeyResponse.text();
            const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            console.log('[Subscription Flow] VAPID Public Key obtained.');
            
            const subscription = await swRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
            console.log('[Subscription Flow] Push subscription created:', subscription);

            const response = await fetch(`${BACKEND_BASE_URL}/api/subscribe`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(subscription) });

            if (response.ok) {
                alert('您已成功訂閱每日濟公報推播通知！');
                console.log('[Subscription Flow] Subscription sent to backend successfully.');
                
                if (swRegistration && swRegistration.active) {
                    console.log('[Subscription Flow] Sending welcome notification message to Service Worker...');
                    swRegistration.active.postMessage({ 
                        type: 'SEND_WELCOME_NOTIFICATION',
                        title: '感謝訂閱濟公報推播通知',
                        body: '明天早上將為您發出新的一則濟公報',
                    });
                }

                if ('periodicSync' in swRegistration) {
                    try {
                        await swRegistration.periodicSync.register('content-check', {
                            minInterval: 24 * 60 * 60 * 1000
                        });
                        console.log('[Subscription Flow] Periodic background sync registered successfully.');
                    } catch (e) {
                        console.warn('[Subscription Flow] Periodic background sync registration failed:', e);
                    }
                }
            } else {
                const err = await response.text();
                throw new Error(`訂閱失敗: ${err || '未知錯誤'}`);
            }
        } catch (error) {
            console.error('[Subscription Flow] Subscription or permission request failed:', error);
            alert(`訂閱或請求權限失敗: ${error.message}`);
            const sub = await (swRegistration ? swRegistration.pushManager.getSubscription() : null);
            if (sub) {
                console.log('[Subscription Flow] Attempting to unsubscribe from failed subscription.');
                await sub.unsubscribe();
            }
        } finally {
            console.log('[Subscription Flow] Finalizing subscription flow. Updating UI.');
            checkSubscriptionAndUI();
        }
    }

    async function subscribeUser() {
        console.log('[Subscribe User] Attempting to subscribe user.');
        if (!isOfficialOrigin() || isSandboxed() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            alert('此環境不支持推播通知。請前往完整版網站或將應用程式加入主畫面。');
            checkSubscriptionAndUI();
            return;
        }

        const currentPermission = Notification.permission;
        console.log(`[Subscribe User] Current notification permission: ${currentPermission}`);

        if (currentPermission === 'granted') {
            console.log('[Subscribe User] Permission already granted. Checking existing subscription.');
            // 由於 requestPermissionAndPerformSubscription 會等待 SW 就緒，
            // 這裡不再需要特別處理 swRegistration 未準備好的情況
            const subscription = await (swRegistration ? swRegistration.pushManager.getSubscription() : null);
            if (!subscription) {
                console.log('[Subscribe User] Permission granted but no active subscription found. Attempting to subscribe.');
                await requestPermissionAndPerformSubscription();
            } else {
                console.log('[Subscribe User] Already subscribed. No action needed.');
            }
        } else if (currentPermission === 'denied') {
            console.warn('[Subscribe User] Permission denied. Showing guidance modal.');
            showPermissionDeniedGuidanceModal();
        } else { // currentPermission === 'default'
            console.log('[Subscribe User] Permission default. Showing confirmation modal.');
            showNotificationConfirmationModal();
        }
        // Always ensure UI is updated after checking status
        checkSubscriptionAndUI();
    }
    
    async function unsubscribeUser() {
        console.log('[Unsubscribe User] Attempting to unsubscribe user.');
        // 在取消訂閱前，也等待 Service Worker 準備就緒，確保 swRegistration 有效
        try {
            const registration = await navigator.serviceWorker.ready;
            swRegistration = registration;
            console.log('[Unsubscribe User] Service Worker is ready for unsubscription.');
        } catch (error) {
            console.error('[Unsubscribe User] Service Worker failed to become ready for unsubscription:', error);
            alert('Service Worker 尚未準備好，無法取消訂閱。請重新載入頁面。');
            checkSubscriptionAndUI();
            return;
        }


        if (notificationToggleSwitch) notificationToggleSwitch.disabled = true;
        if (notificationLabel) notificationLabel.textContent = '推播通知 (處理中...)';
        console.log('[Unsubscribe User] UI updated to processing state.');

        if (!confirm('您確定要取消訂閱濟公報推播通知嗎？')) {
            console.log('[Unsubscribe User] Unsubscription cancelled by user.');
            checkSubscriptionAndUI();
            return;
        }
        
        try {
            const subscription = await swRegistration.pushManager.getSubscription();
            if (subscription) {
                console.log('[Unsubscribe User] Found existing subscription, sending unsubscribe to backend.');
                const response = await fetch(`${BACKEND_BASE_URL}/api/unsubscribe`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ endpoint: subscription.endpoint }) });
                if (!response.ok) console.error(`[Unsubscribe User] 後端取消訂閱失敗: ${await response.text()}`);
                
                await subscription.unsubscribe();
                alert('您已成功取消訂閱濟公報推播通知！');
                console.log('[Unsubscribe User] Local subscription successfully unsubscribed.');

                if ('periodicSync' in swRegistration) {
                    try {
                        await swRegistration.periodicSync.unregister('content-check');
                        console.log('[Unsubscribe User] Periodic background sync unregistered successfully.');
                    } catch (e) {
                        console.warn('[Unsubscribe User] Periodic background sync unregistration failed:', e);
                    }
                }
            } else {
                console.log('[Unsubscribe User] No active subscription found to unsubscribe.');
                alert('您當前沒有訂閱任何通知。');
            }
        } catch (error) {
            console.error('[Unsubscribe User] Unsubscription failed:', error);
            alert(`取消訂閱失敗: ${error.message}`);
        } finally {
            console.log('[Unsubscribe User] Finalizing unsubscription flow. Updating UI.');
            checkSubscriptionAndUI();
        }
    }

    // --- 事件處理與初始化 ---
    function handleNotificationToggleChange(event) {
        console.log(`[Event] Notification toggle changed. New state: ${event.target.checked}`);
        if (event.target.checked) subscribeUser(); else unsubscribeUser();
    }
    
    function toggleTheme() {
        console.log('[Event] Theme toggle changed.');
        document.body.classList.toggle("dark-mode");
        const isDark = document.body.classList.contains("dark-mode");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        updateThemeToggleSwitchUI();
        
        const customPromptDiv = customInstallPromptOverlay.querySelector('#customInstallPrompt');
        const modals = [
            customPromptDiv, 
            notificationConfirmationModal, 
            permissionDeniedModal
        ];

        modals.forEach(modal => {
            if (modal) {
                if (isDark) {
                    modal.style.backgroundColor = '#2c2c2c';
                    modal.style.boxShadow = '0 4px 10px rgba(255, 255, 255, 0.1)';
                } else {
                    modal.style.backgroundColor = '#333';
                    modal.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.3)';
                }
            }
        });
    }

    async function handleInitialScreenClick() {
        // 使用 once: true 確保只執行一次，並在執行後移除監聽器
        document.body.removeEventListener('click', handleInitialScreenClick);
        document.body.removeEventListener('touchstart', handleInitialScreenClick);
        console.log('[Initial Click] First screen click detected.');

        if (localStorage.getItem(localStorageKeyForNotificationPrompt) === 'true') {
            console.log('[Initial Click] User has been prompted before, skipping auto-prompt.');
            return;
        }

        // 不再在這裡檢查 swRegistration，因為 subscribeUser 會更可靠地等待 Service Worker。
        // if (!swRegistration) { /* ... */ } 
        
        const permissionState = Notification.permission;
        console.log(`[Initial Click] Notification permission state: ${permissionState}`);

        if (permissionState === 'default') {
            showNotificationConfirmationModal();
            localStorage.setItem(localStorageKeyForNotificationPrompt, 'true');
            console.log('[Initial Click] Permission default. Showing confirmation modal.');
        } else if (permissionState === 'denied') {
            showPermissionDeniedGuidanceModal();
            localStorage.setItem(localStorageKeyForNotificationPrompt, 'true');
            console.log('[Initial Click] Permission denied. Showing guidance modal.');
        } else if (permissionState === 'granted') {
            // 如果已是 granted，標記為已提示，避免下次點擊再次檢查
            localStorage.setItem(localStorageKeyForNotificationPrompt, 'true');
            console.log('[Initial Click] Permission already granted. No action needed.');
        }
    }
    
    function initializeFeatures() {
        console.log('[Init] Initializing PWA features...');
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('[Init] Service Worker 註冊成功:', registration);
                    // 這裡只是設定 swRegistration，但實際操作 Service Worker 應等待 ready 狀態
                    swRegistration = registration; 
                    // 在 Service Worker 註冊成功後，立即檢查訂閱狀態並更新 UI
                    // checkSubscriptionAndUI 內部會等待 navigator.serviceWorker.ready
                    checkSubscriptionAndUI(); 
                    if (notificationToggleSwitch) {
                        notificationToggleSwitch.removeEventListener('change', handleNotificationToggleChange);
                        notificationToggleSwitch.addEventListener('change', handleNotificationToggleChange);
                    }
                    
                    if ('permissions' in navigator && 'PushManager' in window) {
                        navigator.permissions.query({ name: 'notifications' }).then(notificationPerm => {
                            notificationPerm.onchange = () => {
                                console.log('[Init] 通知權限狀態已改變:', notificationPerm.state);
                                checkSubscriptionAndUI();
                            };
                        });
                    }

                })
                .catch(error => {
                    console.error('[Init] Service Worker 註冊失敗:', error);
                    if (notificationToggleSwitch) { notificationToggleSwitch.disabled = true; notificationToggleSwitch.checked = false; notificationToggleSwitch.title = '通知服務無法啟動。'; }
                });
        } else {
            console.warn('[Init] 您的瀏覽器不支持 Service Worker 或推播通知。');
            if (notificationToggleSwitch) { notificationToggleSwitch.disabled = true; notificationToggleSwitch.checked = false; notificationToggleSwitch.title = '您的瀏覽器不支持 Service Worker 或推播通知。'; }
        }
        
        // PWA 安裝提示邏輯
        if (isPWAInstalled() || isSandboxed() || !isOfficialOrigin()) {
            console.log(`[Init] PWA install prompt skipped. Installed: ${isPWAInstalled()}, Sandboxed: ${isSandboxed()}, Official Origin: ${isOfficialOrigin()}`);
        } else {
            if (isAppleMobileDevice() || isMacSafari()) {
                console.log('[Init] 偵測到 Apple 裝置，準備顯示安裝指南。');
                const hasSeenInstallPrompt = localStorage.getItem('hasSeenAppleInstallPrompt');
                if (hasSeenInstallPrompt !== 'dismissed') { 
                    setTimeout(() => {
                        showCustomInstallPrompt('ios');
                        if (localStorage.getItem('hasSeenAppleInstallPrompt') !== 'dismissed') {
                             localStorage.setItem('hasSeenAppleInstallPrompt', 'true'); 
                        }
                    }, 3000);
                }
            } else {
                window.addEventListener('beforeinstallprompt', (e) => {
                    e.preventDefault();
                    deferredPrompt = e;
                    console.log('[Init] beforeinstallprompt 事件已保存。');
                    showCustomInstallPrompt('default');
                });

                window.addEventListener('appinstalled', () => {
                    console.log('[Init] PWA 已成功安裝！');
                    hideInstallPrompt();
                    deferredPrompt = null;
                    checkSubscriptionAndUI();
                });
            }
        }
    }
    
    // --- 腳本執行起點 (由 index.html 的 DOMContentLoaded 觸發) ---
    console.log('[Main Init] DOMContentLoaded event fired.');

    // 1. 初始化主題
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme === "dark") document.body.classList.add("dark-mode");
    updateThemeToggleSwitchUI();

    // 2. 初始化所有 PWA 相關功能 (Service Worker 註冊、安裝提示等)
    initializeFeatures();

    // 3. 綁定設定面板的開關事件
    function openSettingsPanel() {
        console.log('[Settings] Opening settings panel.');
        settingsPanel.classList.add('is-open');
        overlay.classList.add('is-visible');
        document.body.style.overflow = 'hidden';
        checkSubscriptionAndUI(); // 打開設定面板時更新推播狀態
        updateThemeToggleSwitchUI();
    }

    function closeSettingsPanel() {
        console.log('[Settings] Closing settings panel.');
        settingsPanel.classList.remove('is-open');
        overlay.classList.remove('is-visible');
        document.body.style.overflow = '';
    }

    if (settingsBtn) settingsBtn.addEventListener('click', openSettingsPanel);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsPanel); 
    if (overlay) overlay.addEventListener('click', closeSettingsPanel);

    // 4. 綁定清除緩存按鈕事件
    if (clearCacheBtn) clearCacheBtn.addEventListener('click', async () => {
        console.log('[Cache Clear] Clear cache button clicked.');
        // --- UPDATED CONFIRMATION MESSAGE ---
        if (!confirm('您確定要清除網站緩存嗎？這將重新載入頁面並清除所有儲存的資料（包括推播訂閱狀態、主題設定、搜尋歷史等）。')) return;
        
        clearCacheBtn.textContent = '清除中...'; 
        clearCacheBtn.disabled = true;

        try {
            // 1. 取消 Service Worker 訂閱並取消註冊 Service Worker
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let reg of regs) {
                    if (reg.active) {
                        try {
                            const subscription = await reg.pushManager.getSubscription();
                            if (subscription) {
                                console.log('[Cache Clear] Notifying backend of unsubscription before unregistering SW.');
                                await fetch(`${BACKEND_BASE_URL}/api/unsubscribe`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ endpoint: subscription.endpoint })
                                }).catch(e => console.warn('[Cache Clear] Failed to notify backend of unsubscription before unregistering SW:', e));
                            }
                        } catch (e) {
                            console.warn('[Cache Clear] Failed to get subscription before unregistering SW:', e);
                        }
                    }
                    await reg.unregister();
                    console.log(`[Cache Clear] Service Worker at ${reg.scope} unregistered.`);
                }
            }

            // 2. 清除 Cache Storage (Cache API)
            if ('caches' in window) {
                const keys = await caches.keys();
                for (let key of keys) {
                    await caches.delete(key);
                    console.log(`[Cache Clear] Cache "${key}" deleted.`);
                }
            }

            // 3. 清除 Local Storage
            if ('localStorage' in window) {
                localStorage.clear();
                console.log('[Cache Clear] Local Storage cleared.');
            }

            // 4. 清除 IndexedDB (所有資料庫)
            if ('indexedDB' in window) {
                let dbNames = [];
                // 嘗試獲取所有 IndexedDB 資料庫名稱 (部分瀏覽器可能不支持此方法，例如 Safari)
                if (indexedDB.databases) { 
                    try {
                        const databases = await indexedDB.databases();
                        dbNames = databases.map(db => db.name);
                    } catch (e) {
                        console.warn('[Cache Clear] indexedDB.databases() failed or is not supported:', e);
                        // 如果 `indexedDB.databases()` 不支持或失敗，手動添加您應用可能使用的 IndexedDB 名稱
                        // 範例：如果您的應用程式有使用名為 '濟公報_posts' 的 IndexedDB
                        // dbNames.push('濟公報_posts'); 
                    }
                } else {
                    console.warn('[Cache Clear] indexedDB.databases() is not available. Manual IndexedDB names might be needed.');
                    // 如果您的應用程式有任何固定的 IndexedDB 名稱，可以在此處手動添加以確保清除
                    // dbNames.push('your_app_db_name_1');
                    // dbNames.push('your_app_db_name_2');
                }

                for (const dbName of dbNames) {
                    await new Promise((resolve, reject) => {
                        const deleteRequest = indexedDB.deleteDatabase(dbName);
                        deleteRequest.onsuccess = () => {
                            console.log(`[Cache Clear] IndexedDB "${dbName}" deleted.`);
                            resolve();
                        };
                        deleteRequest.onerror = (event) => {
                            console.error(`[Cache Clear] Failed to delete IndexedDB "${dbName}":`, event.target.error);
                            // 即使刪除失敗，也繼續進行下一個資料庫的清除，避免阻塞
                            resolve(); 
                        };
                        deleteRequest.onblocked = (event) => {
                            console.warn(`[Cache Clear] IndexedDB "${dbName}" deletion blocked. This usually means the database is open in another tab. Please close all tabs for this site.`, event);
                            // 即使阻塞，也繼續進行下一個資料庫的清除
                            resolve(); 
                        };
                    });
                }
            }

            // 清除與 PWA 提示和主題相關的特定 Local Storage 鍵（由 pwa-notifications.js 管理）
            // 這些應在 localStorage.clear() 之後執行，如果 localStorage.clear() 執行，這些是冗餘的
            // 但為了防止 localStorage.clear() 未來因為某些原因被移除，保留這些特定清除邏輯作為備份
            localStorage.removeItem(localStorageKeyForNotificationPrompt);
            localStorage.removeItem('hasSeenAppleInstallPrompt'); 
            localStorage.removeItem('theme'); 

            alert('網站緩存及所有儲存資料已清除！頁面將重新載入。'); 
            window.location.reload(true); // 重新載入頁面，使用 true 強制從伺服器獲取
        } catch (error) {
            console.error('[Cache Clear] 清除緩存失敗:', error); 
            alert('清除緩存失敗。');
            clearCacheBtn.textContent = '立即清除'; 
            clearCacheBtn.disabled = false;
        }
    });

    // 5. 綁定主題切換開關事件
    if (themeToggleSwitch) themeToggleSwitch.addEventListener('change', toggleTheme);

    // 6. 綁定隱藏按鈕 (全螢幕點擊) 事件
    // 在這裡不使用 { once: true }，因為 handleInitialScreenClick 內部會移除監聽器
    // 這確保了如果初始化時 Service Worker 未準備好，用戶再次點擊仍有機會觸發。
    document.body.addEventListener('click', handleInitialScreenClick);
    document.body.addEventListener('touchstart', handleInitialScreenClick);
} // End of initializePwaLogic function

// Expose the initializePwaLogic function globally so index.html can call it
window.initializePwaLogic = initializePwaLogic;