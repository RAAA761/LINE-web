import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { loginWithAuthToken } from "jsr:@evex/linejs@2.1.5";
import { FileStorage } from "jsr:@evex/linejs@2.1.5/storage";

console.log("[INFO] LINE 操作サーバー起動...");

serve(async (req) => {
  const url = new URL(req.url);
  const pathname = url.pathname;
  console.log("[REQUEST]", req.method, pathname);

  if (req.method === "GET" && (pathname === "/" || pathname.endsWith(".html"))) {
    const filePath = pathname === "/" ? "./control.html" : `.${pathname}`;
    try {
      return await serveFile(req, filePath);
    } catch {
      return new Response("ファイルが見つかりません", { status: 404 });
    }
  }

  if (req.method === "POST") {
    const body = await req.json();
    const token = body.token;
    const action = body.action;
    const text = body.text ?? "デフォルトメッセージ";
    const squareChatMid = body.squareChatMid ?? "";

    if (!token || !action) {
      return new Response("tokenとactionは必須です", { status: 400 });
    }

    try {
      const client = await loginWithAuthToken(token, {
        device: "DESKTOPWIN",
        storage: new FileStorage("./line_storage"),
      });

      if (action === "squares") {
        const chats = await client.fetchJoinedSquareChats();
        const result = chats.map(c => ({
          squareChatMid: c.raw.squareChatMid,
          name: c.raw.name,
        }));
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      } else if (action === "send") {
        await client.base.square.sendMessage({ squareChatMid, text });
        return new Response("メッセージを送信しました", { status: 200 });
      } else if (action === "messages") {
        const response = await client.base.square.fetchSquareChatEvents({  
          squareChatMid,  
          limit: 150,  
        });  
        console.log("取得したイベント数:", response.events.length);
        return new Response(JSON.stringify(response.events, (_, v) => typeof v === "bigint" ? v.toString() : v), {
          headers: { "Content-Type": "application/json" },
        });
      } else {
        return new Response("不明なアクション", { status: 400 });
      }
    } catch (e) {
      console.error("エラー:", e);
      return new Response("処理中にエラーが発生しました", { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
}, { port: 8000 });
