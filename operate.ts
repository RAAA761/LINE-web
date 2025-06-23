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

  const storage = new MemoryStorage();

  if (refreshToken) {
    console.log("[INFO] refreshTokenを受信しました。メモリに設定します。");
    await storage.set("refreshToken", refreshToken);
  }

  const client = await loginWithAuthToken(authToken, {
    device: "DESKTOPWIN",
    storage,
  });

  client.base.on("update:authtoken", async (newToken) => {
    console.log("[INFO] authTokenが更新されました:", newToken);
    clientCache.delete(cacheKey);
    const newCacheKey = `${newToken}_${refreshToken || 'no-refresh'}`;
    clientCache.set(newCacheKey, client);
  });

  client.base.on("update:refreshtoken", async (newRefreshToken) => {
    console.log("[INFO] refreshTokenが更新されました:", newRefreshToken);
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


    console.log("[DEBUG] POST受信:", { action, squareChatMid });

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
      const currentToken = client.base.authToken;
      const currentRefreshToken = await client.base.storage.get("refreshToken");

console.log("受信したbody:", body);

if (body.action === "messages") {

const memberResponse = await client.base.square.getSquareChatMembers({
  squareChatMid: body.squareChatMid,
    // 取得したい最大人数（必要に応じて増やす）
});



// 例: memberResponse.members に配列が入っている想定
console.log("[DEBUG] memberResponse 全体:", JSON.stringify(memberResponse, (_k, v) =>
  typeof v === 'bigint' ? v.toString() : v
, 2));


const memberList = Array.isArray(memberResponse.squareChatMembers)
  ? memberResponse.squareChatMembers
  : [];

console.log("[DEBUG] memberList 件数:", memberList.length);

const userDisplayNameMap = new Map<string, string>();

for (const member of memberList) {
  console.log("[DEBUG] メンバー:", {
    squareMemberMid: member.squareMemberMid,
    mid: member.mid,
    displayName: member.displayName,
  });
}





  try {

    type EventType = "SEND_MESSAGE" | "RECEIVE_MESSAGE" | string;

interface Event {
  createdTime: number;
  type: EventType;
  payload: {
    sendMessage?: any;    // 詳細がわかれば型をさらに指定してください
    receiveMessage?: any; // 詳細がわかれば型をさらに指定してください
  };
  syncToken: string;
  continuationToken?: string;
}
    const result = await client.base.square.fetchSquareChatEvents({
      squareChatMid: String(body.squareChatMid),
      limit: 150,
    });

const data: { events: Event[]; syncToken: string; continuationToken?: string } = result;
    const events = result.events ?? [];

 const filteredEvents = data.events.filter((event: Event) =>
  event.type === "RECEIVE_MESSAGE" || event.type === "SEND_MESSAGE"
);




    // 👇 該当するメッセージイベントだけを出力
    
    //for (const e of messageEvents) {
      //console.log({
        //type: e.type,
        //id: e.message.id,
        //from: e.message.sender?.displayName ?? "不明",
        //text: e.message.text ?? "(テキストなし)",
        //replyTo: e.message.replyMessageId ?? null,
      //});
    //}

   
const messages = filteredEvents
  .map(event => {
    // BigIntを文字列化しておく
    const senderRevision = event.payload.receiveMessage?.senderRevision;
    const safeSenderRevision = typeof senderRevision === "bigint" ? senderRevision.toString() : senderRevision;

    if (event.type === "SEND_MESSAGE" && event.payload.sendMessage) {
      const msg = event.payload.sendMessage.squareMessage;
      if (!msg || !msg.message) return null; // 🛑 squareMessageがないときは無視

      const from = msg.message.from;
      const displayName = userDisplayNameMap.get(msg.message.from) ?? "名前未登録";


      return {
        type: event.type,
        text: msg.message.text ?? "(テキストなし)",
        from,
        displayName,
        reqSeq: event.payload.sendMessage.reqSeq ?? null,
      };
    }

    if (event.type === "RECEIVE_MESSAGE" && event.payload.receiveMessage) {
      const msg = event.payload.receiveMessage.squareMessage;
      if (!msg || !msg.message) return null;
      const from = msg.message.from;
      console.log(from)
const displayName = userDisplayNameMap.get(msg.message.from) ?? "名前未登録";


     return {
  type: event.type,
  text: msg.message.text ?? "(テキストなし)",
  from,
  displayName,
  sender: safeSenderRevision,
  squareMid: event.payload.receiveMessage.squareMid,
};
    }

    return null;
  })
  .filter(Boolean);




    return new Response(JSON.stringify({ messages }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("メッセージ取得エラー:", err);
    return new Response(JSON.stringify({ error: "メッセージ取得に失敗" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
}


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

      }  else {
        return new Response(JSON.stringify({
          error: "不明なアクション"
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch (e) {
      console.error("エラー:", e);

      if (e.message?.includes("MUST_REFRESH_V3_TOKEN") ||
          e.message?.includes("AUTHENTICATION_FAILED") ||
          e.message?.includes("INVALID_TOKEN")) {
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
