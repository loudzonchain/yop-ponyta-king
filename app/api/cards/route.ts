import { NextRequest, NextResponse } from "next/server";
import { authenticateTelegramWebApp } from "@/lib/telegram-auth";
import {
  createCard,
  ensureCardSchema,
  listCards,
  upsertUser,
  validateCaption,
  validateCardFile,
} from "@/lib/cards";
import { saveCardImage } from "@/lib/storage";

export async function GET(request: NextRequest) {
  try {
    const viewer = authenticateTelegramWebApp(request.headers.get("x-telegram-init-data"), {
      devUser: request.headers.get("x-dev-user"),
    });
    await ensureCardSchema();
    await upsertUser(viewer);
    const cards = await listCards(viewer.telegramId);

    return NextResponse.json({ cards });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load cards.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const initData = formData.get("initData");
    const devUser = formData.get("devUser");
    const user = authenticateTelegramWebApp(typeof initData === "string" ? initData : "", {
      devUser: typeof devUser === "string" ? devUser : null,
    });

    await ensureCardSchema();
    await upsertUser(user);

    const caption = validateCaption(formData.get("caption"));
    const file = validateCardFile(formData.get("image"));
    const storedFile = await saveCardImage(file);
    const card = await createCard({
      caption,
      imageUrl: storedFile.publicUrl,
      user,
    });

    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload card.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
