import base64
import json
import os
import io
import datetime
from datetime import timezone, timedelta
import asyncio
import re
import time

# --- 導入 dotenv 庫來加載 .env 文件 ---
# 確保在所有其他模組導入和配置之前調用 load_dotenv()
from dotenv import load_dotenv
load_dotenv() # 在此處加載 .env 文件中的環境變數

from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto # 已在 Telethon 5.x 之後版本中包含，但明確導入可讀性更佳

import requests

# --- 必要的環境變數檢查 ---
# 從環境變數讀取配置。這些變數應該在 .env 文件中設定。
API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
IMGBB_API_KEY = os.getenv("IMGBB_API_KEY")
CHANNEL_USERNAME = os.getenv("CHANNEL_USERNAME")

OUTPUT_JSON_FILE = "posts.json" # 輸出到這個 JSON 檔案

# 檢查所有必要的環境變數是否都已設定
if not all([API_ID, API_HASH, IMGBB_API_KEY, CHANNEL_USERNAME]):
    print("錯誤：請確保已在 .env 文件或系統環境變數中設定以下所有必要變數：")
    print("  - TELEGRAM_API_ID (Telegram API ID)")
    print("  - TELEGRAM_API_HASH (Telegram API Hash)")
    print("  - IMGBB_API_KEY (ImgBB API Key)")
    print("  - CHANNEL_USERNAME (Telegram 頻道用戶名或連結，例如 @yourchannel)")
    print("\n請檢查您的 '.env' 文件是否與腳本在同一個目錄中，且變數名稱和值是否正確。")
    print("例如：TELEGRAM_API_ID=12345678")
    exit(1)

# 將 TELEGRAM_API_ID 轉換為整數，並處理可能發生的錯誤
try:
    API_ID = int(API_ID)
except ValueError:
    print("錯誤：TELEGRAM_API_ID 必須是有效的數字。請檢查 .env 文件或環境變數中的值。")
    exit(1)

# --- 還原 anon.session 檔案（若使用 TELETHON_SESSION 環境變數）---
# 此部分允許將 Telethon session 字串透過環境變數傳遞，適合於容器化部署。
if os.getenv("TELETHON_SESSION"):
    print("檢測到 TELETHON_SESSION 環境變數，正在解碼並還原 anon.session 檔案...")
    try:
        with open("anon.session", "wb") as f:
            f.write(base64.b64decode(os.getenv("TELETHON_SESSION")))
        print("anon.session 檔案還原成功。")
    except Exception as e:
        print(f"錯誤：還原 anon.session 檔案失敗: {e}")
        print("請確保 TELETHON_SESSION 環境變數包含有效的 base64 編碼字串。")
        exit(1)
else:
    print("未檢測到 TELETHON_SESSION 環境變數，將嘗試使用現有的 anon.session 檔案。")
    print("如果 anon.session 不存在或無效，Telethon 可能會要求您登錄。")

# --- Telethon 客戶端初始化 ---
# 'anon' 會是 session 檔案名 (anon.session)。
# 確保這個 anon.session 檔案存在且有效，否則 Telethon 會嘗試重新登入（需要電話驗證）。
# 傳遞的 API_ID 和 API_HASH 必須與生成 anon.session 時所用的憑證匹配。
client = TelegramClient('anon', API_ID, API_HASH)

# --- 時區定義 ---
# 定義台灣時區，用於確保日期時間處理的準確性
TW_TZ = timezone(timedelta(hours=8))

# --- 定義今天要處理的日期範圍 ---
# 腳本只會處理當天（從當天 00:00:00 到隔天 00:00:00）的訊息。
CURRENT_RUN_DATE = datetime.datetime.now(TW_TZ).date() # 獲取當前在台灣時區的日期
MIN_DATE_TO_PROCESS = datetime.datetime(CURRENT_RUN_DATE.year, CURRENT_RUN_DATE.month, CURRENT_RUN_DATE.day, 0, 0, 0, tzinfo=TW_TZ)
MAX_DATE_TO_PROCESS = MIN_DATE_TO_PROCESS + timedelta(days=1) # 處理到今天的結束 (即明天00:00:00)

print(f"設定處理日期範圍：從 {MIN_DATE_TO_PROCESS.strftime('%Y-%m-%d %H:%M:%S %Z%z')} 到 {MAX_DATE_TO_PROCESS.strftime('%Y-%m-%d %H:%M:%S %Z%z')}")

