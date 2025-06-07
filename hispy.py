#把歷史貼爬取下來
from telethon import TelegramClient
import json
import os
from datetime import timezone, timedelta

api_id = 24497815
api_hash = 'a97f0ae369dae84561e49303c377ced5'
channel = 'jigongnews'
output_filename = "posts.json"

client = TelegramClient('anon', api_id, api_hash)

# 台灣時區
TW_TZ = timezone(timedelta(hours=8))

async def main():
    existing_images_lookup = {}
    if os.path.exists(output_filename):
        print(f"正在讀取現有的 {output_filename} 以保留圖片資訊...")
        try:
            with open(output_filename, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
            for post in existing_data:
                # 使用 (日期, 文本摘要) 作為鍵來查找，文本摘要僅用於查找
                text_key = (post.get("text") or "").strip()[:50] # 取前50字符作為簡化鍵
                existing_images_lookup[(post.get("date"), text_key)] = post.get("image")
            print(f"已讀取 {len(existing_images_lookup)} 筆舊貼文的圖片資訊。")
        except Exception as e:
            print(f"讀取或處理 {output_filename} 失敗: {e}。將不保留舊圖片資訊。")

    posts = []
    # os.makedirs("images", exist_ok=True) # 註解掉創建圖片資料夾的功能
    print("正在取得訊息總數...")
    # 先取得總數
    total = 0
    async for _ in client.iter_messages(channel):
        total += 1
    print(f"總共 {total} 筆訊息，開始處理...")

    count = 0
    async for msg in client.iter_messages(channel):
        # 將訊息時間轉換為台灣時區的 YYYY-MM-DD 格式字串
        msg_date_tw_str = msg.date.astimezone(TW_TZ).strftime('%Y-%m-%d')
        msg_text_original = msg.text or ""
        msg_text_key = msg_text_original.strip()[:50] # 用於查找的文本鍵

        current_image_path = None
        # if msg.photo: # 註解掉圖片下載相關邏輯
            # filename = f"images/{msg.date.strftime('%Y-%m-%d')}_{msg.id}.jpg"
            # print(f"下載圖片：{filename}")
            # image_path = await client.download_media(msg.photo, file=filename)
            # pass # 如果有照片，但我們不下載，則 image_path 保持為 None
        
        # 查找現有圖片資訊
        if (msg_date_tw_str, msg_text_key) in existing_images_lookup:
            current_image_path = existing_images_lookup[(msg_date_tw_str, msg_text_key)]
        
        posts.append({
            "date": msg_date_tw_str, # 使用台灣時區日期
            "text": msg_text_original,
            "image": current_image_path # 保留舊資料的image值，若無則為null
        })
        count += 1
        percent = (count / total) * 100
        print(f"已處理 {count}/{total} 筆訊息 ({percent:.2f}%)", end='\r')
    print(f"\n共擷取到 {len(posts)} 筆資料，正在寫入 {output_filename} ...")
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    print("完成！")

with client:
    client.loop.run_until_complete(main())