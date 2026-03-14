import { getPool } from "@/lib/db";
import { mutateLocalStore, readLocalStore } from "@/lib/local-store";
import { resolveStorageMode } from "@/lib/schema";
import { AuthenticatedAppUser } from "@/types/telegram";
import { TaskSummary } from "@/types/tasks";

export function getTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function getPreviousUtcDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function getEffectiveStreak(lastCheckInDate?: string, currentStreak = 0) {
  if (!lastCheckInDate || currentStreak === 0) {
    return 0;
  }

  const today = getTodayUtc();

  if (lastCheckInDate === today || lastCheckInDate === getPreviousUtcDay(today)) {
    return currentStreak;
  }

  return 0;
}

export async function getTaskSummary(
  user: AuthenticatedAppUser,
  origin: string,
): Promise<TaskSummary> {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    const store = await readLocalStore();
    const currentUser = store.users.find((entry) => entry.telegramId === user.telegramId);

    if (!currentUser) {
      throw new Error("User not found.");
    }

    const today = getTodayUtc();
    const currentStreak = getEffectiveStreak(currentUser.lastCheckInDate, currentUser.currentStreak);

    return {
      currentStreak,
      checkedInToday: currentUser.lastCheckInDate === today,
      referralCode: currentUser.referralCode,
      referralCount: store.users.filter(
        (entry) => entry.referredByTelegramId === currentUser.telegramId,
      ).length,
      referralLink: `${origin}/?ref=${currentUser.referralCode}`,
      xp: currentUser.xp,
    };
  }

  const pool = getPool();
  const result = await pool.query<{
    current_streak: number;
    last_check_in_date: string | null;
    referral_code: string;
    xp: number;
    referral_count: string;
  }>(
    `
      select
        users.current_streak,
        users.last_check_in_date::text,
        users.referral_code,
        users.xp,
        (
          select count(*)
          from public.users as referred_users
          where referred_users.referred_by_telegram_id = users.telegram_id
        )::text as referral_count
      from public.users as users
      where users.telegram_id = $1
    `,
    [user.telegramId],
  );

  const currentUser = result.rows[0];

  if (!currentUser) {
    throw new Error("User not found.");
  }

  const today = getTodayUtc();
  const currentStreak = getEffectiveStreak(
    currentUser.last_check_in_date || undefined,
    currentUser.current_streak,
  );

  return {
    currentStreak,
    checkedInToday: currentUser.last_check_in_date === today,
    referralCode: currentUser.referral_code,
    referralCount: Number(currentUser.referral_count),
    referralLink: `${origin}/?ref=${currentUser.referral_code}`,
    xp: currentUser.xp,
  };
}

export async function claimDailyCheckIn(user: AuthenticatedAppUser) {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    return mutateLocalStore((store) => {
      const currentUser = store.users.find((entry) => entry.telegramId === user.telegramId);

      if (!currentUser) {
        throw new Error("User not found.");
      }

      const today = getTodayUtc();

      if (currentUser.lastCheckInDate === today) {
        throw new Error("Daily check-in already claimed today.");
      }

      const previousDay = getPreviousUtcDay(today);
      const nextStreak =
        currentUser.lastCheckInDate === previousDay ? currentUser.currentStreak + 1 : 1;

      currentUser.currentStreak = nextStreak;
      currentUser.lastCheckInDate = today;
      currentUser.xp += 10;

      return {
        currentStreak: currentUser.currentStreak,
        checkedInToday: true,
        xp: currentUser.xp,
      };
    });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const result = await client.query<{
      current_streak: number;
      last_check_in_date: string | null;
      xp: number;
    }>(
      `
        select current_streak, last_check_in_date::text, xp
        from public.users
        where telegram_id = $1
        for update
      `,
      [user.telegramId],
    );

    const currentUser = result.rows[0];

    if (!currentUser) {
      throw new Error("User not found.");
    }

    const today = getTodayUtc();

    if (currentUser.last_check_in_date === today) {
      throw new Error("Daily check-in already claimed today.");
    }

    const previousDay = getPreviousUtcDay(today);
    const nextStreak =
      currentUser.last_check_in_date === previousDay ? currentUser.current_streak + 1 : 1;

    const updated = await client.query<{
      current_streak: number;
      xp: number;
    }>(
      `
        update public.users
        set
          current_streak = $2,
          last_check_in_date = $3::date,
          xp = xp + 10,
          updated_at = now()
        where telegram_id = $1
        returning current_streak, xp
      `,
      [user.telegramId, nextStreak, today],
    );

    await client.query("commit");

    return {
      currentStreak: updated.rows[0].current_streak,
      checkedInToday: true,
      xp: updated.rows[0].xp,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
