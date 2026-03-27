# Cloudflare-Private-Notes 🔐

一个基于 Cloudflare 生态系统构建的 **零成本、永久免费、端到端加密** 的私人云笔记平台。

本方案利用浏览器原生的 Web Crypto API，确保所有数据在离开你的设备前就已经完成了加密。即使是 Cloudflare 的工程师或黑客进入数据库，也只能看到一串无法破译的乱码。

---

## ✨ 核心特性

- 💰 **零成本部署**：完全利用 Cloudflare 免费额度（Workers, D1, Pages）。
- 🔒 **端到端加密**：基于 Web Crypto API，服务器端仅存储 AES-GCM 加密后的密文。
- 🔥 **阅后即焚分享**：支持生成临时分享链接，对方查看一次后，数据将从数据库物理删除。
- 🤖 **AI 智能总结**：内置 Cloudflare Workers AI (Llama 模型)，支持一键免费总结长篇笔记。
- 📱 **PWA 支持**：支持“添加到主屏幕”，在手机端提供近乎原生的 App 使用体验。
- ⚡ **全球加速**：利用 Cloudflare 边缘计算节点，实现全球极速访问。

---

## 🛠 技术架构

- **Frontend**: HTML5, Vanilla JS, CSS (Glassmorphism 磨砂玻璃风格)
- **Backend**: [Cloudflare Workers](https://workers.cloudflare.com/) (Serverless)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQL Database)
- **Encryption**: AES-GCM 算法 (256-bit)
- **AI Engine**: Cloudflare Workers AI (Llama 3)

---

## 🚀 部署指南

### 1. 创建 D1 数据库
1. 登录 Cloudflare 控制台，进入 **存储与数据库 > D1**。
2. 创建数据库，命名为 `my-notes`。
3. 进入数据库控制台，执行以下 SQL 初始化表结构：
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
  1. 创建一个新的 Worker（例如：notes-api）。
  2. 在 设置 > 绑定 中添加：
      D1 数据库绑定：变量名必须为 DB，指向你创建的 my-notes。
      AI 绑定：变量名必须为 AI。
  3. 在 设置 > 变量和机密 中添加：
      变量名：admin_key
      变量值：设置一个你自己的 API 访问秘钥（用于前端验证）。
  4.将 worker.js 的源码粘贴并 部署。
### 3. 部署前端页面
  1. 将 index.html, manifest.json, sw.js 等前端文件上传至 GitHub 仓库。
  2. 在 Cloudflare Pages 中关联该 GitHub 仓库。
  3. 部署完成后，建议绑定一个自定义域名以获得更稳定的访问。

### 4. 备份配置（可选）
  为增强数据安全性，可以为 Worker 添加自动备份功能，将笔记数据库定期导出并保存到您自己的 WebDAV 存储（如 Nextcloud、坚果云等）。
  1. 准备 WebDAV 存储
   选择支持 WebDAV 协议的服务，获取访问地址、用户名和密码。
      1. Nextcloud 示例：https://your-domain.com/remote.php/dav/files/username/
      2. 坚果云 示例：https://dav.jianguoyun.com/dav/
      3. 城通网盘 实例：https://webdav.ctfile.com/*****/
   建议在 WebDAV 根目录下手动创建 CloudNotes/ 文件夹（部分服务会自动创建，若不支持需提前创建）。

  2. 添加备份环境变量
   在 Worker 的 设置 > 变量和机密 中，继续添加以下三个环境变量：

|变量名|说明|示例值|
|----------|----------------------|------------------------------|
|WEBDAV_URL|WebDAV 服务的根目录地址|https://dav.jianguoyun.com/dav/|
|WEBDAV_USER|WebDAV 用户名|your-username|
|WEBDAV_PASS|WebDAV 密码|your-password|

  3. 启用定时备份
   在 Worker 的触发器设置中，添加 Cron Trigger（若使用 wrangler.toml 则添加以下配置）：  
     
      crons = ["0 */12 * * *"]   # 每 12 小时备份一次
   定时任务执行时，会将当前所有笔记导出为 JSON 文件（命名格式 notes_db_backup_YYYY-MM-DDTHH-MM-SS-XXXZ.json），并上传到 WebDAV 的 CloudNotes/ 目录下。
  4. 手动触发备份（可选）
  备份接口已集成到 Worker 中，您可以通过以下方式手动触发：
    浏览器地址栏（GET 请求）：
    https://你的worker域名/api/backup?auth=你的ADMIN_KEY
    返回 JSON 结果，包含备份文件名和 WebDAV 地址。
    开发者工具控制台（POST 请求）：

    fetch('https://你的worker域名/api/backup', {
      method: 'POST',
      headers: { 'Authorization': '你的ADMIN_KEY' }
    }).then(r=>r.json()).then(console.log);

  5. 验证备份
    使用 WebDAV 客户端访问 CloudNotes/ 目录，检查生成的 JSON 备份文件，确认内容为完整的数据库记录。 
 
### 📖 使用说明
  1. 初始化：首次打开页面，输入你的 Worker API 地址（如 https://api.yourdomain.com）和 admin_key。
  2. 本地加密：设置一个“笔记主密码”。请务必牢记，此密码不上传服务器，丢失后无法找回内容。
  3. 加密存储：输入笔记内容，点击“加密入云”。
  4. 阅后即焚：在笔记列表点击“分享”，生成的链接在被他人解密读取后会自动从数据库中抹除。
  5. 手机端：在 Chrome 或 Safari 中打开地址，点击“添加到主屏幕”即可生成桌面图标。

### 注意事项
  密码即钥匙：由于采用端到端加密，忘记加密密码意味着永久失去笔记明文。
  域名建议：为了避免 *.workers.dev 在部分环境下的连接问题，强烈建议使用自定义域名。

## 部署视频教程
[私隱加密筆記](https://www.youtube.com/watch?v=socPi5-GyIA)

致谢：本项目逻辑参考自 YouTube 频道 @三十槽 的相关教程。
