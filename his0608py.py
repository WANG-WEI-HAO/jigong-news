import json
import os
import io 
import datetime
from datetime import timezone, timedelta
import asyncio 
import re 
import time 

# --- 導入 dotenv 庫來加載 .env 文件 ---
from dotenv import load_dotenv 

from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto 

import requests 

# --- 配置區 ---
# 在最上方調用 load_dotenv() 來加載 .env 文件中的環境變數
load_dotenv() 

# 從環境變數讀取配置 (不再硬編碼)
# 請確保已在 .env 文件中設定以下變數：
# TELEGRAM_API_ID, TELEGRAM_API_HASH, IMGBB_API_KEY, CHANNEL_USERNAME
API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
IMGBB_API_KEY = os.getenv("IMGBB_API_KEY")
CHANNEL_USERNAME = os.getenv("CHANNEL_USERNAME")

OUTPUT_JSON_FILE = "posts.json"

# --- 必要的環境變數檢查 ---
# 確保所有必要的環境變數都已從 .env 文件或其他來源加載成功
if not all([API_ID, API_HASH, IMGBB_API_KEY, CHANNEL_USERNAME]):
    print("錯誤：請確保已在 .env 文件或系統環境變數中設定以下所有必要變數：")
    print("  - TELEGRAM_API_ID")
    print("  - TELEGRAM_API_HASH")
    print("  - IMGBB_API_KEY")
    print("  - CHANNEL_USERNAME")
    print("\n請檢查您的 '.env' 文件是否與腳本在同一個目錄中，且變數名稱和值是否正確。")
    print("例如：TELEGRAM_API_ID=12345678")
    exit(1) # 退出程式，因為缺少必要配置

# 將 API_ID 轉換為整數 (因為 os.getenv 返回的是字串)
try:
    API_ID = int(API_ID)
except ValueError:
    print("錯誤：TELEGRAM_API_ID 必須是有效的數字。請檢查 .env 文件或環境變數中的值。")
    exit(1)

# Telethon 客戶端初始化
# 'anon' 會是 session 檔案名 (anon.session)。
# 確保這個 anon.session 檔案存在且有效，否則 Telethon 會嘗試重新登入（需要電話驗證）。
# 傳遞的 API_ID 和 API_HASH 必須與生成 anon.session 時所用的憑證匹配。
client = TelegramClient('anon', API_ID, API_HASH)

# 台灣時區定義
TW_TZ = timezone(timedelta(hours=8))

# --- 指定要處理的日期範圍 (從 2025/06/08 到今天) ---
MIN_DATE_TO_PROCESS = datetime.datetime(2025, 6, 8, 0, 0, 0, tzinfo=TW_TZ)
# MAX_DATE_TO_PROCESS 設定為「明天」的開始，以確保包含「今天」的所有訊息
# (因為 Telethon 的 max_date 是不包含的)
TODAY = datetime.datetime.now(TW_TZ).date()
MAX_DATE_TO_PROCESS = datetime.datetime(TODAY.year, TODAY.month, TODAY.day, 0, 0, 0, tzinfo=TW_TZ) + timedelta(days=1)

# --- 上傳到 ImgBB 函式 (從 BytesIO) ---
async def upload_to_imgbb(file_bytes_io: io.BytesIO, file_name: str, mime_type: str):
    """將圖片從記憶體上傳到 ImgBB 並返回其 URL。減少內部 print 以保持進度條單行顯示。"""
    file_bytes_io.seek(0)

    try:
        response = requests.post(
            "https://api.imgbb.com/1/upload",
            params={"key": IMGBB_API_KEY},
            files={"image": (file_name, file_bytes_io, mime_type)} 
        )
        response.raise_for_status() # 如果響應狀態碼不是 2xx，則拋出 HTTPError
        data = response.json()
        if data and data.get("success"):
            return data["data"]["url"]
        else:
            error_message = data.get('error', {}).get('message', '未知錯誤')
            # 錯誤時打印，會導致新行，但這通常是重要信息，值得犧牲單行顯示
            print(f"\nImgBB 上傳失敗 ({file_name}): {error_message}") 
            return None
    except requests.exceptions.RequestException as e:
        print(f"\nImgBB 上傳請求失敗 ({file_name}): {e}") 
        return None
    except Exception as e:
        print(f"\nImgBB 上傳過程中發生錯誤 ({file_name}): {e}") 
        return None

