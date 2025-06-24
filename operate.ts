import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { loginWithAuthToken} from "jsr:@evex/linejs/auth";
import type { ActionResult } from "jsr:@evex/linejs";
import {
  SquareMemberRole,
  SquareMembershipState,
} from "jsr:@evex/linejs/base/square";
　
serve(async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);
    const body = await req.json();
    const token = body.token as string;
    const refreshToken = body.refreshToken as string | undefined;
    const action = body.action as string;

    let client: ActionResult["client"];
    let updatedAuthToken: string | undefined = undefined;
    let updatedRefreshToken: string | undefined = undefined;
    let tokenChanged = false;

    if (refreshToken) {
      const refreshed = await loginWithRefreshToken(refreshToken, {
        device: "DESKTOPWIN",
      });
      client = refreshed.client;
      updatedAuthToken = refreshed.authToken;
      updatedRefreshToken = refreshed.refreshToken;
      tokenChanged = true;
    } else {
      const loggedIn = await loginWithAuthToken(token, {
        device: "DESKTOPWIN",
      });
      client = loggedIn.client;
    }

    if (action === "squares") {
      const squares = await client.base.square.listJoinedSquares({});
      return Response.json({
        result: squares.squares,
        updatedAuthToken,
        updatedRefreshToken,
        tokenChanged,
      });
    }

    if (action === "messages") {
      const squareChatMid = body.squareChatMid as string;
      const data = await client.base.square.listSquareChatMessages({
        squareChatMid,
        limit: 20,
        withReadCount: true,
      });

      const profiles: Record<string, any> = {};
      for (const e of data.events) {
        const msg =
          e.payload?.receiveMessage?.squareMessage?.message ??
          e.payload?.sendMessage?.squareMessage?.message;
        if (msg?.from && !(msg.from in profiles)) {
          try {
            const profile = await client.base.square.getJoinedSquareMember({
              squareChatMid,
              mid: msg.from,
            });
            profiles[msg.from] = profile.member?.profile || null;
          } catch (err) {
            console.warn(`プロフィール取得失敗: ${msg.from}`);
            profiles[msg.from] = null;
          }
        }
      }

      return Response.json({
        events: data.events,
        profiles,
        updatedAuthToken,
        updatedRefreshToken,
        tokenChanged,
      });
    }

    if (action === "send") {
      const squareChatMid = body.squareChatMid as string;
      const text = body.text as string;

      const msg = await client.base.square.sendSquareMessage({
        squareChatMid,
        message: { text },
      });

      return Response.json({ message: msg });
    }

    if (action === "updateRole") {
      const squareMid = body.squareMid as string;
      const squareMemberMid = body.squareMemberMid as string;
      const role = body.role as keyof typeof SquareMemberRole;

      const result = await client.base.square.updateSquareMember({
        request: {
          updatedAttrs: ["ROLE"],
          squareMember: {
            squareMemberMid,
            squareMid,
            membershipState: "JOINED",
            revision: 1,
            role: SquareMemberRole[role],
          },
        },
      });

      return Response.json({ result });
    }

    if (action === "kick") {
      const squareMid = body.squareMid as string;
      const squareMemberMid = body.squareMemberMid as string;

      const result = await client.base.square.updateSquareMember({
        request: {
          updatedAttrs: ["STATE"],
          squareMember: {
            squareMemberMid,
            squareMid,
            membershipState: SquareMembershipState.KICKED,
            revision: 1,
          },
        },
      });

      return Response.json({ result });
    }

    if (action === "acceptJoin") {
      const squareMid = body.squareMid as string;
      const joinReqMid = body.squareMemberMid as string;

      const result = await client.base.square.acceptSquareJoinRequests({
        squareMid,
        squareMemberMids: [joinReqMid],
      });

      return Response.json({ result });
    }

    if (action === "rejectJoin") {
      const squareMid = body.squareMid as string;
      const joinReqMid = body.squareMemberMid as string;

      const result = await client.base.square.rejectSquareJoinRequests({
        squareMid,
        squareMemberMids: [joinReqMid],
      });

      return Response.json({ result });
    }

    if (action === "getMember") {
      const squareChatMid = body.squareChatMid as string;
      const mid = body.mid as string;

      const profile = await client.base.square.getJoinedSquareMember({
        squareChatMid,
        mid,
      });

      return Response.json({ profile });
    }

    if (action === "listMembers") {
      const squareChatMid = body.squareChatMid as string;
      const result = await client.base.square.getSquareMembersByRange({
        squareChatMid,
        range: {
          start: 0,
          limit: 100,
        },
      });

      return Response.json({ members: result.members });
    }

    if (action === "listJoinRequests") {
      const squareMid = body.squareMid as string;
      const result = await client.base.square.getSquareMemberJoinRequestList({
        squareMid,
        limit: 100,
        withProfile: true,
      });

      return Response.json({ requests: result.requests });
    }

    return new Response("未知のアクション", { status: 400 });
  } catch (e) {
    console.error("サーバーエラー:", e);
    return new Response("サーバーエラー", { status: 500 });
  }
});