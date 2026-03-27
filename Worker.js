// ---------- 创建 WebDAV 目录（如果不存在） ----------
async function ensureDirectoryExists(dirUrl, authHeader) {
  try {
    const response = await fetch(dirUrl, {
      method: "MKCOL",
      headers: { "Authorization": authHeader },
    });
    // 如果目录已存在或创建成功，返回 true
    if (response.status === 200 || response.status === 201 || response.status === 405 || response.status === 409) {
      return { success: true, status: response.status };
    }
    return { success: false, status: response.status, error: await response.text() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---------- 备份函数（可复用，带详细错误信息） ----------
async function performBackup(env) {
  const { WEBDAV_URL, WEBDAV_USER, WEBDAV_PASS } = env;
  if (!WEBDAV_URL || !WEBDAV_USER || !WEBDAV_PASS) {
    return { success: false, error: "缺少 WebDAV 配置" };
  }

  try {
    // 从 D1 读取所有数据
    const { results } = await env.DB.prepare("SELECT * FROM notes").all();
    if (!results || results.length === 0) {
      return { success: false, error: "数据库无数据" };
    }

    // 生成备份文件
    const backupContent = JSON.stringify(results, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `notes_db_backup_${timestamp}.json`;

    // 构建 WebDAV URL，确保路径中包含 CloudNotes 子目录
    let baseUrl = WEBDAV_URL.endsWith('/') ? WEBDAV_URL : `${WEBDAV_URL}/`;
    if (!baseUrl.includes('/CloudNotes/') && !baseUrl.endsWith('CloudNotes/')) {
      baseUrl = `${baseUrl}CloudNotes/`;
    }
    const targetUrl = `${baseUrl}${fileName}`;

    // Basic Auth（支持 Unicode）
    const authString = `${WEBDAV_USER}:${WEBDAV_PASS}`;
    const encodedAuth = btoa(unescape(encodeURIComponent(authString)));
    const authHeader = `Basic ${encodedAuth}`;

    // 尝试创建目录，并记录结果
    const dirResult = await ensureDirectoryExists(baseUrl, authHeader);
    if (!dirResult.success) {
      console.error(`创建目录失败: ${dirResult.error || `状态码 ${dirResult.status}`}`);
      // 即使目录创建失败，也继续尝试上传，可能服务器会自动创建或目录已存在
    }

    // 上传文件
    let uploadResponse;
    try {
      uploadResponse = await fetch(targetUrl, {
        method: "PUT",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
          "User-Agent": "Cloudflare-Worker-Backup"
        },
        body: backupContent,
      });
    } catch (fetchErr) {
      return {
        success: false,
        error: `网络请求异常: ${fetchErr.message}`,
        details: fetchErr.cause || "无详细信息"
      };
    }

    if (uploadResponse.ok) {
      return { success: true, fileName, url: targetUrl };
    } else {
      const errorText = await uploadResponse.text();
      return {
        success: false,
        error: `上传失败: ${uploadResponse.status}`,
        details: errorText,
        url: targetUrl
      };
    }
  } catch (err) {
    return { success: false, error: err.message, stack: err.stack };
  }
}

export default {
  async scheduled(event, env, ctx) {
    console.log("启动定时备份任务...");
    const result = await performBackup(env);
    if (result.success) {
      console.log(`定时备份成功: ${result.fileName}`);
    } else {
      console.error(`定时备份失败: ${result.error}`, result.details || "");
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (!env.DB) {
      return Response.json({ error: "D1 未绑定" }, { status: 500, headers: corsHeaders });
    }

    function isAuthenticated(request, env) {
      let authToken = request.headers.get("Authorization");
      if (authToken && authToken.startsWith("Bearer ")) {
        authToken = authToken.slice(7);
      }
      if (authToken === env.ADMIN_KEY) return true;
      const url = new URL(request.url);
      const authParam = url.searchParams.get("auth");
      if (request.method === "GET" && authParam === env.ADMIN_KEY) return true;
      return false;
    }

    try {
      // 公开分享接口
      if (url.pathname.startsWith("/api/share/")) {
        if (request.method !== "GET") {
          return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
        }
        const pid = url.pathname.split("/").pop();
        const { results } = await env.DB.prepare(
          "DELETE FROM notes WHERE public_id = ? AND is_share_copy = 1 RETURNING content"
        ).bind(pid).all();
        if (results && results.length > 0) {
          return Response.json(results[0], { headers: corsHeaders });
        }
        return Response.json({ error: "失效或已被焚毁" }, { status: 404, headers: corsHeaders });
      }

      // 需要认证的接口
      if (!isAuthenticated(request, env)) {
        return Response.json({ error: "暗号错误" }, { status: 401, headers: corsHeaders });
      }

      // 手动备份
      if (url.pathname === "/api/backup" && (request.method === "POST" || request.method === "GET")) {
        const result = await performBackup(env);
        return Response.json(result, { headers: corsHeaders });
      }

      // 保存笔记
      if (url.pathname === "/api/save" && request.method === "POST") {
        const { content, public_id, is_share } = await request.json();
        const isShareCopy = (is_share == true || is_share == "true" || is_share == 1) ? 1 : 0;
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
        if (!env.AI) {
          return Response.json({ error: "AI 服务未配置" }, { status: 501, headers: corsHeaders });
        }
        const { text } = await request.json();
        const aiRes = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant. You must summarize the content provided by the user. CRITICAL RULE: If the content is in Chinese, you MUST summarize in Chinese. If the content is in English, you MUST summarize in English.",
            },
            { role: "user", content: `Please summarize this:\n${text}` },
          ],
        });
        return Response.json({ summary: aiRes.response }, { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (e) {
      console.error(`接口处理错误: ${e.message}\n${e.stack}`);
      return Response.json({ error: "服务器内部错误" }, { status: 500, headers: corsHeaders });
    }
  },
};
