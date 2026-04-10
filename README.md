# ARAM Live Desk

一個會即時抓取最新 ARAM 推薦資料的本機網頁。

## 資料來源

- U.GG stats2：最新 ARAM 推薦配置資料
- Riot static assets：英雄、裝備、符文與召喚師技能名稱/圖片

## 使用方式

1. 進入 `aram-helper-web`
2. 執行 `node server.js` 或 `npm start`
3. 用瀏覽器打開 `http://127.0.0.1:4174`
4. 輸入英雄名稱查詢最新 ARAM 建議

## 功能

- 支援中文 / 英文搜尋英雄
- 每次查詢都抓最新版本資料
- 顯示推薦出裝、符文、召喚師技能、技能點法
- 顯示 ARAM 專屬平衡調整
- 最近查詢會保存在瀏覽器本機
