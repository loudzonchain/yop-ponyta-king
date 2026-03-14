import { NextRequest, NextResponse } from "next/server";
import { withAuth, withAuthReadOnly } from "@/lib/auth-middleware";
import { createCard, listCards, validateCaption, validateCardFile } from "@/lib/cards";
import { saveCardImage } from "@/lib/storage";
import { upsertUser } from "@/lib/users";

export async function GET(request: NextRequest) {
  try {
    const viewer = await withAuthReadOnly(request);
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
    const user = await withAuth(request);
    const formData = await request.formData();
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
