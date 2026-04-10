# ARAM Live Desk

一個可直接部署到 GitHub Pages 的 ARAM 靜態查詢頁。

## 現在的部署方式

這個版本不再依賴即時 Node API，而是改成：

- 建置時由 `scripts/build-static-data.js` 抓取最新資料
- 產生 `data/meta.json` 與 `data/champions/*.json`
- 前端直接讀取這些靜態 JSON
- 透過 GitHub Actions 定時重新產生資料並部署到 GitHub Pages

## 資料來源

- U.GG stats2：ARAM 推薦配置資料
- Riot static assets：英雄、裝備、符文與召喚師技能名稱 / 圖片

## 本機使用方式

1. 進入 `aram-helper-web`
2. 先執行 `npm run build`
3. 再執行 `npm start`
4. 用瀏覽器打開 `http://127.0.0.1:4174`

## GitHub Pages 部署方式

1. 把專案推到 GitHub repository 的 `main` branch
2. 到 GitHub repository 的 Settings -> Pages
3. 在 Build and deployment 選擇 `GitHub Actions`
4. 推送到 `main` 後，`.github/workflows/deploy-pages.yml` 會自動：
   - 產生最新靜態資料
   - 部署到 GitHub Pages
5. 此 workflow 也會每 6 小時自動更新一次資料快照

## 指令

- `npm run build`：抓取最新資料並產生靜態 JSON
- `npm run build:data`：同上
- `npm start`：啟動本機靜態檔案伺服器

## 功能

- 支援中文 / 英文搜尋英雄
- 顯示推薦出裝、符文、召喚師技能、技能點法
- 顯示 ARAM 專屬平衡調整
- 顯示道具 hover 說明
- 最近查詢會保存在瀏覽器本機