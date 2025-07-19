// jigong-news-pwa/frontend/public/pwa-notifications.js

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
    // 注意：這裡應該是 PWA 的基礎網域，不包含任何路徑。
    // 例如，如果你的 PWA 部署在 https://wang-wei-hao.github.io/jigong-news/，
    // 那麼你的 OFFICIAL_PWA_ORIGIN 就是 https://wang-wei-hao.github.io
    const OFFICIAL_PWA_ORIGIN = 'https://wang-wei-hao.github.io'; 

    // 如果你的 PWA 部署在子路徑下 (例如: https://yourusername.github.io/your-repo-name/)
    // 則 PWA_SUB_PATH 應該是 /your-repo-name。如果直接部署在根目錄，則為 '' (空字串)。
    // 例如，如果你的 PWA 部署在 https://wang-wei-hao.github.io/jigong-news/
    // 那麼 PWA_SUB_PATH = '/jigong-news';
    // 否則，如果直接部署在 https://yourdomain.com/
    // 那麼 PWA_SUB_PATH = '';
    const PWA_SUB_PATH = '/jigong-news'; // 請根據您的實際部署路徑設定

    // --- 狀態變數 ---
    let swRegistration = null; // 用於 Service Worker 註冊的實例
    let deferredPrompt; // 用於保存 PWA 安裝提示事件

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
        return window.location.origin === OFFICIAL_PWA_ORIGIN;
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
        if (!isOfficialOrigin() || isSandboxed()) {
            console.warn('非官方網域或沙箱環境，不顯示安裝提示。');
            return;
        }

        if (!customInstallPromptOverlay) {
             console.error("customInstallPromptOverlay 元素不存在，請檢查 index.html。");
             return;
        }
        
        let promptDiv = customInstallPromptOverlay.querySelector('#customInstallPrompt');
        if (!promptDiv) {
            promptDiv = document.createElement('div');
            promptDiv.id = 'customInstallPrompt';
            promptDiv.classList.add('custom-prompt'); // 確保使用通用的模態框樣式
            customInstallPromptOverlay.appendChild(promptDiv);
        }

        // 根據當前主題模式調整彈窗背景色
        if (document.body.classList.contains('dark-mode')) {
            promptDiv.style.backgroundColor = '#2c2c2c';
            promptDiv.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.1)';
        } else {
            promptDiv.style.backgroundColor = '#333';
            promptDiv.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5)';
        }
        // promptDiv.style.transform 由 CSS 的 .custom-prompt-overlay.visible .custom-prompt 控制

        let contentHTML = '';
        let buttonsHTML = '';

        if (type === 'ios') {
            const ICON_BASE_PATH = PWA_SUB_PATH === '' ? '/icons' : `${PWA_SUB_PATH}/icons`;
            const SHARE_ICON_PATH = `${ICON_BASE_PATH}/ios分享icon.jpg`; 
            const ADD_TO_HOMESCREEN_ICON_PATH = `${ICON_BASE_PATH}/ios加到主畫面icon.jpg`; 

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
                hideInstallPrompt();
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log(`User response to the install prompt: ${outcome}`);
                    deferredPrompt = null;
                }
            };
        }

        if (iosDismissButton) { 
            iosDismissButton.onclick = () => {
                localStorage.setItem('hasSeenAppleInstallPrompt', 'dismissed');
                hideInstallPrompt();
            };
        }

        if (customCancelInstallButton) {
            customCancelInstallButton.onclick = () => {
                hideInstallPrompt();
            };
        }

        customInstallPromptOverlay.style.display = 'flex'; // 先讓 overlay 顯示為 flex
        requestAnimationFrame(() => { // 使用 rAF 確保在下一幀觸發 CSS 過渡
            customInstallPromptOverlay.classList.add('visible');
        });
    }

    function hideInstallPrompt() {
        const promptDiv = customInstallPromptOverlay.querySelector('#customInstallPrompt');
        if (customInstallPromptOverlay && promptDiv) {
            customInstallPromptOverlay.classList.remove('visible'); // 觸發 CSS 過渡 (opacity & transform)

            // 監聽過渡結束事件，然後將 display 設為 none
            customInstallPromptOverlay.addEventListener('transitionend', function handler() {
                customInstallPromptOverlay.style.display = 'none'; // 過渡結束後完全隱藏
                promptDiv.remove(); // 移除動態生成的元素
                customInstallPromptOverlay.removeEventListener('transitionend', handler);
            }, { once: true });
        }
    }

    // --- 新增：通知權限確認模態框邏輯 (用於 default 狀態時詢問用戶) ---
    function showNotificationConfirmationModal() {
        if (!notificationConfirmationModalOverlay || !notificationConfirmationModal) {
            console.error("Notification confirmation modal elements not found in DOM.");
            return;
        }

        // 根據主題調整模態框背景色
        if (document.body.classList.contains('dark-mode')) {
            notificationConfirmationModal.style.backgroundColor = '#2c2c2c';
            notificationConfirmationModal.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.1)';
        } else {
            notificationConfirmationModal.style.backgroundColor = '#333';
            notificationConfirmationModal.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5)';
        }

        notificationConfirmationModalOverlay.style.display = 'flex'; // 先讓 overlay 顯示為 flex
        requestAnimationFrame(() => { // 使用 rAF 確保在下一幀觸發 CSS 過渡
            notificationConfirmationModalOverlay.classList.add('visible');
        });

        const confirmBtn = notificationConfirmationModal.querySelector('#confirmEnableNotificationsButton');
        const cancelBtn = notificationConfirmationModal.querySelector('#cancelEnableNotificationsButton');
        const closeXBtn = notificationConfirmationModal.querySelector('#notificationConfirmationCloseXButton');

        const handleConfirm = async () => {
            hideNotificationConfirmationModal(); // 先關閉自定義模態框
            await requestPermissionAndPerformSubscription(); // 然後觸發原生權限請求和訂閱
        };

        const handleCancel = () => {
            hideNotificationConfirmationModal();
            if (notificationToggleSwitch) {
                notificationToggleSwitch.checked = false;
                updateNotificationToggleSwitchUI(false, Notification.permission);
            }
            if (notificationLabel) notificationLabel.textContent = '推播通知';
        };
        
        // 移除並重新綁定事件監聽器，防止重複綁定
        if (confirmBtn) { confirmBtn.removeEventListener('click', handleConfirm); confirmBtn.addEventListener('click', handleConfirm); }
        if (cancelBtn) { cancelBtn.removeEventListener('click', handleCancel); cancelBtn.addEventListener('click', handleCancel); }
        if (closeXBtn) { closeXBtn.removeEventListener('click', handleCancel); closeXBtn.addEventListener('click', handleCancel); }
    }

    function hideNotificationConfirmationModal() {
        if (!notificationConfirmationModalOverlay || !notificationConfirmationModal) return;

        notificationConfirmationModalOverlay.classList.remove('visible'); // 觸發 CSS 過渡

        notificationConfirmationModalOverlay.addEventListener('transitionend', function handler() {
            notificationConfirmationModalOverlay.style.display = 'none'; // 過渡結束後完全隱藏
            notificationConfirmationModalOverlay.removeEventListener('transitionend', handler);
        }, { once: true });
    }

    // --- 新增：通知權限被拒絕時的指導模態框邏輯 ---
    function showPermissionDeniedGuidanceModal() {
        if (!permissionDeniedModalOverlay || !permissionDeniedModal) {
            console.error("Permission denied modal elements not found in DOM.");
            return;
        }

        // 根據主題調整模態框背景色
        if (document.body.classList.contains('dark-mode')) {
            permissionDeniedModal.style.backgroundColor = '#2c2c2c';
            permissionDeniedModal.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.1)';
        } else {
            permissionDeniedModal.style.backgroundColor = '#333';
            permissionDeniedModal.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5)';
        }

        permissionDeniedModalOverlay.style.display = 'flex'; // 先讓 overlay 顯示為 flex
        requestAnimationFrame(() => { // 使用 rAF 確保在下一幀觸發 CSS 過渡
            permissionDeniedModalOverlay.classList.add('visible');
        });

        const closeBtn = permissionDeniedModal.querySelector('#permissionDeniedCloseButton');
        const closeXBtn = permissionDeniedModal.querySelector('#permissionDeniedCloseXButton');
        
        const closeHandler = () => hidePermissionDeniedGuidanceModal();

        if (closeBtn) { closeBtn.removeEventListener('click', closeHandler); closeBtn.addEventListener('click', closeHandler); }
        if (closeXBtn) { closeXBtn.removeEventListener('click', closeHandler); closeXBtn.addEventListener('click', closeHandler); }
    }

    function hidePermissionDeniedGuidanceModal() {
        if (!permissionDeniedModalOverlay || !permissionDeniedModal) return;

        permissionDeniedModalOverlay.classList.remove('visible'); // 觸發 CSS 過渡

        permissionDeniedModalOverlay.addEventListener('transitionend', function handler() {
            permissionDeniedModalOverlay.style.display = 'none'; // 過渡結束後完全隱藏
            permissionDeniedModalOverlay.removeEventListener('transitionend', handler);
        }, { once: true });
    }

    // --- UI 狀態更新 ---
    function updateNotificationToggleSwitchUI(isSubscribed, permissionState) {
        if (!notificationToggleSwitch || !notificationLabel) return;
        
        notificationToggleSwitch.disabled = false; // 預設啟用
        notificationToggleSwitch.checked = isSubscribed; // 設置開關狀態
        notificationLabel.textContent = '推播通知'; // 重置標籤文本

        // 優先判斷是否在支援的環境
        if (!isOfficialOrigin() || isSandboxed() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            notificationToggleSwitch.disabled = true;
            notificationToggleSwitch.checked = false; // 確保關閉狀態
            notificationToggleSwitch.title = '此環境不支持推播通知或非官方來源。請前往完整版網站。';
            return;
        }
        
        // 處理權限被拒絕的情況
        if (permissionState === 'denied') {
            notificationToggleSwitch.disabled = true;
            notificationToggleSwitch.checked = false; // 確保關閉狀態
            notificationToggleSwitch.title = '您已拒絕通知權限。請在瀏覽器設定中手動啟用。';
        } else if (isSubscribed) {
            notificationToggleSwitch.title = '推播通知已開啟。點擊以關閉。';
        } else {
            notificationToggleSwitch.title = '推播通知已關閉。點擊以開啟。';
        }
    }
    
    // 更新設定面板中的「深色模式」開關。
    function updateThemeToggleSwitchUI() {
        if (!themeToggleSwitch) return;
        const isDark = document.body.classList.contains("dark-mode");
        themeToggleSwitch.checked = isDark;
        themeToggleSwitch.title = isDark ? "點擊切換為淺色模式" : "點擊切換為深色模式";
    }

    // 檢查推播訂閱狀態並更新相關 UI
    async function checkSubscriptionAndUI() {
        let subscription = null; 
        let permissionState = Notification.permission || 'default'; // 確保總有一個初始狀態

        try {
            if ('serviceWorker' in navigator && 'PushManager' in window && (await navigator.serviceWorker.ready)) {
                swRegistration = await navigator.serviceWorker.ready;
                subscription = await swRegistration.pushManager.getSubscription();
                permissionState = Notification.permission;
            }
        } catch (error) { 
            console.error('檢查訂閱狀態時出錯:', error); 
            // 如果出錯，將權限狀態視為未知或錯誤，以便禁用按鈕
            permissionState = 'error'; 
        }
        updateNotificationToggleSwitchUI(!!subscription, permissionState);
    }

    // --- 推播邏輯 ---

    // 新增：處理原生權限請求和實際訂閱的函數
    async function requestPermissionAndPerformSubscription() {
        if (!swRegistration) {
            alert('Service Worker 尚未準備好，無法訂閱。請重新載入頁面。');
            checkSubscriptionAndUI();
            return;
        }

        if (notificationToggleSwitch) notificationToggleSwitch.disabled = true;
        if (notificationLabel) notificationLabel.textContent = '推播通知 (處理中...)';

        try {
            const permission = await Notification.requestPermission(); // 關鍵步驟：觸發瀏覽器原生的通知權限請求
            
            if (permission !== 'granted') {
                console.warn('用戶在原生提示中拒絕了通知權限。');
                showPermissionDeniedGuidanceModal();
                return;
            }
            
            // 以下是實際的訂閱流程（只有在權限被授予後才執行）
            const vapidPublicKeyResponse = await fetch(`${BACKEND_BASE_URL}/api/vapid-public-key`);
            if (!vapidPublicKeyResponse.ok) throw new Error(`無法獲取 VAPID 公鑰: ${vapidPublicKeyResponse.statusText}`);
            const VAPID_PUBLIC_KEY = await vapidPublicKeyResponse.text();
            const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
            const subscription = await swRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
            const response = await fetch(`${BACKEND_BASE_URL}/api/subscribe`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(subscription) });

            if (response.ok) {
                alert('您已成功訂閱每日濟公報推播通知！');
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
                const err = await response.text();
                throw new Error(`訂閱失敗: ${err || '未知錯誤'}`);
            }
        } catch (error) {
            console.error('訂閱或請求權限失敗:', error);
            alert(`訂閱或請求權限失敗: ${error.message}`);
            const sub = await swRegistration.pushManager.getSubscription();
            if (sub) await sub.unsubscribe();
        } finally {
            checkSubscriptionAndUI();
        }
    }

    // 處理使用者訂閱推播的完整流程 (現在包含前置確認邏輯)
    async function subscribeUser() {
        // 在嘗試訂閱前再次檢查環境
        if (!isOfficialOrigin() || isSandboxed() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            alert('此環境不支持推播通知。請前往完整版網站或將應用程式加入主畫面。');
            checkSubscriptionAndUI(); // 更新UI以反映狀態
            return;
        }

        const currentPermission = Notification.permission;

        if (currentPermission === 'granted') {
            console.log('通知權限已開啟，無需重複訂閱。');
            checkSubscriptionAndUI(); // 如果已經允許，則更新 UI 確保開關狀態正確
            return;
        }

        if (currentPermission === 'denied') {
            console.warn('通知權限已被拒絕，提示用戶手動開啟。');
            showPermissionDeniedGuidanceModal(); // 如果權限已明確被拒絕，則直接顯示指導模態框
        } else { // currentPermission === 'default' (初始狀態)
            console.log('通知權限為預設狀態，彈出自定義確認視窗。');
            showNotificationConfirmationModal(); // 彈出自定義確認模態框
            // 實際的 requestPermissionAndPerformSubscription 將從這個模態框的「開啟通知」按鈕中觸發
        }
        // 無論哪種情況，都更新 UI 以準備用戶互動
        checkSubscriptionAndUI();
    }
    
    // 處理使用者取消訂閱推播的完整流程。
    async function unsubscribeUser() {
        if (!swRegistration) { alert('Service Worker 尚未準備好，無法取消訂閱。請重新載入頁面。'); return; }
        
        // 顯示處理中提示
        if (notificationToggleSwitch) notificationToggleSwitch.disabled = true;
        if (notificationLabel) notificationLabel.textContent = '推播通知 (處理中...)';

        if (!confirm('您確定要取消訂閱濟公報推播通知嗎？')) {
            checkSubscriptionAndUI(); // 用戶取消動作，恢復 UI
            return;
        }
        
        try {
            const subscription = await swRegistration.pushManager.getSubscription();
            if (subscription) {
                const response = await fetch(`${BACKEND_BASE_URL}/api/unsubscribe`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ endpoint: subscription.endpoint }) });
                if (!response.ok) console.error(`後端取消訂閱失敗: ${await response.text()}`);
                await subscription.unsubscribe();
                alert('您已成功取消訂閱濟公報推播通知！');
                // 取消週期性同步
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
                alert('您當前沒有訂閱任何通知。');
            }
        } catch (error) {
            console.error('取消訂閱失敗:', error);
            alert(`取消訂閱失敗: ${error.message}`);
        } finally {
            checkSubscriptionAndUI();
        }
    }

    // --- 事件處理與初始化 ---
    // 處理推播開關的點擊事件。
    function handleNotificationToggleChange(event) {
        if (event.target.checked) subscribeUser(); else unsubscribeUser();
    }
    
    // 處理主題切換。
    function toggleTheme() {
        document.body.classList.toggle("dark-mode");
        const isDark = document.body.classList.contains("dark-mode");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        updateThemeToggleSwitchUI();
        
        // 同步更新所有模態框的顏色
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
    
    // 統一的 PWA 功能初始化入口函數。
    function initializeFeatures() {
        // 註冊 Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('Service Worker 註冊成功');
                    swRegistration = registration;
                    checkSubscriptionAndUI(); // 註冊後立即檢查訂閱狀態並更新 UI
                    // 在 SW 註冊成功後才綁定開關事件，確保 swRegistration 可用
                    // 注意：這裡只綁定一次，不會重複
                    if (notificationToggleSwitch) {
                        notificationToggleSwitch.removeEventListener('change', handleNotificationToggleChange); // 防止重複綁定
                        notificationToggleSwitch.addEventListener('change', handleNotificationToggleChange);
                    }
                    
                    // 監聽通知權限變化
                    if ('permissions' in navigator && 'PushManager' in window) {
                        navigator.permissions.query({ name: 'notifications' }).then(notificationPerm => {
                            notificationPerm.onchange = () => {
                                console.log('通知權限狀態已改變:', notificationPerm.state);
                                checkSubscriptionAndUI();
                            };
                        });
                    }

                })
                .catch(error => {
                    console.error('Service Worker 註冊失敗:', error);
                    // 即使 Service Worker 註冊失敗，也更新 UI 顯示不支持通知
                    if (notificationToggleSwitch) { notificationToggleSwitch.disabled = true; notificationToggleSwitch.checked = false; notificationToggleSwitch.title = '通知服務無法啟動。'; }
                });
        } else {
            // 瀏覽器不支持 Service Worker
            if (notificationToggleSwitch) { notificationToggleSwitch.disabled = true; notificationToggleSwitch.checked = false; notificationToggleSwitch.title = '您的瀏覽器不支持 Service Worker 或推播通知。'; }
        }
        
        // 設定 PWA 安裝提示邏輯
        // 優先檢查是否已安裝或在受限環境，以及是否為官方來源
        if (isPWAInstalled() || isSandboxed() || !isOfficialOrigin()) {
            if(isPWAInstalled()){
                console.log('PWA 已安裝，不顯示安裝提示。');
            } else if (isSandboxed()) {
                console.log('PWA 運行於受限沙箱環境，不顯示安裝提示。');
            } else if (!isOfficialOrigin()) {
                console.log('PWA 運行於非官方來源，不顯示安裝提示。');
            }
        } else {
            // 判斷設備類型以提供不同安裝提示
            if (isAppleMobileDevice() || isMacSafari()) {
                console.log('偵測到 Apple 裝置，準備顯示安裝指南。');
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
    }
    
    // --- 腳本執行起點 (由 index.html 的 DOMContentLoaded 觸發) ---

    // 1. 初始化主題
    const storedTheme = localStorage.getItem("theme");
    if (storedTheme === "dark") document.body.classList.add("dark-mode");
    updateThemeToggleSwitchUI();

    // 2. 初始化所有 PWA 相關功能 (Service Worker 註冊、安裝提示等)
    initializeFeatures();

    // 3. 綁定設定面板的開關事件
    function openSettingsPanel() {
        settingsPanel.classList.add('is-open');
        overlay.classList.add('is-visible');
        document.body.style.overflow = 'hidden';
        checkSubscriptionAndUI();
        updateThemeToggleSwitchUI();
    }

    function closeSettingsPanel() {
        settingsPanel.classList.remove('is-open');
        overlay.classList.remove('is-visible');
        document.body.style.overflow = '';
    }

    if (settingsBtn) settingsBtn.addEventListener('click', openSettingsPanel);
    // 修正：closeSettingsBtn 的事件監聽器應該呼叫 closeSettingsPanel 函數
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsPanel); 
    if (overlay) overlay.addEventListener('click', closeSettingsPanel);

    // 4. 綁定清除緩存按鈕事件
    if (clearCacheBtn) clearCacheBtn.addEventListener('click', async () => {
        if (!confirm('您確定要清除網站緩存嗎？這將重新載入頁面並清除所有儲存的資料（包括推播訂閱狀態）。')) return;
        clearCacheBtn.textContent = '清除中...'; clearCacheBtn.disabled = true;
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (let reg of regs) {
                    if (reg.active) {
                        try {
                            const subscription = await reg.pushManager.getSubscription();
                            if (subscription) {
                                await fetch(`${BACKEND_BASE_URL}/api/unsubscribe`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ endpoint: subscription.endpoint })
                                }).catch(e => console.warn('Failed to notify backend of unsubscription before unregistering SW:', e));
                            }
                        } catch (e) {
                            console.warn('Failed to get subscription before unregistering SW:', e);
                        }
                    }
                    await reg.unregister();
                    console.log(`Service Worker at ${reg.scope} unregistered.`);
                }
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                for (let key of keys) {
                    await caches.delete(key);
                    console.log(`Cache "${key}" deleted.`);
                }
            }
            alert('網站緩存已清除！頁面將重新載入。'); 
            window.location.reload(true);
        } catch (error) {
            console.error('清除緩存失敗:', error); alert('清除緩存失敗。');
            clearCacheBtn.textContent = '立即清除'; clearCacheBtn.disabled = false;
        }
    });

    // 5. 綁定主題切換開關事件
    if (themeToggleSwitch) themeToggleSwitch.addEventListener('change', toggleTheme);
} // End of initializePwaLogic function

// Expose the initializePwaLogic function globally so index.html can call it
window.initializePwaLogic = initializePwaLogic;