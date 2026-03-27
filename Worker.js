export default {
  // 处理 HTTP 请求
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // 处理预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ---------- 公开分享接口（无需认证）----------
      if (url.pathname.startsWith("/api/share/")) {
        // 仅允许 GET 请求
        if (request.method !== "GET") {
          return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
        }

        const pid = url.pathname.split("/").pop();
        // 查询分享笔记（必须是分享副本）
        const res = await env.DB.prepare(
          "SELECT content FROM notes WHERE public_id = ? AND is_share_copy = 1"
        ).bind(pid).first();

        if (res) {
          // 删除该分享笔记（增加 is_share_copy 条件防止误删普通笔记）
          await env.DB.prepare(
            "DELETE FROM notes WHERE public_id = ? AND is_share_copy = 1"
          ).bind(pid).run();
          return Response.json(res, { headers: corsHeaders });
        }

        // 未找到或已焚毁
        return Response.json(
          { error: "失效或已被焚毁" },
          { status: 404, headers: corsHeaders }
        );
      }

      // ---------- 以下接口需要认证 ----------
      const auth = request.headers.get("Authorization");
      if (auth !== env.ADMIN_KEY) {
        return Response.json(
          { error: "暗号错误" },
          { status: 401, headers: corsHeaders }
        );
      }

      // 保存笔记（普通笔记或分享副本）
      if (url.pathname === "/api/save" && request.method === "POST") {
        const { content, public_id, is_share } = await request.json();
        // 严格判断是否为分享副本（支持布尔值或字符串 "true"）
        const isShareCopy = (is_share === true || is_share === "true") ? 1 : 0;
        await env.DB.prepare(
          "INSERT INTO notes (content, public_id, is_share_copy) VALUES (?, ?, ?)"
        ).bind(content, public_id || null, isShareCopy).run();
        return new Response("OK", { headers: corsHeaders });
      }

      // 获取普通笔记列表
      if (url.pathname === "/api/list") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM notes WHERE is_share_copy = 0 ORDER BY created_at DESC"
        ).all();
        return Response.json(results, { headers: corsHeaders });
      }

      // 删除普通笔记
      if (url.pathname === "/api/delete" && request.method === "POST") {
        const { id } = await request.json();
        await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
        return new Response("Deleted", { headers: corsHeaders });
      }

      // AI 总结
      if (url.pathname === "/api/ai-sum" && request.method === "POST") {
        const { text } = await request.json();
        const aiRes = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant. You must summarize the content provided by the user. CRITICAL RULE: If the content is in Chinese, you MUST summarize in Chinese. If the content is in English, you MUST summarize in English.",
            },
            { role: "user", content: `Please summarize this:\n${text}` },
          ],
        });
        return Response.json({ summary: aiRes.response }, { headers: corsHeaders });
      }

      // 可选：手动触发备份的接口（需要认证），便于测试
      if (url.pathname === "/api/backup" && request.method === "POST") {
        await performBackup(env);
        return Response.json({ message: "Backup triggered" }, { headers: corsHeaders });
      }

      // 未匹配任何路由
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (e) {
      // 统一错误处理，返回 JSON 格式
      return Response.json(
        { error: e.message },
        { status: 500, headers: corsHeaders }
      );
    }
  },

  // 定时任务：每 12 小时执行一次备份（cron 表达式：0 */12 * * *）
  async scheduled(event, env, ctx) {
    await performBackup(env);
  }
};

// 独立的备份函数，供 scheduled 和手动接口调用
async function performBackup(env) {
  const webdavUrl = env.WEBDAV_URL;
  const webdavUser = env.WEBDAV_USER;
  const webdavPass = env.WEBDAV_PASS;
  
  // 若未配置 WebDAV 参数，则跳过备份并记录日志
  if (!webdavUrl || !webdavUser || !webdavPass) {
    console.log('WebDAV credentials not set, skipping backup');
    return;
  }

  try {
    // 1. 从 D1 数据库获取所有笔记（包括分享副本）
    const { results } = await env.DB.prepare(
      "SELECT * FROM notes ORDER BY id"
    ).all();

    // 2. 构造备份数据对象，包含时间戳
    const backupData = {
      timestamp: new Date().toISOString(),
      notes: results
    };
    const jsonStr = JSON.stringify(backupData, null, 2);

    // 3. 生成备份文件名（如 backup_2025-04-09T10-30-00.json）
    const date = new Date();
    const fileName = `backup_${date.toISOString().replace(/[:.]/g, '-')}.json`;

    // 4. 拼接完整的 WebDAV 目标 URL
    const url = new URL(webdavUrl);
    // 确保路径以 / 结尾，然后拼接文件名
    url.pathname = url.pathname.endsWith('/') 
      ? url.pathname + fileName 
      : url.pathname + '/' + fileName;

    // 5. 使用 Basic Auth 上传文件
    const auth = btoa(`${webdavUser}:${webdavPass}`);
    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: jsonStr
    });

    if (response.ok) {
      console.log(`Backup successful: ${fileName}`);
    } else {
      console.log(`Backup failed: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.error('Backup error:', err);
  }
}
