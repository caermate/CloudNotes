# 🔐 Cloudflare-Private-Notes

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Cloudflare-orange.svg)](https://www.cloudflare.com)
[![Encryption](https://img.shields.io/badge/Encryption-AES--GCM-green.svg)](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)

一个基于 Cloudflare 生态系统构建的 **零成本、永久免费、端到端加密** 的私人云笔记平台。

本方案利用浏览器原生的 **Web Crypto API**，确保所有数据在离开你的设备前就已经完成了加密。即使是 Cloudflare 的工程师或黑客进入数据库，也只能看到一串无法破译的乱码。

---

## ✨ 核心特性

- 💰 **零成本部署**：完全利用 Cloudflare 免费额度（Workers, D1, Pages）。
- 🔒 **端到端加密**：基于 Web Crypto API，服务器端仅存储 AES-GCM 加密后的密文。
- 🔥 **阅后即焚分享**：支持生成临时分享链接，对方查看一次后，数据将从数据库物理删除。
- 🤖 **AI 智能总结**：内置 Cloudflare Workers AI (Llama 3)，支持一键总结长篇笔记。
- 📱 **PWA 支持**：支持“添加到主屏幕”，在手机端提供近乎原生的 App 使用体验。
- ⚡ **全球加速**：利用 Cloudflare 边缘计算节点，实现全球极速访问。

---

## 🛠 技术架构

| 组件 | 技术栈 |
| :--- | :--- |
| **Frontend** | HTML5, Vanilla JS, CSS (Glassmorphism 风格) |
| **Backend** | [Cloudflare Workers](https://workers.cloudflare.com/) (Serverless) |
| **Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQL Database) |
| **Encryption**| AES-GCM 算法 (256-bit) |
| **AI Engine** | Cloudflare Workers AI (Llama 3) |

---

## 🚀 部署指南

### 1. 创建 D1 数据库
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 进入 **存储与数据库 > D1**，创建数据库命名为 `my-notes`。
3. 在数据库控制台中点击 **控制台 (Console)**，执行以下 SQL 初始化表结构：
   ```sql
   DROP TABLE IF EXISTS notes;
   CREATE TABLE IF NOT EXISTS notes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     content TEXT NOT NULL,
     public_id TEXT,
     is_share_copy INTEGER DEFAULT 0,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );

### 2. 配置 Workers 后端
1. 创建一个新的 Worker（例如：`notes-api`）。
2. 在 **设置 > 绑定** 中添加：
   - **D1 数据库绑定**：变量名必须为 `DB`，指向你创建的 `my-notes`。
   - **AI 绑定**：变量名必须为 `AI`。
3. 在 **设置 > 变量和机密** 中添加：
   - **变量名**：`ADMIN_KEY`
   - **变量值**：设置一个你自己的 API 访问秘钥（用于前端身份验证）。
4. 将 `worker.js` 的源码粘贴到编辑器中并点击 **部署**。

### 3. 部署前端页面
1. 将 `index.html`, `manifest.json`, `sw.js` 等前端文件上传至你的 GitHub 仓库。
2. 在 Cloudflare 控制台中进入 **Pages**，关联该 GitHub 仓库。
3. 部署完成后，**建议** 绑定一个自定义域名以获得更稳定的访问。

---

## 💾 自动备份配置 (WebDAV)

为增强数据安全性，建议为 Worker 添加自动备份功能，将数据库定期导出到您的 WebDAV 存储。

### 1. 添加环境变量
在 Worker 的 **设置 > 变量和机密** 中，添加以下环境变量：

| 变量名 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `WEBDAV_URL` | WebDAV 服务根目录地址 | `https://dav.jianguoyun.com/dav/` |
| `WEBDAV_USER` | WebDAV 用户名 | `your-username` |
| `WEBDAV_PASS` | WebDAV 密码 | `your-password` |

### 2. 启用定时备份
在 Worker 的 **触发器 (Triggers)** 设置中，添加 **Cron Trigger**：
- **Cron 表达式**：`0 */12 * * *` （每 12 小时自动备份一次）。

### 3. 手动触发备份
访问：`https://你的worker域名/api/backup?auth=你的admin_key`

---

## 📖 使用说明

1. **配置连接**：首次打开页面，输入你的 Worker API 地址和 `admin_key`。
2. **本地加密**：设置一个“笔记主密码”。**请务必牢记**，此密码仅保存在本地，丢失后数据将无法破译。
3. **加密存储**：输入内容并点击“加密入云”。
4. **阅后即焚**：在笔记列表点击“分享”，链接被他人解密读取后会自动从数据库中物理删除。
5. **移动端**：在浏览器中点击“添加到主屏幕”即可生成桌面图标。

---

## ⚠️ 注意事项

- **密码即钥匙**：由于采用端到端加密，忘记主密码 = 永久失去笔记。
- **自定义域名**：强烈建议使用自定义域名以避免 `*.workers.dev` 的连接限制。

## 📺 视频教程
[私隱加密筆記部署教程 - YouTube](https://www.youtube.com/watch?v=socPi5-GyIA)

---

### 🤝 致谢
本项目逻辑参考自 YouTube 频道 [@三十槽](https://www.youtube.com/@sanshicao) 的相关教程。
