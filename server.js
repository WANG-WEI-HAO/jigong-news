// 在檔案最上方加入 dotenv 的設定，讓 Node.js 能讀取 .env 檔案
require('dotenv').config();

const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const cors = require('cors'); // 引入 cors 套件

const app = express();

// 啟用 CORS，允許來自任何來源的請求。
// 在正式產品中，可以設定只允許您的前端網域。
app.use(cors());

// 使用 body-parser 中介軟體
app.use(bodyParser.json());

// 靜態檔案服務，讓前端檔案可以被存取
app.use(express.static(path.join(__dirname, '.')));

// VAPID 金鑰設定 (從環境變數讀取，更安全)
// process.env.XXX 會在部署平台 (如 Render) 上設定
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BFdXzOopHbpicL8NLTZ8afEXSQdwMPXBdFZiAg_f_yUUq1tYV7qAgvx5XcsZMRAYANX7M5GH_-xfapqhPivirmc',
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

// 檢查私鑰是否存在，若不存在則提醒開發者
if (!vapidKeys.privateKey) {
  console.error('錯誤：VAPID_PRIVATE_KEY 未設定！請在環境變數中設定。');
}

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_MAILTO || 'your-email@example.com'}`,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// 用於儲存訂閱資訊，正式環境請使用資料庫
let subscriptions = [];

if (fs.existsSync('subscriptions.json')) {
    const subs_data = fs.readFileSync('subscriptions.json', 'utf8');
    subscriptions = JSON.parse(subs_data);
}

// 訂閱端點
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  // 簡單檢查避免重複訂閱
  if (!subscriptions.find(s => s.endpoint === subscription.endpoint)) {
      subscriptions.push(subscription);
      console.log('新增訂閱:', subscription.endpoint);
      fs.writeFileSync('subscriptions.json', JSON.stringify(subscriptions, null, 2));
  }
  res.status(201).json({});
});

// 觸發推播的端點 (用於測試)
app.post('/send-notification', (req, res) => {
  // 讀取最新的濟公報文章作為推播內容
  const postsData = fs.readFileSync(path.join(__dirname, 'posts.json'), 'utf8');
  const posts = JSON.parse(postsData);
  const latestPost = posts[0];

  // 提取標題和內文
  const textParts = latestPost.text.split('\n');
  const title = textParts.length > 2 ? textParts[1] : '新的濟公報文章';
  const body = textParts.length > 3 ? textParts.slice(2).join('\n').trim() : '點擊查看最新內容';

  const payload = JSON.stringify({
    title: `濟公報: ${title}`,
    body: body.substring(0, 100) + '...', // 截斷部分內文
    image: latestPost.image,
    url: './index.html' // 點擊通知後開啟的頁面
  });

  console.log(`準備發送通知給 ${subscriptions.length} 位訂閱者...`);

  Promise.all(subscriptions.map(sub => webpush.sendNotification(sub, payload)))
    .then(() => res.status(200).json({ message: '通知發送成功' }))
    .catch(err => {
      console.error('發送通知時發生錯誤', err);
      // 如果訂閱已過期或失效，可以從儲存中移除
      if (err.statusCode === 410) {
        subscriptions = subscriptions.filter(s => s.endpoint !== err.endpoint);
        fs.writeFileSync('subscriptions.json', JSON.stringify(subscriptions, null, 2));
      }
      res.sendStatus(500);
    });
});

// 部署平台通常會提供 PORT 環境變數
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`伺服器正在 http://localhost:${port} 上運行`);
});