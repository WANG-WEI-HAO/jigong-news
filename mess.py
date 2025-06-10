import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone, timedelta
import json
import re
import os

# 參數設定
url = "https://t.me/s/jigongnews"
output_path = "posts.json"

# --- 1. 定義時間範圍 ---
# 台灣時區設定
tz = timezone(timedelta(hours=8))
# 取得今天、昨天、前天的日期物件
today_date = datetime.now(tz).date()
yesterday_date = today_date - timedelta(days=1)
day_before_yesterday_date = today_date - timedelta(days=2)
# 將要抓取的目標日期放入一個 set，方便快速查找
target_dates = {today_date, yesterday_date, day_before_yesterday_date}

print(f"[i] 開始執行爬蟲，目標日期為：{today_date}, {yesterday_date}, {day_before_yesterday_date}")

# --- 2. 爬取資料 ---
scraped_posts = []
try:
    res = requests.get(url, timeout=15)
    res.raise_for_status()
    soup = BeautifulSoup(res.text, "html.parser")

    for msg in soup.select(".tgme_widget_message"):
        time_tag = msg.select_one(".tgme_widget_message_date time")
        if not time_tag or not time_tag.has_attr("datetime"):
            continue

        post_time = datetime.fromisoformat(time_tag["datetime"]).astimezone(tz)
        post_date = post_time.date()

        # 如果貼文日期不在我們的目標範圍內，就跳過
        if post_date not in target_dates:
            continue

        text_div = msg.select_one(".tgme_widget_message_text")
        text = text_div.get_text(separator='\n', strip=True) if text_div else ""

        img_url = None
        img_div = msg.select_one(".tgme_widget_message_photo_wrap")
        if img_div and img_div.has_attr("style"):
            match = re.search(r"url\('([^']+)'\)", img_div["style"])
            if match:
                img_url = match.group(1)

        scraped_posts.append({
            "date": post_time.strftime("%Y-%m-%d"),
            "text": text,
            "image": img_url
        })

except requests.exceptions.RequestException as e:
    print(f"[✗] 錯誤：無法爬取頁面 {url}。原因：{e}")
    # 如果爬取失敗，就不繼續執行後面的邏輯
    exit()

print(f"[i] 從網站上成功爬取 {len(scraped_posts)} 則目標日期的貼文。")

# --- 3. 讀取舊資料 ---
old_posts = []
try:
    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        with open(output_path, "r", encoding="utf-8") as f:
            old_posts = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
    print(f"[!] 警告：'{output_path}' 檔案不存在或格式錯誤，將建立新檔案。")

# --- 4. 核心處理邏輯 ---
# 使用字典來合併資料，key是唯一識別碼(日期, 內文)，value是貼文本身。
# 這樣可以自動處理覆蓋和新增。
all_posts_dict = {}

# 第一步：先把所有舊資料讀入字典，保留歷史紀錄
for post in old_posts:
    # 確保舊資料有 date 和 text 欄位
    if post.get("date") and post.get("text") is not None:
        identifier = (post["date"], post["text"])
        all_posts_dict[identifier] = post

# 記錄更新前的總數，用於計算新增了多少筆
count_before_update = len(all_posts_dict)

# 第二步：遍歷新爬取的資料，將其加入字典。
# 如果貼文已存在，新的會覆蓋舊的；如果不存在，則為新增。
for post in scraped_posts:
    identifier = (post["date"], post["text"])
    all_posts_dict[identifier] = post

# 從字典中取出所有處理好的貼文
merged_posts = list(all_posts_dict.values())

# --- 5. 排序 ---
# 根據你的要求：「降冪排列，日期小的先進」
# 這句話本身有歧義。"降冪" (descending) 指的是大到小，而 "日期小的先進" (ascending) 指的是小到大。
# 通常日誌類文件會將最新的放在最前面，即日期降冪。我們按此標準執行。
# "2023-10-27" > "2023-10-26"，所以降冪排列後，最新的會在最上面。
final_posts = sorted(merged_posts, key=lambda p: p.get("date", ""), reverse=True)

# --- 6. 儲存 ---
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(final_posts, f, ensure_ascii=False, indent=2)

# --- 輸出結果 ---
newly_added_count = len(final_posts) - count_before_update
print("-" * 30)
if newly_added_count > 0:
    print(f"[✓] 任務完成！新增或更新了 {newly_added_count} 則貼文。")
else:
    print(f"[✓] 任務完成！資料庫已是最新，無新增貼文。")
print(f"[i] JSON 檔案中目前總共有 {len(final_posts)} 則貼文。")
