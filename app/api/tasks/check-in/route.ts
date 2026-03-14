import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { claimDailyCheckIn } from "@/lib/tasks";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.clone().json()) as { referralCode?: string };
    const user = await withAuth(request, { referralCode: body.referralCode });

    const result = await claimDailyCheckIn(user);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check in.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
