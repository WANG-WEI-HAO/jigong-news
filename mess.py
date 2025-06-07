import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
import json
import re
import os

# 參數設定
url = "https://t.me/s/jigongnews"
output_path = "posts.json"

# 台灣時區設定
tz = timezone(timedelta(hours=8))
today = datetime.now(tz).date()
seven_am = datetime(today.year, today.month, today.day, 7, 0, 0, tzinfo=tz)

# 讀取原有資料（若檔案存在）
if os.path.exists(output_path):
    with open(output_path, "r", encoding="utf-8") as f:
        old_posts = json.load(f)
else:
    old_posts = []

# 建立新資料容器
new_posts = []

# 爬取頁面
res = requests.get(url)
soup = BeautifulSoup(res.text, "html.parser")

for msg in soup.select(".tgme_widget_message"):
    # 文字
    text_div = msg.select_one(".tgme_widget_message_text")
    # 修改此處以保留換行符號
    text = text_div.get_text(separator='\n', strip=True) if text_div else ""

    # 時間處理
    time_tag = msg.select_one(".tgme_widget_message_date time")
    if not time_tag or not time_tag.has_attr("datetime"):
        continue

    post_time = datetime.fromisoformat(time_tag["datetime"]).astimezone(tz)

    if post_time.date() != today or post_time >= seven_am:
        continue

    # 圖片
    img_url = None
    img_div = msg.select_one(".tgme_widget_message_photo_wrap")
    if img_div and img_div.has_attr("style"):
        match = re.search(r"url\('([^']+)'\)", img_div["style"])
        if match:
            img_url = match.group(1)

    # 資料格式
    post_data = {
        "date": post_time.strftime("%Y-%m-%d"),
        "text": text,
        "image": img_url
    }

    # 檢查是否重複（避免儲存舊訊息）
    is_duplicate = False
    for existing_post in old_posts + new_posts:
        if existing_post.get("date") == post_data.get("date") and \
           existing_post.get("text") == post_data.get("text"):
            is_duplicate = True
            break
    
    if not is_duplicate:
        new_posts.append(post_data)

# 合併新舊（新 → 舊）
final_posts = []
temp_set = set() 

for post in new_posts + old_posts:
    post_date = post.get("date", "")
    post_text = post.get("text", "")
    identifier = (post_date, post_text)
    if identifier not in temp_set:
        final_posts.append(post)
        temp_set.add(identifier)

# 儲存
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(final_posts, f, ensure_ascii=False, indent=2)

print(f"[✓] 新增 {len(new_posts)} 則訊息，總共 {len(final_posts)} 則訊息儲存。")
