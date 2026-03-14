import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { claimManualTask, getTaskSummary } from "@/lib/tasks";
import { TASK_TYPES, TaskType } from "@/types/tasks";

function isTaskType(value: string): value is TaskType {
  return TASK_TYPES.includes(value as TaskType);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.clone().json()) as {
      referralCode?: string;
      taskType?: string;
    };

    if (!body.taskType || !isTaskType(body.taskType)) {
      throw new Error("Invalid task type.");
    }

    const user = await withAuth(request, { referralCode: body.referralCode });
    await claimManualTask(user, body.taskType);

    return NextResponse.json({
      summary: await getTaskSummary(user, new URL(request.url).origin),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to claim task.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
