import { NextRequest, NextResponse } from "next/server";
import { withAuthReadOnly } from "@/lib/auth-middleware";
import { getTaskSummary } from "@/lib/tasks";
import { upsertUser } from "@/lib/users";

export async function GET(request: NextRequest) {
  try {
    const user = await withAuthReadOnly(request);
    const referralCode = request.headers.get("x-referral-code");
    await upsertUser(user, { referralCode });

    const origin = new URL(request.url).origin;
    const summary = await getTaskSummary(user, origin);

    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load tasks.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