# --- 主要處理流程函式 ---
async def main():
    print(f"--- 腳本開始運行於：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
    start_time = time.time() # 記錄開始時間

    # 1. 讀取現有 posts.json 中的所有數據，並以 (date, text_key) 為鍵建立查找字典
    existing_data_from_file = [] 
    existing_posts_by_key = {} # 鍵為 (date_str, text_snippet)，值為完整的 post 字典
    
    if os.path.exists(OUTPUT_JSON_FILE):
        print(f"正在讀取現有的 {OUTPUT_JSON_FILE} 以合併新數據...")
        try:
            with open(OUTPUT_JSON_FILE, "r", encoding="utf-8") as f:
                existing_data_from_file = json.load(f) 
            
            for post in existing_data_from_file:
                post_date = post.get("date")
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

    # 獲取 Telegram 頻道實體
    entity = None
    try:
        print(f"正在嘗試連接 Telegram 並獲取頻道 '{CHANNEL_USERNAME}' 的實體...")
        entity = await client.get_entity(CHANNEL_USERNAME)
        print(f"成功獲取頻道 '{CHANNEL_USERNAME}' 實體。")
    except Exception as e:
        print(f"錯誤：無法獲取頻道 '{CHANNEL_USERNAME}' 的實體: {e}")
        print("請確保 CHANNEL_USERNAME 正確且你的 Telegram 帳號可以訪問此頻道。")
        print("如果您遇到 PhoneNumberBannedError，請參考之前的解決方案。")
        print(f"--- 腳本結束於：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
        return 

    # --- 新增：檢查並修復現有 JSON 中缺少圖片的貼文 ---
    # 找出那些有 `id` 但 `image` 欄位為空或不存在的貼文
    posts_to_repair = [p for p in existing_data_from_file if not p.get("image") and p.get("id")]
    if posts_to_repair:
        print(f"\n--- 發現 {len(posts_to_repair)} 筆貼文可能缺少圖片，開始檢查與修復 ---")
        repaired_count = 0
        for i, post in enumerate(posts_to_repair):
            post_id = post.get("id")
            # 顯示進度
            print(f"檢查中 ({i+1}/{len(posts_to_repair)}): Post ID {post_id}...", end='\r')
            try:
                # 透過 ID 獲取單一訊息通常很快
                msg = await client.get_messages(entity, ids=post_id)
                if msg and msg.photo:
                    # 這則貼文有圖片，但我們之前沒有成功上傳。現在重試。
                    # 圖片命名邏輯 (與主流程保持一致)
                    text_snippet = (post.get("text") or "").strip()
                    if text_snippet:
                        text_snippet = re.sub(r'[\\/:*?"<>|]', '', text_snippet)
                        text_snippet = text_snippet.replace(' ', '_')
                        text_snippet = text_snippet[:30]
                        if text_snippet:
                            text_snippet = f"_{text_snippet}"
                    else:
                        text_snippet = ""

                    file_name = f"{post.get('date')}_{msg.id}{text_snippet}.jpg"
                    photo_bytes_io = io.BytesIO()
                    try:
                        await client.download_media(msg.photo, file=photo_bytes_io)
                        img_bb_url = await upload_to_imgbb(photo_bytes_io, file_name, 'image/jpeg')
                        if img_bb_url:
                            print(f"\n成功修復 Post ID {post_id} 的圖片連結。")
                            post["image"] = img_bb_url
                            # 同步更新 lookup 字典，以便主流程能正確識別
                            post_text_key = (post.get("text") or "").strip()[:50]
                            lookup_key = (post.get("date"), post_text_key)
                            existing_posts_by_key[lookup_key] = post
                            repaired_count += 1
                    finally:
                        photo_bytes_io.close()
                await asyncio.sleep(0.1) # 避免請求過於頻繁
            except Exception as e:
                # 如果訊息已被刪除或發生其他錯誤，打印錯誤並繼續
                print(f"\n檢查 Post ID {post_id} 時發生錯誤 (可能訊息已刪除): {e}")
                pass
        print(f"\n--- 檢查修復完成，共修復了 {repaired_count} 筆貼文的圖片 ---\n")

    # --- 獲取指定日期範圍內訊息的總數（用於精確進度條）---
    print(f"正在取得從 {MIN_DATE_TO_PROCESS.strftime('%Y-%m-%d')} 到 {MAX_DATE_TO_PROCESS.strftime('%Y-%m-%d')} 的訊息總數 (這可能需要一些時間)...")
    total_messages_in_range = 0
    try:
        # 第一次遍歷：僅用於計數指定範圍內的訊息
        async for msg in client.iter_messages(entity, offset_date=MAX_DATE_TO_PROCESS):
            if msg.date.astimezone(TW_TZ) < MIN_DATE_TO_PROCESS:
                break
            total_messages_in_range += 1
        print(f"頻道 '{CHANNEL_USERNAME}' 從 {MIN_DATE_TO_PROCESS.strftime('%Y-%m-%d')} 到 {MAX_DATE_TO_PROCESS.strftime('%Y-%m-%d')} 總共有 {total_messages_in_range} 筆訊息，開始處理...")
    except Exception as e:
        print(f"錯誤：在計數訊息時發生錯誤: {e}")
        print("這可能是由於網路問題或 Telegram API 暫時性故障。將嘗試繼續處理但無法顯示總進度。")
        total_messages_in_range = 0 

    # 計算預估完成時間
    estimated_time_per_message = 0.1 # 每次循環的 asyncio.sleep(0.1) 時間 (不含圖片下載/上傳實際耗時)
    if total_messages_in_range > 0:
        estimated_total_seconds = total_messages_in_range * estimated_time_per_message
        estimated_end_time = datetime.datetime.now(TW_TZ) + datetime.timedelta(seconds=estimated_total_seconds)
        print(f"預計完成時間：{estimated_end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    else:
        print("無法預估完成時間，因為指定範圍內沒有訊息或無法獲取總數。")

    processed_count = 0
    # 儲存本次運行處理過的訊息，以 (date, text_key) 為鍵。
    messages_processed_in_this_run_by_key = {} 

    # --- 處理指定日期範圍內的訊息 ---
    # 第二次遍歷：實際處理訊息
    # `reverse=True` 會讓它從舊到新獲取訊息。
    async for msg in client.iter_messages(entity, offset_date=MIN_DATE_TO_PROCESS - timedelta(seconds=1), reverse=True):
        processed_count += 1

        msg_date_tw = msg.date.astimezone(TW_TZ)

        # Stop processing if the message date is outside our desired range.
        if msg_date_tw >= MAX_DATE_TO_PROCESS:
            break

        msg_date_tw_str = msg_date_tw.strftime('%Y-%m-%d')
        msg_text_original = msg.text or ""
        msg_text_key = msg_text_original.strip()[:50]  # 用於查找的文本鍵

        img_bb_url = None 
        current_post_lookup_key = (msg_date_tw_str, msg_text_key)
        
        # 檢查這條訊息是否已經在舊數據中存在，並且是否有圖片連結
        # 如果存在且有圖片連結，則跳過圖片下載和上傳，直接使用舊連結
        if current_post_lookup_key in existing_posts_by_key and existing_posts_by_key[current_post_lookup_key].get("image"):
            img_bb_url = existing_posts_by_key[current_post_lookup_key]["image"]
        elif msg.photo: # 只有當沒有舊連結或舊連結為空，且訊息確實有圖片時，才處理新圖片
            # 圖片命名邏輯
            text_snippet = (msg.text or "").strip()
            if text_snippet:
                text_snippet = re.sub(r'[\\/:*?"<>|]', '', text_snippet) 
                text_snippet = text_snippet.replace(' ', '_')
                text_snippet = text_snippet[:30] 
                if text_snippet: 
                    text_snippet = f"_{text_snippet}"
            else:
                text_snippet = "" 

            photo_mime_type = 'image/jpeg' 
            file_extension = '.jpg' 

            file_name = f"{msg_date_tw_str}_{msg.id}{text_snippet}{file_extension}"
            
            photo_bytes_io = io.BytesIO()
            
            try:
                await client.download_media(msg.photo, file=photo_bytes_io)
                img_bb_url = await upload_to_imgbb(photo_bytes_io, file_name, photo_mime_type)

            except Exception as e:
                pass 
            finally:
                photo_bytes_io.close() 
        
        # 準備 post_item 字典，現在包含 msg.id
        post_item = {
            "id": msg.id, # <--- 訊息 ID，用於唯一識別和排序
            "date": msg_date_tw_str, 
            "text": msg_text_original,
            "image": img_bb_url # 這裡直接賦值為 img_bb_url (可能為 None)
        }

        # 將此貼文加入到本次運行處理過的字典中
        messages_processed_in_this_run_by_key[current_post_lookup_key] = post_item
        
        # 顯示進度條 (單行更新)
        if total_messages_in_range > 0:
            percent = (processed_count / total_messages_in_range) * 100
            print(f"處理進度: {processed_count}/{total_messages_in_range} 筆訊息 ({percent:.2f}%)", end='\r')
        else:
            print(f"處理進度: 已處理 {processed_count} 筆訊息...", end='\r') 
        
        await asyncio.sleep(0.1) # 添加短暫延遲

    print("\n") # 處理完成後打印一個換行符，確保後續輸出從新行開始

    # --- 合併所有數據並寫入 JSON 檔案 ---
    final_posts_map = {} # 使用字典來進行精確的合併和去重，以 (date, text_key) 為主要鍵

    # 1. 將所有舊數據放入合併字典
    for post_key, post_data in existing_posts_by_key.items():
        final_posts_map[post_key] = post_data
    
    # 2. 將本次運行處理的所有訊息（新的或更新的）覆蓋或添加到合併字典中
    final_posts_map.update(messages_processed_in_this_run_by_key)

    # 3. 將合併後的字典值轉換為列表
    final_posts = list(final_posts_map.values())

    # 4. 對所有數據進行排序：按日期降序，如果日期相同，則按 ID 降序 (最新的在最上面)
    final_posts.sort(key=lambda x: (
        datetime.datetime.strptime(x['date'], '%Y-%m-%d'), 
        x.get('id', 0) # 如果有 id 則用 id 排序，否則用 0 (確保穩定性)
    ), reverse=True) # <--- 關鍵的 reverse=True 實現降序排列
    
    print(f"共擷取並準備寫入 {len(final_posts)} 筆資料。")
    
    print(f"正在寫入 {OUTPUT_JSON_FILE} ...")
    try:
        with open(OUTPUT_JSON_FILE, "w", encoding="utf-8") as f:
            json.dump(final_posts, f, ensure_ascii=False, indent=2)
        print("完成！數據已儲存。")
    except Exception as e:
        print(f"錯誤：寫入 {OUTPUT_JSON_FILE} 失敗: {e}")
    
    end_time = time.time() # 記錄結束時間
    total_duration = end_time - start_time
    print(f"--- 腳本結束運行於：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
    print(f"總耗時：{total_duration:.2f} 秒")

# 運行主程式
with client:
    client.loop.run_until_complete(main())