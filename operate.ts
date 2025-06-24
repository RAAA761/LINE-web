import { serve } from "https://deno.land/std@0.224.0/http/server.ts";  
import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";  
import { loginWithAuthToken } from "jsr:@evex/linejs@2.1.5";  
import { MemoryStorage } from "jsr:@evex/linejs@2.1.5/storage";  
  
console.log("[INFO] LINE 操作サーバー起動...");  
  
let clientCache = new Map<string, any>();  
  
async function getOrCreateClient(authToken: string, refreshToken?: string) {  
  const cacheKey = `${authToken}_${refreshToken || 'no-refresh'}`;  
    
  if (clientCache.has(cacheKey)) {  
    return clientCache.get(cacheKey);  
  }  
  
  // メモリストレージを使用（永続化しない）  
  const storage = new MemoryStorage();  
    
  // refreshTokenが送信された場合はメモリストレージに設定  
  if (refreshToken) {  
    console.log("[INFO] refreshTokenを受信しました。メモリに設定します。");  
    await storage.set("refreshToken", refreshToken);  
  }  
  
  const client = await loginWithAuthToken(authToken, {  
    device: "DESKTOPWIN",  
    storage,  
  });  
  
  // authToken更新時のハンドリング  
  client.base.on("update:authtoken", async (newToken) => {  
    console.log("[INFO] authTokenが更新されました:", newToken);  
      
    // 古いキャッシュを削除  
    clientCache.delete(cacheKey);  
      
    // 新しいキーでキャッシュを更新  
    const newCacheKey = `${newToken}_${refreshToken || 'no-refresh'}`;  
    clientCache.set(newCacheKey, client);  
  });  
  
  // refreshToken更新時のハンドリング  
  client.base.on("update:refreshtoken", async (newRefreshToken) => {  
    console.log("[INFO] refreshTokenが更新されました:", newRefreshToken);  
    // メモリストレージのみに保存  
    await storage.set("refreshToken", newRefreshToken);  
  });  
  
  clientCache.set(cacheKey, client);  
  return client;  
}  
  
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
    const authToken = body.authToken || body.token;  
    const refreshToken = body.refreshToken;  
    const action = body.action;  
    const text = body.text ?? "デフォルトメッセージ";  
    const squareChatMid = body.squareChatMid ?? "";  
  
    if (!authToken || !action) {  
      return new Response(JSON.stringify({  
        error: "authTokenとactionは必須です"  
      }), {   
        status: 400,  
        headers: { "Content-Type": "application/json" }  
      });  
    }  
  
    try {  
      const client = await getOrCreateClient(authToken, refreshToken);  
        
      // 現在の有効なauthTokenを取得  
      const currentToken = client.base.authToken;  
      const currentRefreshToken = await client.base.storage.get("refreshToken");  
  
      if (action === "squares") {  
        const chats = await client.fetchJoinedSquareChats();  
        const result = chats.map(c => ({  
          squareChatMid: c.raw.squareChatMid,  
          name: c.raw.name,  
        }));  
        return new Response(JSON.stringify({   
          result,   
          updatedAuthToken: currentToken,  
          updatedRefreshToken: currentRefreshToken,  
          tokenChanged: currentToken !== authToken   
        }), {  
          headers: { "Content-Type": "application/json" },  
        });  
      } else if (action === "send") {  
        await client.base.square.sendMessage({ squareChatMid, text });  
        return new Response(JSON.stringify({   
          message: "メッセージを送信しました",   
          updatedAuthToken: currentToken,  
          updatedRefreshToken: currentRefreshToken,  
          tokenChanged: currentToken !== authToken   
        }), {  
          headers: { "Content-Type": "application/json" },  
        });  
      } else if (action === "messages") {  
        const response = await client.base.square.fetchSquareChatEvents({  
          squareChatMid,  
          limit: 150,  
        });  
  const squareChat = await client.getSquareChat(squareChatMid);
const members = await squareChat.getMembers();
const squareMemberMid = "pf3fcbab652071dc24b8f565c96306dcb"
try{
const findMember = members.find(member => member.squareMemberMid === squareMemberMid);
console.log(findMember);
}catch(e){}
        return new Response(JSON.stringify({   
          events: response.events,   
          updatedAuthToken: currentToken,  
          updatedRefreshToken: currentRefreshToken,  
          tokenChanged: currentToken !== authToken   
        }, (_, v) => typeof v === "bigint" ? v.toString() : v), {  
          headers: { "Content-Type": "application/json" },  
        });  
      } else {  
        return new Response(JSON.stringify({  
          error: "不明なアクション"  
        }), {   
          status: 400,  
          headers: { "Content-Type": "application/json" }  
        });  
      }  
    } catch (e) {  
      console.error("エラー:", e);  
  
      // 認証エラーの場合  
      if (e.message?.includes("MUST_REFRESH_V3_TOKEN") ||   
          e.message?.includes("AUTHENTICATION_FAILED") ||  
          e.message?.includes("INVALID_TOKEN")) {  
          
        // キャッシュをクリア  
        const cacheKey = `${authToken}_${refreshToken || 'no-refresh'}`;  
        clientCache.delete(cacheKey);  
          
        return new Response(JSON.stringify({  
          error: "認証エラー",  
          message: "トークンの有効期限が切れています。新しいトークンでログインしてください。",  
          needsReauth: true  
        }), {   
          status: 401,  
          headers: { "Content-Type": "application/json" }  
        });  
      }  
  
      return new Response(JSON.stringify({  
        error: "処理エラー",  
        message: "処理中にエラーが発生しました",  
        details: e.message  
      }), {   
        status: 500,  
        headers: { "Content-Type": "application/json" }  
      });  
    }  
  }  
  
  return new Response("Not Found", { status: 404 });  
}, { port: 8000 });