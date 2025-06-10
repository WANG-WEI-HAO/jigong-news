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
tz = timezone(timedelta(hours=8))
today_date = datetime.now(tz).date()
yesterday_date = today_date - timedelta(days=1)
day_before_yesterday_date = today_date - timedelta(days=2)

# 建立一個集合，包含所有需要被新資料覆蓋的日期
dates_to_overwrite = {today_date, yesterday_date, day_before_yesterday_date}

print(f"[i] 開始執行任務...")
print(f"[i] 今天日期: {today_date}")
print(f"[i] 將會更新/覆蓋以下日期的資料: {sorted(list(dates_to_overwrite), reverse=True)}")

# --- 2. 爬取最新資料 ---
try:
    res = requests.get(url, timeout=15)
    res.raise_for_status()
except requests.exceptions.RequestException as e:
    print(f"[✗] 錯誤：無法爬取頁面 {url}。原因：{e}")
    exit()

soup = BeautifulSoup(res.text, "html.parser")

# --- 3. 分類爬取結果 ---
# 建立容器來存放爬取到的、在目標日期範圍內的貼文
scraped_posts_in_range = []

for msg in soup.select(".tgme_widget_message"):
    time_tag = msg.select_one(".tgme_widget_message_date time")
    if not time_tag or not time_tag.has_attr("datetime"):
        continue

    post_time = datetime.fromisoformat(time_tag["datetime"]).astimezone(tz)
    post_date = post_time.date()

    # 只處理在我們目標日期範圍內的貼文
    if post_date in dates_to_overwrite:
        text_div = msg.select_one(".tgme_widget_message_text")
        text = text_div.get_text(separator='\n', strip=True) if text_div else ""

        img_url = None
        img_div = msg.select_one(".tgme_widget_message_photo_wrap")
        if img_div and img_div.has_attr("style"):
            match = re.search(r"url\('([^']+)'\)", img_div["style"])
            if match:
                img_url = match.group(1)

        post_data = {
            "date": post_time.strftime("%Y-%m-%d"),
            "text": text,
            "image": img_url
        }
        scraped_posts_in_range.append(post_data)

print(f"[i] 從網站上爬取到 {len(scraped_posts_in_range)} 則目標日期範圍內的貼文。")

# --- 4. 處理本地資料 ---
# 讀取現有JSON檔案
try:
    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        with open(output_path, "r", encoding="utf-8") as f:
            all_local_posts = json.load(f)
    else:
        all_local_posts = []
except json.JSONDecodeError:
    print(f"[!] 警告：'{output_path}' 檔案格式錯誤或為空，將視為空資料庫。")
    all_local_posts = []

# 篩選出所有不需要被覆蓋的舊歷史資料
# 即，日期不在 dates_to_overwrite 集合中的貼文
surviving_historical_posts = []
for post in all_local_posts:
    try:
        # 將JSON中的日期字串轉為date物件進行比較
        local_post_date = datetime.strptime(post.get("date", ""), "%Y-%m-%d").date()
        if local_post_date not in dates_to_overwrite:
            surviving_historical_posts.append(post)
    except (ValueError, TypeError):
        # 如果日期格式不對或缺少，也當作歷史資料保留
        print(f"[!] 警告：發現一筆格式錯誤的本地資料，將其保留: {post.get('text', 'N/A')[:20]}...")
        surviving_historical_posts.append(post)


# --- 5. 合併與去重 ---
# 將「爬取到的新資料」和「需要保留的舊歷史資料」合併
# 爬取到的資料放在前面，確保它們是最新
combined_posts = scraped_posts_in_range + surviving_historical_posts

# 進行最終的、徹底的去重，以確保資料的唯一性
final_posts = []
seen_identifiers = set()
for post in combined_posts:
    # 使用 (日期, 內文) 作為唯一標識
    identifier = (post.get("date"), post.get("text"))
    if identifier not in seen_identifiers:
        final_posts.append(post)
        seen_identifiers.add(identifier)
        
# --- 6. 儲存結果 ---
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(final_posts, f, ensure_ascii=False, indent=2)

# 計算新增了多少筆
newly_added_count = len(final_posts) - len(all_local_posts)

print("-" * 30)
if newly_added_count > 0:
    print(f"[✓] 任務成功！淨增加 {newly_added_count} 則貼文。")
elif newly_added_count == 0:
    print(f"[✓] 任務成功！資料已同步，沒有新增貼文。")
else:
    print(f"[✓] 任務成功！資料已同步，淨減少 {-newly_added_count} 則過期貼文。")
print(f"[i] 最終檔案包含 {len(final_posts)} 則貼文。")
