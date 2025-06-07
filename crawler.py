#將 https://t.me/s/jigongnews 的內容抓下來，並存成 posts.json
import requests
from bs4 import BeautifulSoup
import json

url = "https://t.me/s/jigongnews"
res = requests.get(url)
soup = BeautifulSoup(res.text, "html.parser")

posts = []
for msg in soup.select(".tgme_widget_message"):
    text_div = msg.select_one(".tgme_widget_message_text")
    text = text_div.get_text(strip=True) if text_div else ""

    # 取得時間
    time_tag = msg.select_one(".tgme_widget_message_date time")
    date_str = ""
    if time_tag and time_tag.has_attr("datetime"):
        # 例：2025-06-07T00:00:00+00:00
        date_str = time_tag["datetime"][:10]
    else:
        date_str = ""

    img_div = msg.select_one(".tgme_widget_message_photo_wrap")
    img_url = None
    if img_div and img_div.has_attr("style"):
        import re
        match = re.search(r"url\('([^']+)'\)", img_div["style"])
        if match:
            img_url = match.group(1)
    posts.append({
        "date": date_str,
        "text": text,
        "image": img_url
    })

with open("posts.json", "w", encoding="utf-8") as f:
    json.dump(posts, f, ensure_ascii=False, indent=2)