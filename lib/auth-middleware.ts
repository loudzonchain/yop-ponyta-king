import { NextRequest } from "next/server";
import { ensureCardSchema } from "@/lib/schema";
import { authenticateTelegramWebApp } from "@/lib/telegram-auth";
import { upsertUser } from "@/lib/users";

type AuthValues = {
  initData?: string;
  devUser?: string;
};

type WithAuthOptions = {
  referralCode?: string | null;
  preserveLanguage?: boolean;
};

async function readRequestAuthValues(request: NextRequest): Promise<AuthValues> {
  const initDataFromHeader = request.headers.get("x-telegram-init-data") || "";
  const devUserFromHeader = request.headers.get("x-dev-user") || "";

  if (request.method === "GET" || request.method === "HEAD") {
    return {
      initData: initDataFromHeader,
      devUser: devUserFromHeader,
    };
  }

  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.clone().json()) as { initData?: unknown; devUser?: unknown };

      return {
        initData: typeof body.initData === "string" ? body.initData : initDataFromHeader,
        devUser: typeof body.devUser === "string" ? body.devUser : devUserFromHeader,
      };
    }

    if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const formData = await request.clone().formData();
      const initData = formData.get("initData");
      const devUser = formData.get("devUser");

      return {
        initData: typeof initData === "string" ? initData : initDataFromHeader,
        devUser: typeof devUser === "string" ? devUser : devUserFromHeader,
      };
    }
  } catch {
    return {
      initData: initDataFromHeader,
      devUser: devUserFromHeader,
    };
  }

  return {
    initData: initDataFromHeader,
    devUser: devUserFromHeader,
  };
}

export async function withAuth(request: NextRequest, options?: WithAuthOptions) {
  const authValues = await readRequestAuthValues(request);
  const user = authenticateTelegramWebApp(authValues.initData, {
    devUser: authValues.devUser,
  });

  await ensureCardSchema();
  await upsertUser(user, options);

  return user;
}

export async function withAuthReadOnly(request: NextRequest) {
  const authValues = await readRequestAuthValues(request);
  const user = authenticateTelegramWebApp(authValues.initData, {
    devUser: authValues.devUser,
  });

  await ensureCardSchema();

  return user;
}
