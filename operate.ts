import { serve } from "https://deno.land/std@0.224.0/http/server.ts";    
import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";    
import { loginWithAuthToken } from "jsr:@evex/linejs@2.1.5";    
import { MemoryStorage } from "jsr:@evex/linejs@2.1.5/storage";    
    
console.log("[INFO] LINE 操作サーバー起動...");    
    
let clientCache = new Map<string, any>();    
    
// メッセージイベントからpidを抽出（修正版）  
function extractPidsFromEvents(events: any[]): string[] {    
  console.log("[DEBUG] extractPidsFromEvents 開始, events数:", events.length);  
  const pids = new Set<string>();    
      
  events.forEach((event, index) => {  
    console.log(`[DEBUG] Event ${index}:`, event.type);  
      
    // メッセージイベントの場合  
    const message = event.payload?.receiveMessage?.squareMessage?.message     
                 ?? event.payload?.sendMessage?.squareMessage?.message;    
      
    if (message) {  
      // _from と from の両方をチェック  
      const fromId = message._from || message.from;  
      if (fromId) {  
        console.log(`[DEBUG] Event ${index} から pid を抽出:`, fromId);  
        pids.add(fromId);    
      }  
    }  
      
    // プロフィール更新イベントの場合  
    if (event.type === "NOTIFIED_UPDATE_SQUARE_MEMBER_PROFILE" && event.payload?.notifiedUpdateSquareMemberProfile) {  
      const memberMid = event.payload.notifiedUpdateSquareMemberProfile.squareMemberMid;  
      if (memberMid) {  
        console.log(`[DEBUG] Event ${index} からプロフィール更新 pid を抽出:`, memberMid);  
        pids.add(memberMid);  
      }  
    }  
      
    // その他のSquareメンバー関連イベント  
    if (event.payload?.notifiedCreateSquareMember?.squareMember?.squareMemberMid) {  
      const memberMid = event.payload.notifiedCreateSquareMember.squareMember.squareMemberMid;  
      console.log(`[DEBUG] Event ${index} から新規メンバー pid を抽出:`, memberMid);  
      pids.add(memberMid);  
    }  
      
    if (!message && !event.payload?.notifiedUpdateSquareMemberProfile && !event.payload?.notifiedCreateSquareMember) {  
      console.log(`[DEBUG] Event ${index} には対象となるメンバー情報がありません`);  
    }  
  });    
      
  const result = Array.from(pids);  
  console.log("[DEBUG] 抽出されたpids:", result);  
  return result;  
}   
  
