import { NextRequest, NextResponse } from "next/server";
import { authenticateTelegramWebApp } from "@/lib/telegram-auth";
import { ensureCardSchema, toggleCardVote, upsertUser } from "@/lib/cards";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { initData?: string; devUser?: string };
    const user = authenticateTelegramWebApp(body.initData || "", { devUser: body.devUser });

    await ensureCardSchema();
    await upsertUser(user);

    const result = await toggleCardVote({
      cardId: Number(id),
      user,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update vote.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
