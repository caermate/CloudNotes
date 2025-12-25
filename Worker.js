export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
      if (url.pathname.startsWith("/api/share/")) {
        const pid = url.pathname.split("/").pop();
        const res = await env.DB.prepare("SELECT content FROM notes WHERE public_id = ? AND is_share_copy = 1").bind(pid).first();
        if (res) {
          await env.DB.prepare("DELETE FROM notes WHERE public_id = ?").bind(pid).run();
          return Response.json(res, { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: "失效或已被焚毁" }), { status: 404, headers: corsHeaders });
      }

      const auth = request.headers.get("Authorization");
      if (auth !== env.ADMIN_KEY) {
        return new Response(JSON.stringify({ error: "暗号错误" }), { status: 401, headers: corsHeaders });
      }

      if (url.pathname === "/api/save" && request.method === "POST") {
        const { content, public_id, is_share } = await request.json();
        await env.DB.prepare("INSERT INTO notes (content, public_id, is_share_copy) VALUES (?, ?, ?)")
          .bind(content, public_id || null, is_share ? 1 : 0).run();
        return new Response("OK", { headers: corsHeaders });
      }

      if (url.pathname === "/api/list") {
        const { results } = await env.DB.prepare("SELECT * FROM notes WHERE is_share_copy = 0 ORDER BY created_at DESC").all();
        return Response.json(results, { headers: corsHeaders });
      }

      if (url.pathname === "/api/delete" && request.method === "POST") {
        const { id } = await request.json();
        await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
        return new Response("Deleted", { headers: corsHeaders });
      }

      if (url.pathname === "/api/ai-sum" && request.method === "POST") {
        const { text } = await request.json();
        const aiRes = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [
            { role: 'system', content: 'You are a helpful assistant. You must summarize the content provided by the user. CRITICAL RULE: If the content is in Chinese, you MUST summarize in Chinese. If the content is in English, you MUST summarize in English.' },
            { role: 'user', content: `Please summarize this:\n${text}` }
          ]
        });
        return Response.json({ summary: aiRes.response }, { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }
};