# --- 上傳到 ImgBB 函式 ---
async def upload_to_imgbb(file_bytes_io: io.BytesIO, file_name: str, mime_type: str) -> str | None:
    """
    將圖片從記憶體上傳到 ImgBB 並返回其 URL。
    如果上傳失敗，則打印錯誤訊息並返回 None。
    """
    file_bytes_io.seek(0) # 確保文件指針在文件開頭

    try:
        print(f"正在上傳圖片 '{file_name}' 到 ImgBB...")
        response = requests.post(
            "https://api.imgbb.com/1/upload",
            params={"key": IMGBB_API_KEY},
            files={"image": (file_name, file_bytes_io, mime_type)} # file_name 是一個提示名稱，不會影響實際儲存
        )
        response.raise_for_status() # 對於 4xx 或 5xx 的回應碼拋出 HTTPError
        data = response.json()

        if data and data.get("success"):
            img_url = data["data"]["url"]
            print(f"圖片 '{file_name}' 上傳成功，URL: {img_url}")
            return img_url
        else:
            error_message = data.get('error', {}).get('message', '未知錯誤')
            print(f"\nImgBB 上傳失敗 ({file_name}): {error_message}") # 錯誤時打印新行
            return None
    except requests.exceptions.RequestException as e:
        print(f"\nImgBB 上傳請求失敗 ({file_name}): {e}") # 網路或 HTTP 錯誤
        return None
    except Exception as e:
        print(f"\nImgBB 上傳過程中發生意外錯誤 ({file_name}): {e}") # 其他通用錯誤
        return None

