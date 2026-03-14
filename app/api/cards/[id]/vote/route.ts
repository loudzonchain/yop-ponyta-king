import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { toggleCardVote } from "@/lib/cards";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await withAuth(request);

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
