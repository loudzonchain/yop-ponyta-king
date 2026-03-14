import { getPool } from "@/lib/db";
import { mutateLocalStore, readLocalStore } from "@/lib/local-store";
import { resolveStorageMode } from "@/lib/schema";
import { getEffectiveStreak, getTodayUtc } from "@/lib/tasks";
import { AuthenticatedAppUser } from "@/types/telegram";

export function buildReferralCode(user: AuthenticatedAppUser) {
  return user.username || `ref_${user.telegramId}`;
}

export async function upsertUser(
  user: AuthenticatedAppUser,
  options?: { referralCode?: string | null; preserveLanguage?: boolean },
) {
  const preserveLanguage = options?.preserveLanguage !== false;
  const mode = await resolveStorageMode();

  if (mode === "local") {
    await mutateLocalStore((store) => {
      const existingUser = store.users.find((entry) => entry.telegramId === user.telegramId);

      if (existingUser) {
        existingUser.username = user.username;
        existingUser.firstName = user.firstName;
        existingUser.lastName = user.lastName;
        existingUser.displayName = user.displayName;
        if (!preserveLanguage) {
          existingUser.language = user.language;
        }
        existingUser.xp = existingUser.xp ?? 0;
        existingUser.currentStreak = getEffectiveStreak(
          existingUser.lastCheckInDate,
          existingUser.currentStreak ?? 0,
        );
        existingUser.referralCode = existingUser.referralCode || buildReferralCode(user);

        if (!existingUser.referredByTelegramId && options?.referralCode) {
          const referredBy = store.users.find((entry) => entry.referralCode === options.referralCode);

          if (referredBy && referredBy.telegramId !== user.telegramId) {
            existingUser.referredByTelegramId = referredBy.telegramId;
          }
        }
      } else {
        const referredBy = options?.referralCode
          ? store.users.find((entry) => entry.referralCode === options.referralCode)
          : undefined;

        store.users.push({
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          displayName: user.displayName,
          language: user.language,
          xp: 0,
          currentStreak: 0,
          referralCode: buildReferralCode(user),
          referredByTelegramId:
            referredBy && referredBy.telegramId !== user.telegramId ? referredBy.telegramId : undefined,
        });
      }
    });
    return;
  }

  const pool = getPool();

  await pool.query(
    `
      insert into public.users (
        telegram_id,
        username,
        first_name,
        last_name,
        display_name,
        language,
        referral_code
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (telegram_id)
      do update set
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        display_name = excluded.display_name,
        language = case
          when $8::boolean then public.users.language
          else excluded.language
        end,
        referral_code = coalesce(public.users.referral_code, excluded.referral_code),
        updated_at = now()
    `,
    [
      user.telegramId,
      user.username || null,
      user.firstName,
      user.lastName || null,
      user.displayName,
      user.language,
      buildReferralCode(user),
      preserveLanguage,
    ],
  );

  if (options?.referralCode) {
    await pool.query(
      `
        update public.users as current_user
        set referred_by_telegram_id = referrer.telegram_id
        from public.users as referrer
        where current_user.telegram_id = $1
          and current_user.referred_by_telegram_id is null
          and referrer.referral_code = $2
          and referrer.telegram_id <> $1
      `,
      [user.telegramId, options.referralCode],
    );
  }
}

export async function updateUserLanguage(
  telegramId: number,
  language: AuthenticatedAppUser["language"],
) {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    return mutateLocalStore((store) => {
      const currentUser = store.users.find((entry) => entry.telegramId === telegramId);

      if (!currentUser) {
        throw new Error("User not found.");
      }

      currentUser.language = language;
    });
  }

  const pool = getPool();
  await pool.query(
    `
      update public.users
      set language = $2, updated_at = now()
      where telegram_id = $1
    `,
    [telegramId, language],
  );
}

export async function listLeaderboard(limit = 100) {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    const store = await readLocalStore();

    return [...store.users]
      .sort((left, right) => right.xp - left.xp || left.displayName.localeCompare(right.displayName))
      .slice(0, limit)
      .map((user, index) => ({
        telegramId: user.telegramId,
        displayName: user.displayName,
        username: user.username,
        xp: user.xp,
        rank: index + 1,
      }));
  }

  const pool = getPool();
  const result = await pool.query<{
    telegram_id: string;
    display_name: string;
    username: string | null;
    xp: number;
    rank: string;
  }>(
    `
      select
        telegram_id,
        display_name,
        username,
        xp,
        row_number() over (order by xp desc, created_at asc) as rank
      from public.users
      order by xp desc, created_at asc
      limit $1
    `,
    [limit],
  );

  return result.rows.map((row) => ({
    telegramId: Number(row.telegram_id),
    displayName: row.display_name,
    username: row.username || undefined,
    xp: row.xp,
    rank: Number(row.rank),
  }));
}

export async function getUserSummaryByTelegramId(telegramId: number) {
  const mode = await resolveStorageMode();

  if (mode === "local") {
    const store = await readLocalStore();
    const users = [...store.users].sort(
      (left, right) => right.xp - left.xp || left.displayName.localeCompare(right.displayName),
    );
    const currentUser = users.find((entry) => entry.telegramId === telegramId);

    if (!currentUser) {
      return null;
    }

    return {
      telegramId: currentUser.telegramId,
      displayName: currentUser.displayName,
      username: currentUser.username,
      language: currentUser.language,
      xp: currentUser.xp,
      currentStreak: getEffectiveStreak(currentUser.lastCheckInDate, currentUser.currentStreak),
      checkedInToday: currentUser.lastCheckInDate === getTodayUtc(),
      cardCount: store.cards.filter((card) => card.authorTelegramId === telegramId).length,
      rank: users.findIndex((entry) => entry.telegramId === telegramId) + 1,
    };
  }

  const pool = getPool();
  const result = await pool.query<{
    telegram_id: string;
    display_name: string;
    username: string | null;
    language: AuthenticatedAppUser["language"];
    xp: number;
    current_streak: number;
    last_check_in_date: string | null;
    card_count: string;
    rank: string;
  }>(
    `
      select
        ranked.telegram_id,
        ranked.display_name,
        ranked.username,
        ranked.language,
        ranked.xp,
        ranked.current_streak,
        ranked.last_check_in_date::text,
        ranked.card_count,
        ranked.rank
      from (
        select
          users.telegram_id,
          users.display_name,
          users.username,
          users.language,
          users.xp,
          users.current_streak,
          users.last_check_in_date,
          (
            select count(*)
            from public.cards
            where cards.author_telegram_id = users.telegram_id
          )::text as card_count,
          row_number() over (order by users.xp desc, users.created_at asc) as rank
        from public.users as users
      ) as ranked
      where ranked.telegram_id = $1
    `,
    [telegramId],
  );

  const currentUser = result.rows[0];

  if (!currentUser) {
    return null;
  }

  return {
    telegramId: Number(currentUser.telegram_id),
    displayName: currentUser.display_name,
    username: currentUser.username || undefined,
    language: currentUser.language,
    xp: currentUser.xp,
    currentStreak: getEffectiveStreak(
      currentUser.last_check_in_date || undefined,
      currentUser.current_streak,
    ),
    checkedInToday: currentUser.last_check_in_date === getTodayUtc(),
    cardCount: Number(currentUser.card_count),
    rank: Number(currentUser.rank),
  };
}
