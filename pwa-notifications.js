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
 * @param {HTMLElement} domElements.customConfirmModalOverlay
 * @param {HTMLElement} domElements.customAlertModalOverlay
 */
function initializePwaLogic(domElements) {
    // --- PWA 設定常數 ---
    // !!! 請在這裡替換為你的 Render 後端實際 URL !!!
    const BACKEND_BASE_URL = 'https://jigong-news-backend.onrender.com'; // 替換為你的後端 API 基礎 URL

    // !!! 請在這裡替換為你的 PWA 實際部署的公開網域 (例如 GitHub Pages 的網域) !!!
    const OFFICIAL_PWA_ORIGIN = 'https://wang-wei-hao.github.io'; 

    // 如果你的 PWA 部署在子路徑下 (例如: https://yourusername.github.io/your-repo-name/)
    // !!! 本地開發時，請將此處設為 '' (空字串) !!!
    // !!! 部署到 GitHub Pages 等子路徑時，請設為 '/your-repo-name'，例如 '/jigong-news' !!!
    const PWA_SUB_PATH = '/jigong-news'; // <--- 已修改為本地開發的正確路徑！

    // --- 狀態變數 ---
    let swRegistration = null; // 用於保存 Service Worker 註冊的實例
    let deferredPrompt; // 用於保存 PWA 安裝提示事件
    const localStorageKeyForNotificationPrompt = 'hasUserBeenPromptedForNotifications';


    // --- 設定面板 DOM 元素 (從傳入的 domElements 參數中解構) ---
    const {
        settingsBtn,
        settingsPanel,
        closeSettingsBtn,
        notificationToggleSwitch, // 這是推播通知的開關 (checkbox)
        themeToggleSwitch,
        clearCacheBtn,
        overlay,
        notificationLabel,
        customInstallPromptOverlay,
        notificationConfirmationModalOverlay,
        notificationConfirmationModal,
        permissionDeniedModalOverlay,
        permissionDeniedModal,
        // 新增：解構通用模態框元素
        customConfirmModalOverlay,
        customAlertModalOverlay,
    } = domElements;

    // 驗證關鍵 DOM 元素是否存在，如果不存在，則發出錯誤並停止功能
    if (!notificationToggleSwitch || !notificationLabel || !customInstallPromptOverlay || !notificationConfirmationModalOverlay || !permissionDeniedModalOverlay || !settingsPanel || !overlay || !customConfirmModalOverlay || !customAlertModalOverlay) {
        console.error("Critical DOM elements for PWA logic are missing. PWA features might not work correctly.");
        // 如果缺少主要元素，可以選擇禁用某些功能或顯示警告
        if (notificationToggleSwitch) notificationToggleSwitch.disabled = true;
        if (clearCacheBtn) clearCacheBtn.disabled = true;
        return; // 終止初始化
    }

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

    // 检测是否為 macOS 上的 Safari 浏览器
    function isMacSafari() {
        return navigator.userAgent.includes('Macintosh') && navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Edge');
    }

    // 检测当前页面是否運行在官方域名上
    function isOfficialOrigin() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return true;
        }
        // 使用 startsWith 檢查子路徑部署
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

        // 模態框容器已經存在於 index.html，不再動態創建
        customInstallPromptOverlay.style.display = 'flex';
        
        let promptDiv = customInstallPromptOverlay.querySelector('#customInstallPrompt');
        if (!promptDiv) {
            // 如果 customInstallPrompt 元素不存在 (例如，初次載入或被清除)，則創建它
            promptDiv = document.createElement('div');
            promptDiv.id = 'customInstallPrompt';
            promptDiv.classList.add('custom-prompt'); // 使用 CSS 定義的樣式
            customInstallPromptOverlay.appendChild(promptDiv);
        }

        // 移除內聯樣式設定，讓 CSS 規則生效
        promptDiv.style.backgroundColor = ''; 
        promptDiv.style.boxShadow = ''; 

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

        // 移除舊的監聽器並添加新的，以避免重複
        if (customInstallAppButton) {
            customInstallAppButton.onclick = null; // 清除舊的 inline handler
            customInstallAppButton.addEventListener('click', async () => {
                console.log('[PWA Prompt] Custom Install App button clicked.');
                hideInstallPrompt();
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log(`[PWA Prompt] User response to the install prompt: ${outcome}`);
                    deferredPrompt = null;
                }
            }, { once: true }); // 確保只觸發一次
        }

        if (iosDismissButton) { 
            iosDismissButton.onclick = null; // 清除舊的 inline handler
            iosDismissButton.addEventListener('click', () => {
                console.log('[PWA Prompt] iOS Dismiss button clicked.');
                localStorage.setItem('hasSeenAppleInstallPrompt', 'dismissed');
                hideInstallPrompt();
            }, { once: true });
        }

        if (customCancelInstallButton) {
            customCancelInstallButton.onclick = null; // 清除舊的 inline handler
            customCancelInstallButton.addEventListener('click', () => {
                console.log('[PWA Prompt] Custom Cancel Install button clicked.');
                hideInstallPrompt();
            }, { once: true });
        }

        // 使用 classList.add('visible') 觸發 CSS 過渡
        requestAnimationFrame(() => {
            customInstallPromptOverlay.classList.add('visible');
        });
    }

    function hideInstallPrompt() {
        console.log('[PWA Prompt] Hiding install prompt.');
        if (!customInstallPromptOverlay) return; // 確保元素存在
        
        customInstallPromptOverlay.classList.remove('visible');
        
        customInstallPromptOverlay.addEventListener('transitionend', function handler() {
            customInstallPromptOverlay.style.display = 'none';
            customInstallPromptOverlay.removeEventListener('transitionend', handler);
            // 清理動態添加的 promptDiv，防止每次打開都疊加
            const promptDiv = customInstallPromptOverlay.querySelector('#customInstallPrompt');
            if (promptDiv && promptDiv.parentNode === customInstallPromptOverlay) {
                promptDiv.remove();
            }
        }, { once: true });
    }

    // --- 通知權限確認模態框邏輯 (用於 default 權限狀態時的確認) ---
    function showNotificationConfirmationModal() {
        console.log('[Notification Modal] Showing confirmation modal.');
        // 模態框容器已經存在於 index.html，不再動態創建
        notificationConfirmationModalOverlay.style.display = 'flex';
        
        // 移除內聯樣式設定，讓 CSS 規則生效
        notificationConfirmationModal.style.backgroundColor = ''; 
        notificationConfirmationModal.style.boxShadow = ''; 

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
                // 確保用戶取消時，開關回到 false，並更新UI
                notificationToggleSwitch.checked = false;
                updateNotificationToggleSwitchUI(false, Notification.permission);
            }
        };
        
        // 確保事件監聽器只被添加一次
        if (confirmBtn) { confirmBtn.removeEventListener('click', handleConfirm); confirmBtn.addEventListener('click', handleConfirm, { once: true }); }
        if (cancelBtn) { cancelBtn.removeEventListener('click', handleCancel); cancelBtn.addEventListener('click', handleCancel, { once: true }); }
        if (closeXBtn) { closeXBtn.removeEventListener('click', handleCancel); closeXBtn.addEventListener('click', handleCancel, { once: true }); }
    }

    function hideNotificationConfirmationModal() {
        console.log('[Notification Modal] Hiding confirmation modal.');
        if (!notificationConfirmationModalOverlay) return;

        notificationConfirmationModalOverlay.classList.remove('visible');

        notificationConfirmationModalOverlay.addEventListener('transitionend', function handler() {
            notificationConfirmationModalOverlay.style.display = 'none';
            // 移除一次性事件監聽器
            this.removeEventListener('transitionend', handler);
        }, { once: true });
    }

    // --- 通知權限被拒絕時的指導模態框邏輯 ---
    function showPermissionDeniedGuidanceModal() {
        console.log('[Permission Denied Modal] Showing guidance modal.');
        // 模態框容器已經存在於 index.html，不再動態創建
        permissionDeniedModalOverlay.style.display = 'flex';
        
        // 移除內聯樣式設定，讓 CSS 規則生效
        permissionDeniedModal.style.backgroundColor = ''; 
        permissionDeniedModal.style.boxShadow = ''; 

        requestAnimationFrame(() => {
            permissionDeniedModalOverlay.classList.add('visible');
        });

        const closeBtn = permissionDeniedModal.querySelector('#permissionDeniedCloseButton');
        const closeXBtn = permissionDeniedModal.querySelector('#permissionDeniedCloseXButton');
        
        const closeHandler = () => {
            console.log('[Permission Denied Modal] Close button clicked.');
            hidePermissionDeniedGuidanceModal();
        };

        // 確保事件監聽器只被添加一次
        if (closeBtn) { closeBtn.removeEventListener('click', closeHandler); closeBtn.addEventListener('click', closeHandler, { once: true }); }
        // 修正這裡的打字錯誤：closeXXBtn -> closeXBtn
        if (closeXBtn) { closeXBtn.removeEventListener('click', closeHandler); closeXBtn.addEventListener('click', closeHandler, { once: true }); }
    }

    function hidePermissionDeniedGuidanceModal() {
        console.log('[Permission Denied Modal] Hiding guidance modal.');
        if (!permissionDeniedModalOverlay) return;

        permissionDeniedModalOverlay.classList.remove('visible');

        permissionDeniedModalOverlay.addEventListener('transitionend', function handler() {
            permissionDeniedModalOverlay.style.display = 'none';
            // 移除一次性事件監聽器
            this.removeEventListener('transitionend', handler);
        }, { once: true });
    }

    // === 新增：通用確認模態框函數 (取代 confirm()) ===
    function showCustomConfirm(message) {
        return new Promise((resolve) => {
            const okButton = customConfirmModalOverlay.querySelector('#customConfirmOkButton');
            const cancelButton = customConfirmModalOverlay.querySelector('#customConfirmCancelButton');
            const messageEl = customConfirmModalOverlay.querySelector('#customConfirmMessage');

            messageEl.textContent = message;

            const handleOk = () => {
                hide();
                resolve(true);
            };

            const handleCancel = () => {
                hide();
                resolve(false);
            };

            okButton.removeEventListener('click', handleOk);
            cancelButton.removeEventListener('click', handleCancel);

            okButton.addEventListener('click', handleOk, { once: true });
            cancelButton.addEventListener('click', handleCancel, { once: true });

            customConfirmModalOverlay.style.display = 'flex';
            requestAnimationFrame(() => {
                customConfirmModalOverlay.classList.add('visible');
            });

            function hide() {
                customConfirmModalOverlay.classList.remove('visible');
                customConfirmModalOverlay.addEventListener('transitionend', function handler() {
                    customConfirmModalOverlay.style.display = 'none';
                    this.removeEventListener('transitionend', handler);
                }, { once: true });
            }
        });
    }

    // === 新增：通用提示模態框函數 (取代 alert()) ===
    function showCustomAlert(message) {
        return new Promise((resolve) => {
            const okButton = customAlertModalOverlay.querySelector('#customAlertOkButton');
            const messageEl = customAlertModalOverlay.querySelector('#customAlertMessage');

            messageEl.textContent = message;

            const handleOk = () => {
                hide();
                resolve();
            };
            
            okButton.removeEventListener('click', handleOk);
            okButton.addEventListener('click', handleOk, { once: true });

            customAlertModalOverlay.style.display = 'flex';
            requestAnimationFrame(() => {
                customAlertModalOverlay.classList.add('visible');
            });

            function hide() {
                customAlertModalOverlay.classList.remove('visible');
                customAlertModalOverlay.addEventListener('transitionend', function handler() {
                    customAlertModalOverlay.style.display = 'none';
                    this.removeEventListener('transitionend', handler);
                }, { once: true });
            }
        });
    }


    // --- UI 狀態更新 ---
    function updateNotificationToggleSwitchUI(isSubscribed, permissionState) {
        console.log(`[UI Update] Updating notification toggle. isSubscribed: ${isSubscribed}, permissionState: ${permissionState}`);
        
        // 預設啟用，先假設可以點擊
        notificationToggleSwitch.disabled = false; 
        notificationLabel.textContent = '推播通知'; // 重置標籤文本

        // 1. 環境不支持或非官方來源
        if (!isOfficialOrigin() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            notificationToggleSwitch.disabled = true;
            notificationToggleSwitch.checked = false; // 確保關閉狀態
            notificationToggleSwitch.title = '此環境不支持推播通知或非官方來源。';
            notificationLabel.textContent = '推播通知 (不支持)'; // 更好的提示
            console.warn('[UI Update] Notification not supported/official. Toggle disabled.');
            return;
        }

        // 2. 沙箱環境（例如嵌入的 iframe）
        if (isSandboxed()) {
            notificationToggleSwitch.disabled = true;
            notificationToggleSwitch.checked = false;
            notificationToggleSwitch.title = '您正在受限環境中。請前往完整網站。';
            notificationLabel.textContent = '推播通知 (沙箱)';
            console.warn('[UI Update] Sandboxed environment. Toggle disabled.');
            return;
        }
        
        // 3. 通知權限被拒絕
        if (permissionState === 'denied') {
            notificationToggleSwitch.disabled = true; // 明確設置為禁用
            notificationToggleSwitch.checked = false; // 確保關閉狀態
            notificationToggleSwitch.title = '您已拒絕通知權限。請在瀏覽器設定中手動啟用。';
            notificationLabel.textContent = '推播通知 (已拒絕)';
            console.log('[UI Update] Notification permission denied, toggle disabled. Permission state: DENIED');
        } 
        // 4. 通知權限已允許或未決定
        else { 
            notificationToggleSwitch.disabled = false; // 明確設置為啟用
            notificationToggleSwitch.checked = isSubscribed; // 設置開關狀態
            // notificationLabel.textContent 這裡不需再設置，交給 CSS
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
            permissionState = 'error'; // 標記為錯誤狀態
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
            await showCustomAlert('Service Worker 尚未準備好，無法訂閱。請重新載入頁面。');
            checkSubscriptionAndUI();
            return;
        }

        // 設置開關為處理中狀態
        if (notificationToggleSwitch) notificationToggleSwitch.disabled = true;
        if (notificationLabel) notificationLabel.textContent = '推播通知 (處理中...)';
        console.log('[Subscription Flow] UI updated to processing state.');

        try {
            const permission = await Notification.requestPermission();
            console.log(`[Subscription Flow] Notification permission result: ${permission}`);
            
            if (permission !== 'granted') {
                console.warn('[Subscription Flow] 用戶在原生提示中拒絕了通知權限。');
                showPermissionDeniedGuidanceModal(); // 顯示指導模態框
                return; // 終止訂閱流程
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
                await showCustomAlert('您已成功訂閱每日濟公報推播通知！');
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
            await showCustomAlert(`訂閱或請求權限失敗: ${error.message}`);
            // 如果訂閱失敗，嘗試取消任何可能已建立的部分訂閱
            const sub = await (swRegistration ? swRegistration.pushManager.getSubscription() : null);
            if (sub) {
                console.log('[Subscription Flow] Attempting to unsubscribe from failed subscription.');
                await sub.unsubscribe();
            }
        } finally {
            console.log('[Subscription Flow] Finalizing subscription flow. Updating UI.');
            checkSubscriptionAndUI(); // 無論成功或失敗，都更新 UI
        }
    }

    async function subscribeUser() {
        console.log('[Subscribe User] Attempting to subscribe user.');
        // 環境檢查，如果不支持則提前退出
        if (!isOfficialOrigin() || isSandboxed() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            await showCustomAlert('此環境不支持推播通知。請前往完整版網站或將應用程式加入主畫面。');
            updateNotificationToggleSwitchUI(false, Notification.permission); // 確保 UI 更新為禁用狀態
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
                updateNotificationToggleSwitchUI(true, currentPermission); // 確保 UI 是開啟狀態
            }
        } else if (currentPermission === 'denied') {
            console.warn('[Subscribe User] Permission denied. Showing guidance modal.');
            showPermissionDeniedGuidanceModal(); // 顯示指導模態框
            updateNotificationToggleSwitchUI(false, currentPermission); // 確保 UI 更新為禁用狀態
        } else { // currentPermission === 'default'
            console.log('[Subscribe User] Permission default. Showing confirmation modal.');
            showNotificationConfirmationModal(); // 顯示確認模態框
        }
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
            await showCustomAlert('Service Worker 尚未準備好，無法取消訂閱。請重新載入頁面。');
            checkSubscriptionAndUI();
            return;
        }

        // 設置開關為處理中狀態
        if (notificationToggleSwitch) notificationToggleSwitch.disabled = true;
        if (notificationLabel) notificationLabel.textContent = '推播通知 (處理中...)';
        console.log('[Unsubscribe User] UI updated to processing state.');

        // 使用自定義確認模態框
        const confirmed = await showCustomConfirm('您確定要取消訂閱濟公報推播通知嗎？');
        if (!confirmed) {
            console.log('[Unsubscribe User] Unsubscription cancelled by user.');
            checkSubscriptionAndUI(); // 用戶取消，恢復 UI 狀態
            return;
        }
        
        try {
            const subscription = await swRegistration.pushManager.getSubscription();
            if (subscription) {
                console.log('[Unsubscribe User] Found existing subscription, sending unsubscribe to backend.');
                const response = await fetch(`${BACKEND_BASE_URL}/api/unsubscribe`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ endpoint: subscription.endpoint }) });
                if (!response.ok) console.error(`[Unsubscribe User] 後端取消訂閱失敗: ${await response.text()}`);
                
                await subscription.unsubscribe();
                await showCustomAlert('您已成功取消訂閱濟公報推播通知！');
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
                await showCustomAlert('您當前沒有訂閱任何通知。');
            }
        } catch (error) {
            console.error('[Unsubscribe User] Unsubscription failed:', error);
            await showCustomAlert(`取消訂閱失敗: ${error.message}`);
        } finally {
            console.log('[Unsubscribe User] Finalizing unsubscription flow. Updating UI.');
            checkSubscriptionAndUI(); // 無論成功或失敗，都更新 UI
        }
    }

    // --- 事件處理與初始化 ---
    function handleNotificationToggleChange(event) {
        console.log(`[Event] Notification toggle changed. New state: ${event.target.checked}`);
        if (event.target.checked) {
            subscribeUser(); 
        } else {
            unsubscribeUser();
        }
    }
    
    function toggleTheme() {
        console.log('[Event] Theme toggle changed.');
        document.body.classList.toggle("dark-mode");
        const isDark = document.body.classList.contains("dark-mode");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        updateThemeToggleSwitchUI();
        
        // 更新模態框主題 (如果它們是靜態存在的)
        const customPromptDiv = customInstallPromptOverlay.querySelector('#customInstallPrompt');
        const modals = [
            customPromptDiv, 
            notificationConfirmationModal, 
            permissionDeniedModal
        ];

        modals.forEach(modal => {
            if (modal) {
                // 清除內聯樣式，讓 CSS 規則生效
                modal.style.backgroundColor = ''; 
                modal.style.boxShadow = ''; 
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

        const permissionState = Notification.permission;
        console.log(`[Initial Click] Notification permission state: ${permissionState}`);

        if (permissionState === 'default') {
            // 如果 Service Worker 已就緒且用戶未被提示過，則彈出確認框
            try {
                await navigator.serviceWorker.ready; // 確保 Service Worker 準備好再彈框
                showNotificationConfirmationModal();
                localStorage.setItem(localStorageKeyForNotificationPrompt, 'true'); // 標記為已提示
                console.log('[Initial Click] Permission default. Showing confirmation modal.');
            } catch (e) {
                console.warn('[Initial Click] Service Worker not ready for initial prompt, skipping:', e);
            }
        } else if (permissionState === 'denied') {
            showPermissionDeniedGuidanceModal();
            localStorage.setItem(localStorageKeyForNotificationPrompt, 'true'); // 標記為已提示
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
                .then(function(registration) {
                    console.log('[Init] Service Worker 註冊成功，作用域: ', registration.scope);
                    swRegistration = registration; // 保存註冊實例
                    checkSubscriptionAndUI(); // 註冊成功後立即檢查訂閱狀態並更新 UI
                })
                .catch(function(error) {
                    console.error('Service Worker 註冊失敗:', error);
                    // 即使註冊失敗，也更新 UI 狀態
                    notificationToggleSwitch.disabled = true;
                    notificationToggleSwitch.checked = false;
                    notificationToggleSwitch.title = '通知服務無法啟動。';
                });
        } else {
            console.warn('[Init] 您的瀏覽器不支持 Service Worker 或推播通知。');
            notificationToggleSwitch.disabled = true;
            notificationToggleSwitch.checked = false;
            notificationToggleSwitch.title = '您的瀏覽器不支持 Service Worker 或推播通知。';
        }

        // 監聽通知權限狀態變化
        if ('permissions' in navigator && 'PushManager' in window) {
            navigator.permissions.query({ name: 'notifications' }).then(notificationPerm => {
                notificationPerm.onchange = () => {
                    console.log('[Init] 通知權限狀態已改變:', notificationPerm.state);
                    checkSubscriptionAndUI(); // 權限改變時更新 UI
                };
            });
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