# --- 主要處理流程函式 ---
async def main():
    print(f"\n--- 腳本開始運行於：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
    start_time = time.time() # 記錄腳本開始運行時間

    # 1. 讀取現有 posts.json 中的所有數據，並以 (date, text_key) 為鍵建立查找字典
    existing_data_from_file = []
    # 鍵為 (date_str, text_snippet)，值為完整的 post 字典
    # 用於檢查是否已存在，以及是否需要更新圖片連結。
    existing_posts_by_key = {}

    if os.path.exists(OUTPUT_JSON_FILE):
        print(f"正在讀取現有的 {OUTPUT_JSON_FILE} 以合併新數據...")
        try:
            with open(OUTPUT_JSON_FILE, "r", encoding="utf-8") as f:
                existing_data_from_file = json.load(f)

            for post in existing_data_from_file:
                post_date = post.get("date")
                # 取前 50 字作為文本鍵，用於匹配重複貼文
                post_text_key = (post.get("text") or "").strip()[:50]
                if post_date:
                    existing_posts_by_key[(post_date, post_text_key)] = post
            print(f"已讀取 {len(existing_data_from_file)} 筆舊貼文，其中 {len(existing_posts_by_key)} 筆可通過日期+文本識別。")
        except json.JSONDecodeError:
            print(f"警告：{OUTPUT_JSON_FILE} 不是有效的 JSON 格式。將忽略其內容並創建新檔案。")
            existing_data_from_file = []
            existing_posts_by_key = {}
        except Exception as e:
            print(f"讀取或處理 {OUTPUT_JSON_FILE} 失敗: {e}。將不保留舊數據。")
            existing_data_from_file = []
            existing_posts_by_key = {}
    else:
        print(f"找不到 {OUTPUT_JSON_FILE}，將創建新檔案。")

    # 2. 連接 Telegram 並獲取頻道實體
    entity = None
    try:
        print(f"正在嘗試連接 Telegram 並獲取頻道 '{CHANNEL_USERNAME}' 的實體...")

        # 檢查 Telethon 客戶端是否成功登入 (使用了 Session)。
        # 嘗試獲取自己的信息是確認 Telethon Session 是否成功載入並授權的最佳方式。
        me = await client.get_me()
        print(f"Telethon 客戶端已成功登入為：{me.first_name} {me.last_name if me.last_name else ''} (ID: {me.id})")

        entity = await client.get_entity(CHANNEL_USERNAME)
        print(f"成功獲取頻道 '{CHANNEL_USERNAME}' 實體。")
    except Exception as e:
        print(f"錯誤：無法連接 Telegram 或獲取頻道 '{CHANNEL_USERNAME}' 的實體: {e}")
        print("請確保 CHANNEL_USERNAME 正確，您的 Telegram 帳號可以訪問此頻道，且 anon.session 有效。")
        print("如果您遇到 PhoneNumberBannedError，可能需要檢查您的帳號狀態或更換帳號。")
        print(f"--- 腳本結束於：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
        return # 終止腳本執行

    # 3. 獲取今天訊息的總數（用於精確進度條）
    print(f"正在取得今天 ({MIN_DATE_TO_PROCESS.strftime('%Y-%m-%d')}) 的訊息總數 (這可能需要一些時間)...")
    total_messages_today = 0
    try:
        # 第一次遍歷：僅用於計數今天範圍內的訊息。
        # 從結束日期 (MAX_DATE_TO_PROCESS) 開始往回抓取，直到遇到處理日期範圍外的訊息。
        async for msg in client.iter_messages(entity, offset_date=MAX_DATE_TO_PROCESS):
            # 如果訊息日期比我們設定的開始日期還早，就停止計數，因為已超出範圍。
            if msg.date.astimezone(TW_TZ) < MIN_DATE_TO_PROCESS:
                break
            total_messages_today += 1
        print(f"今天頻道 '{CHANNEL_USERNAME}' 總共有 {total_messages_today} 筆訊息，開始處理...")
    except Exception as e:
        print(f"錯誤：在計數訊息時發生錯誤: {e}")
        print("這可能是由於網路問題或 Telegram API 暫時性故障。將嘗試繼續處理但無法顯示總進度。")
        total_messages_today = 0 # 將總數設為 0，以便進度條顯示不依賴總數

    # 計算預估完成時間（基於每個訊息的處理時間）
    estimated_time_per_message = 0.15 # 每次循環的 asyncio.sleep() 時間加上估計的下載/上傳預留時間
    if total_messages_today > 0:
        estimated_total_seconds = total_messages_today * estimated_time_per_message
        estimated_end_time = datetime.datetime.now(TW_TZ) + datetime.timedelta(seconds=estimated_total_seconds)
        print(f"預計完成時間：{estimated_end_time.strftime('%Y-%m-%d %H:%M:%S %Z%z')}")
    else:
        print("無法預估完成時間，因為今天沒有新訊息或無法獲取總數。")

    processed_count = 0
    # 儲存本次運行處理過的訊息，以 (date, text_key) 為鍵。
    # 這用於在最後與舊數據合併，確保新抓取的數據覆蓋舊數據。
    messages_processed_in_this_run_by_key = {}

    # 4. 處理今天的訊息
    # 第二次遍歷：實際處理訊息 (只獲取今天範圍內的訊息)
    # `offset_date=MIN_DATE_TO_PROCESS - timedelta(seconds=1)` 和 `reverse=True`
    # 會讓 Telethon 從 `MIN_DATE_TO_PROCESS` 之前一秒開始往後（時間軸上更晚）抓取訊息。
    # 結合 `msg_date_tw >= MAX_DATE_TO_PROCESS` 的判斷，確保只處理當天的訊息，且從舊到新。
    async for msg in client.iter_messages(entity, offset_date=MIN_DATE_TO_PROCESS - timedelta(seconds=1), reverse=True):
        msg_date_tw = msg.date.astimezone(TW_TZ)

        # 如果訊息日期超出了我們設定的結束日期，就停止處理，因為已經處理完所有當天訊息。
        if msg_date_tw >= MAX_DATE_TO_PROCESS:
            break

        processed_count += 1

        msg_date_tw_str = msg_date_tw.strftime('%Y-%m-%d')
        msg_text_original = msg.text or ""
        msg_text_key = msg_text_original.strip()[:50] # 用於查找的文本鍵

        img_bb_url = None
        current_post_lookup_key = (msg_date_tw_str, msg_text_key)

        # 檢查這條訊息是否已經在舊數據中存在，並且是否有圖片連結。
        # 如果存在且有圖片連結，則直接使用舊連結，避免重複下載和上傳。
        if current_post_lookup_key in existing_posts_by_key and existing_posts_by_key[current_post_lookup_key].get("image"):
            img_bb_url = existing_posts_by_key[current_post_lookup_key]["image"]
            # print(f"訊息 (ID:{msg.id}) 已有圖片連結，跳過上傳。") # 可選：用於除錯
        elif msg.photo: # 只有當沒有舊連結或舊連結為空，且訊息確實有圖片時，才處理新圖片
            # 圖片命名邏輯：日期_ID_文本片段.jpg
            text_snippet = (msg.text or "").strip()
            if text_snippet:
                # 移除文件名中不允許的字元
                text_snippet = re.sub(r'[\\/:*?"<>|]', '', text_snippet)
                text_snippet = text_snippet.replace(' ', '_')
                text_snippet = text_snippet[:30] # 限制長度
                if text_snippet:
                    text_snippet = f"_{text_snippet}" # 添加下劃線前綴
            else:
                text_snippet = ""

            photo_mime_type = 'image/jpeg' # 大多數 Telegram 圖片會是 JPEG
            file_extension = '.jpg'

            file_name = f"{msg_date_tw_str}_{msg.id}{text_snippet}{file_extension}"

            photo_bytes_io = io.BytesIO() # 創建一個記憶體中的位元組流來儲存圖片

            try:
                print(f"正在下載訊息 (ID:{msg.id}) 的圖片...")
                await client.download_media(msg.photo, file=photo_bytes_io)
                print(f"圖片下載完成，大小：{photo_bytes_io.tell()} bytes。")
                img_bb_url = await upload_to_imgbb(photo_bytes_io, file_name, photo_mime_type)
            except Exception as e:
                print(f"處理訊息 (ID:{msg.id}) 的圖片時發生錯誤: {e}")
                img_bb_url = None # 確保錯誤時圖片連結為 None
            finally:
                photo_bytes_io.close() # 確保關閉記憶體流以釋放資源

        # 準備 post_item 字典，包含訊息 ID (用於排序和唯一識別)
        post_item = {
            "id": msg.id, # 訊息 ID，用於唯一識別和排序
            "date": msg_date_tw_str,
            "text": msg_text_original,
            "image": img_bb_url # 這裡直接賦值為 img_bb_url (可能為 None)
        }

        # 將此貼文加入到本次運行處理過的字典中
        messages_processed_in_this_run_by_key[current_post_lookup_key] = post_item

        # 顯示進度條 (單行更新，使用 '\r' 回到行首)
        if total_messages_today > 0:
            percent = (processed_count / total_messages_today) * 100
            print(f"處理進度: {processed_count}/{total_messages_today} 筆訊息 ({percent:.2f}%)", end='\r')
        else:
            print(f"處理進度: 已處理 {processed_count} 筆訊息...", end='\r')

        await asyncio.sleep(0.1) # 添加短暫延遲，避免過於頻繁請求 Telegram API

    print("\n") # 處理完成後打印一個換行符，確保後續輸出從新行開始

    # 5. 合併所有數據並寫入 JSON 檔案
    # 使用字典來進行精確的合併和去重，以 (date, text_key) 為主要鍵。
    final_posts_map = {}

    # 1. 將所有舊數據放入合併字典，作為基礎數據
    for post_key, post_data in existing_posts_by_key.items():
        final_posts_map[post_key] = post_data

    # 2. 將本次運行處理的所有訊息（新的或更新的）覆蓋或添加到合併字典中
    # 如果 `current_post_lookup_key` 相同，則 `messages_processed_in_this_run_by_key` 中的數據會覆蓋 `existing_posts_by_key` 中的數據
    final_posts_map.update(messages_processed_in_this_run_by_key)

    # 3. 將合併後的字典值轉換為列表
    final_posts = list(final_posts_map.values())

    # 4. 對所有數據進行排序：首先按日期降序，如果日期相同，則按訊息 ID 降序 (最新的在最上面)
    # 這樣確保了 JSON 檔案中的貼文是從最新到最舊排列的。
    final_posts.sort(key=lambda x: (
        datetime.datetime.strptime(x['date'], '%Y-%m-%d'),
        x.get('id', 0) # 如果有 id 則用 id 排序，否則用 0 (確保穩定性，舊數據可能沒有 id 欄位)
    ), reverse=True) # 關鍵的 reverse=True 實現降序排列

    print(f"共擷取並準備寫入 {len(final_posts)} 筆資料到 {OUTPUT_JSON_FILE}。")

    print(f"正在寫入 {OUTPUT_JSON_FILE} ...")
    try:
        with open(OUTPUT_JSON_FILE, "w", encoding="utf-8") as f:
            # ensure_ascii=False 允許寫入非 ASCII 字元 (如中文) 而不轉義
            # indent=2 使 JSON 輸出格式化，更易於閱讀
            json.dump(final_posts, f, ensure_ascii=False, indent=2)
        print("完成！數據已成功儲存。")
    except Exception as e:
        print(f"錯誤：寫入 {OUTPUT_JSON_FILE} 失敗: {e}")

    end_time = time.time() # 記錄腳本結束運行時間
    total_duration = end_time - start_time
    print(f"--- 腳本結束運行於：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
    print(f"總耗時：{total_duration:.2f} 秒")

# --- 運行主程式 ---
# 使用 `with client:` 語法確保 Telethon 客戶端正確連接和斷開。
# `client.loop.run_until_complete(main())` 運行異步的 `main` 函數。
with client:
    client.loop.run_until_complete(main())