// SquareChatのメンバーを取得（高レベルAPI使用版）  
async function getSquareMemberProfiles(client: any, pids: string[], squareChatMid: string) {    
  console.log("[DEBUG] getSquareMemberProfiles 開始");  
  const profiles = new Map();    
      
  try {  
    console.log("[DEBUG] getSquareChat().getMembers() で一括取得を試行");  
    console.log("[DEBUG] squareChatMid:", squareChatMid);  
      
    // 高レベルAPIを使用してチャットメンバーを取得  
    const squareChat = await client.getSquareChat(squareChatMid);  
    const members = await squareChat.getMembers();  
      
    console.log("[DEBUG] チャットメンバー取得結果:", members.length, "人のメンバーを取得");  
      
    // 必要なpidのメンバー情報のみを抽出  
    members.forEach(member => {  
      if (pids.includes(member.squareMemberMid)) {  
        console.log(`[DEBUG] 対象メンバー発見: ${member.squareMemberMid} - ${member.displayName}`);  
        profiles.set(member.squareMemberMid, {  
          displayName: member.displayName,  
          pictureStatus: member.profileImageObsHash,  
          revision: member.revision  
        });  
      }  
    });  
      
    console.log("[DEBUG] 最終的なprofiles:", Object.fromEntries(profiles));  
    console.log("[DEBUG] 抽出されたプロフィール数:", profiles.size);  
  } catch (error) {  
    console.error("[DEBUG] チャットメンバー取得失敗:", error.message);  
  }  
    
  return profiles;  
}
    
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
    
  try {    
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
  } catch (error) {    
    console.error("[ERROR] ログインに失敗しました:", error);    
    throw error;    
  }    
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
        
    // リクエストボディからトークンを取得    
    let authToken = body.authToken || body.token;    
    let refreshToken = body.refreshToken;    
        
    // クエリパラメータからrefreshTokenを取得（優先度：ボディ > クエリパラメータ）    
    if (!refreshToken) {    
      refreshToken = url.searchParams.get("refreshToken") || url.searchParams.get("refresh_token");    
      if (refreshToken) {    
        console.log("[INFO] クエリパラメータからrefreshTokenを取得しました");    
      }    
    }    
        
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
      // refreshTokenがなくてもログインを試行    
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
          tokenChanged: currentToken !== authToken,    
          refreshTokenProvided: !!refreshToken    
        }), {    
          headers: { "Content-Type": "application/json" },    
        });    
    } else if (action === "send") {      
        await client.base.square.sendMessage({ squareChatMid, text });      
        return new Response(JSON.stringify({       
          message: "メッセージを送信しました",       
          updatedAuthToken: currentToken,      
          updatedRefreshToken: currentRefreshToken,      
          tokenChanged: currentToken !== authToken,      
          refreshTokenProvided: !!refreshToken      
        }), {      
          headers: { "Content-Type": "application/json" },      
        });      
      } else if (action === "replyToMessage") {  
        const relatedMessageId = body.relatedMessageId;  
        if (!relatedMessageId) {  
          return new Response(JSON.stringify({  
            error: "relatedMessageIdは必須です"  
          }), {  
            status: 400,  
            headers: { "Content-Type": "application/json" }  
          });  
        }  
          
        await client.base.square.sendMessage({   
          squareChatMid,   
          text,  
          relatedMessageId   
        });  
          
        return new Response(JSON.stringify({  
          message: "リプライメッセージを送信しました",  
          updatedAuthToken: currentToken,  
          updatedRefreshToken: currentRefreshToken,  
          tokenChanged: currentToken !== authToken,  
          refreshTokenProvided: !!refreshToken  
        }), {  
          headers: { "Content-Type": "application/json" },  
        });  
} else if (action === "messages") {      
  console.log("[DEBUG] messages アクション開始");      
  const response = await client.base.square.fetchSquareChatEvents({        
    squareChatMid,        
    limit: 150,        
  });        
      
  console.log("[DEBUG] fetchSquareChatEvents 完了, events数:", response.events?.length || 0);      
      
  // pidを抽出        
  const pids = extractPidsFromEvents(response.events);        
          
  // プロフィール情報を取得（squareChatMidを渡す）      
  console.log("[DEBUG] プロフィール取得開始");      
  const profiles = await getSquareMemberProfiles(client, pids, squareChatMid);        
  console.log("[DEBUG] プロフィール取得完了");      
      
// 画像メッセージのBase64データを取得  
const eventsWithImageData = await Promise.all(response.events.map(async (event) => {  
  const msg = event.payload?.receiveMessage?.squareMessage?.message  
           ?? event.payload?.sendMessage?.squareMessage?.message;  
      
  if (msg && msg.contentType === 1) { // IMAGE content type  
    try {  
      const file = await client.base.obs.downloadMessageData({  
        messageId: msg.id,  
        isPreview: true,  
        isSquare: true  
      });  
      const arrayBuffer = await file.arrayBuffer();  
        
      // DenoではBufferの代わりにbtoa()を使用  
      const uint8Array = new Uint8Array(arrayBuffer);  
      const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');  
      const base64 = btoa(binaryString);  
        
      const mimeType = file.type || 'image/jpeg';  
        
      return {  
        ...event,  
        imageData: `data:${mimeType};base64,${base64}`,  
        isImage: true  
      };  
    } catch (error) {  
      console.error("[DEBUG] 画像取得エラー:", error);  
      return event;  
    }  
  }  
  return event;  
}));
      
  return new Response(JSON.stringify({         
    events: eventsWithImageData,         
    profiles: Object.fromEntries(profiles),      
    updatedAuthToken: currentToken,        
    updatedRefreshToken: currentRefreshToken,        
    tokenChanged: currentToken !== authToken,        
    refreshTokenProvided: !!refreshToken        
  }, (_, v) => typeof v === "bigint" ? v.toString() : v), {        
    headers: { "Content-Type": "application/json" },        
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
          message: refreshToken     
            ? "トークンの有効期限が切れており、リフレッシュにも失敗しました。新しいトークンでログインしてください。"    
            : "トークンの有効期限が切れています。refreshTokenを提供するか、新しいトークンでログインしてください。",    
          needsReauth: true,    
          refreshTokenProvided: !!refreshToken    
        }), {     
          status: 401,    
          headers: { "Content-Type": "application/json" }    
        });    
      }    
    
      return new Response(JSON.stringify({    
        error: "処理エラー",    
        message: "処理中にエラーが発生しました",    
        details: e.message,    
        refreshTokenProvided: !!refreshToken    
      }), {     
        status: 500,    
        headers: { "Content-Type": "application/json" }    
      });    
    }    
  }    
    
  return new Response("Not Found", { status: 404 });    
}, { port: 8000 });