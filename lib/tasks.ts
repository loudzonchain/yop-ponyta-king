import { QueryResult, QueryResultRow } from "pg";
import { getPool } from "@/lib/db";
import { LocalStore, mutateLocalStore, readLocalStore } from "@/lib/local-store";
import { resolveStorageMode } from "@/lib/schema";
import { AuthenticatedAppUser } from "@/types/telegram";
import { TaskClaimType, TaskStatus, TaskSummary, TaskType } from "@/types/tasks";

type TaskAvailability = "daily" | "rolling" | "lifetime";

type TaskDefinition = {
  xp: number;
  cooldownHours: number | null;
  manualClaim: boolean;
  availability: TaskAvailability;
  goal?: number;
};

type TaskClaimMap = Partial<Record<TaskClaimType, string>>;
type ClaimableTaskType = Exclude<TaskType, "daily_check_in">;

type Queryable = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ) => Promise<QueryResult<T>>;
};

export const TASK_ORDER: TaskType[] = [
  "daily_check_in",
  "submit_card",
  "vote_on_3_cards",
  "invite_friend",
  "share_on_x_twitter",
  "join_group_chat",
];

export const MANUAL_TASK_TYPES: TaskType[] = ["share_on_x_twitter", "join_group_chat"];

const MANUAL_TASK_TYPE_SET = new Set<TaskType>(MANUAL_TASK_TYPES);
const VOTE_PROGRESS_TASK_TYPE: TaskClaimType = "vote_on_3_cards_progress";
const CHECK_IN_BASE_XP = 10;
const CHECK_IN_MAX_BONUS_XP = 14;

const TASK_DEFINITIONS: Record<TaskType, TaskDefinition> = {
  daily_check_in: {
    xp: CHECK_IN_BASE_XP,
    cooldownHours: 24,
    manualClaim: false,
    availability: "daily",
  },
  submit_card: {
    xp: 25,
    cooldownHours: 24,
    manualClaim: false,
    availability: "daily",
  },
  vote_on_3_cards: {
    xp: 15,
    cooldownHours: 24,
    manualClaim: false,
    availability: "daily",
    goal: 3,
  },
  invite_friend: {
    xp: 50,
    cooldownHours: 72,
    manualClaim: false,
    availability: "rolling",
  },
  share_on_x_twitter: {
    xp: 30,
    cooldownHours: 24,
    manualClaim: true,
    availability: "rolling",
  },
  join_group_chat: {
    xp: 20,
    cooldownHours: null,
    manualClaim: true,
    availability: "lifetime",
  },
};

export function getTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function getPreviousUtcDay(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function getStartOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getNextUtcDay(date = new Date()) {
  const value = getStartOfUtcDay(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

function isSameUtcDay(timestamp: string, day = getTodayUtc()) {
  return timestamp.slice(0, 10) === day;
}

function isWithinUtcDayRange(timestamp: string, now = new Date()) {
  const claimedAt = new Date(timestamp).getTime();
  const start = getStartOfUtcDay(now).getTime();
  const end = getNextUtcDay(now).getTime();

  return claimedAt >= start && claimedAt < end;
}

function getRemainingMsUntilNextUtcDay(now = new Date()) {
  return Math.max(0, getNextUtcDay(now).getTime() - now.getTime());
}

function getRollingAvailableAt(claimedAt: string, cooldownHours: number) {
  const claimedAtTime = new Date(claimedAt).getTime();

  if (Number.isNaN(claimedAtTime)) {
    return null;
  }

  return new Date(claimedAtTime + cooldownHours * 60 * 60 * 1000);
}

function getTaskAvailability(taskType: TaskType, claimedAt: string | null, now = new Date()) {
  const definition = TASK_DEFINITIONS[taskType];

  if (!claimedAt) {
    return {
      claimed: false,
      availableAt: null,
      cooldownRemainingMs: definition.availability === "lifetime" ? null : 0,
    };
  }

  if (definition.availability === "lifetime") {
    return {
      claimed: true,
      availableAt: null,
      cooldownRemainingMs: null,
    };
  }

  if (definition.availability === "daily") {
    if (!isSameUtcDay(claimedAt, getTodayUtc())) {
      return {
        claimed: false,
        availableAt: null,
        cooldownRemainingMs: 0,
      };
    }

    const availableAt = getNextUtcDay(now);

    return {
      claimed: true,
      availableAt: availableAt.toISOString(),
      cooldownRemainingMs: getRemainingMsUntilNextUtcDay(now),
    };
  }

  const availableAt = getRollingAvailableAt(claimedAt, definition.cooldownHours || 0);

  if (!availableAt || availableAt.getTime() <= now.getTime()) {
    return {
      claimed: false,
      availableAt: null,
      cooldownRemainingMs: 0,
    };
  }

  return {
    claimed: true,
    availableAt: availableAt.toISOString(),
    cooldownRemainingMs: Math.max(0, availableAt.getTime() - now.getTime()),
  };
}

function getLatestClaimMapFromStore(store: LocalStore, telegramId: number): TaskClaimMap {
  return store.taskClaims.reduce<TaskClaimMap>((claims, currentClaim) => {
    if (currentClaim.telegramId !== telegramId) {
      return claims;
    }

    const existingClaim = claims[currentClaim.taskType];

    if (!existingClaim || currentClaim.claimedAt > existingClaim) {
      claims[currentClaim.taskType] = currentClaim.claimedAt;
    }

    return claims;
  }, {});
}

async function getLatestClaimMapFromDatabase(
  queryable: Queryable,
  telegramId: number,
): Promise<TaskClaimMap> {
  const result = await queryable.query<{
    task_type: TaskClaimType;
    claimed_at: string;
  }>(
    `
      select task_type, max(claimed_at)::text as claimed_at
      from public.task_claims
      where telegram_id = $1
        and task_type = any($2::text[])
      group by task_type
    `,
    [telegramId, [...TASK_ORDER, VOTE_PROGRESS_TASK_TYPE]],
  );

  return result.rows.reduce<TaskClaimMap>((claims, row) => {
    claims[row.task_type] = row.claimed_at;
    return claims;
  }, {});
}

function getVoteProgressCountFromStore(store: LocalStore, telegramId: number, now = new Date()) {
  return store.taskClaims.filter(
    (claim) =>
      claim.telegramId === telegramId &&
      claim.taskType === VOTE_PROGRESS_TASK_TYPE &&
      isWithinUtcDayRange(claim.claimedAt, now),
  ).length;
}

async function getVoteProgressCountFromDatabase(
  queryable: Queryable,
  telegramId: number,
  now = new Date(),
) {
  const result = await queryable.query<{ vote_count: string }>(
    `
      select count(*)::text as vote_count
      from public.task_claims
      where telegram_id = $1
        and task_type = $2
        and claimed_at >= $3::timestamptz
        and claimed_at < $4::timestamptz
    `,
    [
      telegramId,
      VOTE_PROGRESS_TASK_TYPE,
      getStartOfUtcDay(now).toISOString(),
      getNextUtcDay(now).toISOString(),
    ],
  );

  return Number(result.rows[0]?.vote_count || 0);
}

function getNextTaskClaimId(store: LocalStore) {
  return (
    store.taskClaims.reduce((maxId, claim) => Math.max(maxId, claim.id), 0) + 1
  );
}

function appendTaskClaimToStore(
  store: LocalStore,
  telegramId: number,
  taskType: TaskClaimType,
  claimedAt: string,
) {
  store.taskClaims.push({
    id: getNextTaskClaimId(store),
    telegramId,
    taskType,
    claimedAt,
  });
}

async function appendTaskClaimToDatabase(
  queryable: Queryable,
  telegramId: number,
  taskType: TaskClaimType,
  claimedAt: string,
) {
  await queryable.query(
    `
      insert into public.task_claims (telegram_id, task_type, claimed_at)
      values ($1, $2, $3::timestamptz)
    `,
    [telegramId, taskType, claimedAt],
  );
}

function getLocalUserOrThrow(store: LocalStore, telegramId: number) {
  const currentUser = store.users.find((entry) => entry.telegramId === telegramId);

  if (!currentUser) {
    throw new Error("User not found.");
  }

  return currentUser;
}

async function getDatabaseUserForUpdate(queryable: Queryable, telegramId: number) {
  const result = await queryable.query<{ xp: number }>(
    `
      select xp
      from public.users
      where telegram_id = $1
      for update
    `,
    [telegramId],
  );

  const currentUser = result.rows[0];

  if (!currentUser) {
    throw new Error("User not found.");
  }

  return currentUser;
}

async function getLatestTaskClaimFromDatabase(
  queryable: Queryable,
  telegramId: number,
  taskType: TaskType,
) {
  const result = await queryable.query<{ claimed_at: string }>(
    `
      select claimed_at::text
      from public.task_claims
      where telegram_id = $1
        and task_type = $2
      order by claimed_at desc
      limit 1
    `,
    [telegramId, taskType],
  );

  return result.rows[0]?.claimed_at || null;
}

function getTaskUnavailableMessage(taskType: TaskType) {
  if (taskType === "join_group_chat") {
    return "Group chat task has already been claimed.";
  }

  return "Task is still on cooldown.";
}

function buildTaskStatus(input: {
  taskType: TaskType;
  claims: TaskClaimMap;
  currentStreak: number;
  lastCheckInDate?: string | null;
  now?: Date;
  voteProgressToday?: number;
}): TaskStatus {
  const now = input.now || new Date();

  if (input.taskType === "daily_check_in") {
    const checkedInToday = input.lastCheckInDate === getTodayUtc();
    const rewardStreak = checkedInToday
      ? Math.max(input.currentStreak, 1)
      : getNextCheckInStreak(input.lastCheckInDate, input.currentStreak);
    const availableAt = checkedInToday ? getNextUtcDay(now).toISOString() : null;

    return {
      taskType: input.taskType,
      claimed: checkedInToday,
      claimedAt:
        input.claims.daily_check_in ||
        (input.lastCheckInDate ? `${input.lastCheckInDate}T00:00:00.000Z` : null),
      xpReward: getCheckInXpReward(rewardStreak),
      cooldownHours: TASK_DEFINITIONS.daily_check_in.cooldownHours,
      cooldownRemainingMs: checkedInToday ? getRemainingMsUntilNextUtcDay(now) : 0,
      availableAt,
      manualClaim: false,
    };
  }

  const claimedAt = input.claims[input.taskType] || null;
  const availability = getTaskAvailability(input.taskType, claimedAt, now);
  const definition = TASK_DEFINITIONS[input.taskType];

  return {
    taskType: input.taskType,
    claimed: availability.claimed,
    claimedAt,
    xpReward: definition.xp,
    cooldownHours: definition.cooldownHours,
    cooldownRemainingMs: availability.cooldownRemainingMs,
    availableAt: availability.availableAt,
    manualClaim: definition.manualClaim,
    progress:
      input.taskType === "vote_on_3_cards"
        ? Math.min(input.voteProgressToday || 0, definition.goal || 0)
        : undefined,
    goal: input.taskType === "vote_on_3_cards" ? definition.goal : undefined,
  };
}

function buildTaskStatuses(input: {
  claims: TaskClaimMap;
  currentStreak: number;
  lastCheckInDate?: string | null;
  voteProgressToday: number;
  now?: Date;
}) {
  return TASK_ORDER.map((taskType) =>
    buildTaskStatus({
      taskType,
      claims: input.claims,
      currentStreak: input.currentStreak,
      lastCheckInDate: input.lastCheckInDate,
      voteProgressToday: input.voteProgressToday,
      now: input.now,
    }),
  );
}

function tryClaimTaskInStore(
  store: LocalStore,
  telegramId: number,
  taskType: ClaimableTaskType,
  options?: { now?: Date; errorOnUnavailable?: boolean },
) {
  const now = options?.now || new Date();
  const currentUser = getLocalUserOrThrow(store, telegramId);
  const latestClaimedAt = getLatestClaimMapFromStore(store, telegramId)[taskType] || null;
  const availability = getTaskAvailability(taskType, latestClaimedAt, now);

  if (availability.claimed) {
    if (options?.errorOnUnavailable) {
      throw new Error(getTaskUnavailableMessage(taskType));
    }

    return {
      claimed: false,
      xp: currentUser.xp,
    };
  }

  const claimedAt = now.toISOString();

  appendTaskClaimToStore(store, telegramId, taskType, claimedAt);
  currentUser.xp += TASK_DEFINITIONS[taskType].xp;

  return {
    claimed: true,
    xp: currentUser.xp,
    claimedAt,
  };
}

async function tryClaimTaskInDatabase(
  queryable: Queryable,
  telegramId: number,
  taskType: ClaimableTaskType,
  options?: { now?: Date; errorOnUnavailable?: boolean },
) {
  const now = options?.now || new Date();
  const currentUser = await getDatabaseUserForUpdate(queryable, telegramId);
  const latestClaimedAt = await getLatestTaskClaimFromDatabase(queryable, telegramId, taskType);
  const availability = getTaskAvailability(taskType, latestClaimedAt, now);

  if (availability.claimed) {
    if (options?.errorOnUnavailable) {
      throw new Error(getTaskUnavailableMessage(taskType));
    }

    return {
      claimed: false,
      xp: currentUser.xp,
    };
  }

  const claimedAt = now.toISOString();

  await appendTaskClaimToDatabase(queryable, telegramId, taskType, claimedAt);

  const updated = await queryable.query<{ xp: number }>(
    `
      update public.users
      set xp = xp + $2, updated_at = now()
      where telegram_id = $1
      returning xp
    `,
    [telegramId, TASK_DEFINITIONS[taskType].xp],
  );

  return {
    claimed: true,
    xp: updated.rows[0].xp,
    claimedAt,
  };
}

export function getEffectiveStreak(lastCheckInDate?: string | null, currentStreak = 0) {
  if (!lastCheckInDate || currentStreak === 0) {
    return 0;
  }

  const today = getTodayUtc();

  if (lastCheckInDate === today || lastCheckInDate === getPreviousUtcDay(today)) {
    return currentStreak;
  }

  return 0;
}

export function getNextCheckInStreak(lastCheckInDate?: string | null, currentStreak = 0) {
  const today = getTodayUtc();

  if (lastCheckInDate === today) {
    return Math.max(currentStreak, 1);
  }

  return lastCheckInDate === getPreviousUtcDay(today) ? currentStreak + 1 : 1;
}

export function getCheckInBonus(streakDay: number) {
  return Math.min(streakDay * 2, CHECK_IN_MAX_BONUS_XP);
}

export function getCheckInXpReward(streakDay: number) {
  return CHECK_IN_BASE_XP + getCheckInBonus(streakDay);
}

export async function getTaskSummary(
  user: AuthenticatedAppUser,
  origin: string,
): Promise<TaskSummary> {
  const mode = await resolveStorageMode();
  const now = new Date();

  if (mode === "local") {
    const store = await readLocalStore();
    const currentUser = store.users.find((entry) => entry.telegramId === user.telegramId);

    if (!currentUser) {
      throw new Error("User not found.");
    }

    const currentStreak = getEffectiveStreak(
      currentUser.lastCheckInDate,
      currentUser.currentStreak,
    );
    const claims = getLatestClaimMapFromStore(store, user.telegramId);
    const voteProgressToday = getVoteProgressCountFromStore(store, user.telegramId, now);
    const tasks = buildTaskStatuses({
      claims,
      currentStreak,
      lastCheckInDate: currentUser.lastCheckInDate,
      voteProgressToday,
      now,
    });

    return {
      currentStreak,
      checkedInToday: currentUser.lastCheckInDate === getTodayUtc(),
      referralCode: currentUser.referralCode,
      referralCount: store.users.filter(
        (entry) => entry.referredByTelegramId === currentUser.telegramId,
      ).length,
      referralLink: `${origin}/?ref=${currentUser.referralCode}`,
      xp: currentUser.xp,
      tasks,
    };
  }

  const pool = getPool();
  const [userResult, claims, voteProgressToday] = await Promise.all([
    pool.query<{
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
    ),
    getLatestClaimMapFromDatabase(pool, user.telegramId),
    getVoteProgressCountFromDatabase(pool, user.telegramId, now),
  ]);

  const currentUser = userResult.rows[0];

  if (!currentUser) {
    throw new Error("User not found.");
  }

  const currentStreak = getEffectiveStreak(
    currentUser.last_check_in_date,
    currentUser.current_streak,
  );
  const tasks = buildTaskStatuses({
    claims,
    currentStreak,
    lastCheckInDate: currentUser.last_check_in_date,
    voteProgressToday,
    now,
  });

  return {
    currentStreak,
    checkedInToday: currentUser.last_check_in_date === getTodayUtc(),
    referralCode: currentUser.referral_code,
    referralCount: Number(currentUser.referral_count),
    referralLink: `${origin}/?ref=${currentUser.referral_code}`,
    xp: currentUser.xp,
    tasks,
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

      const nextStreak = getNextCheckInStreak(
        currentUser.lastCheckInDate,
        currentUser.currentStreak,
      );
      const reward = getCheckInXpReward(nextStreak);

      currentUser.currentStreak = nextStreak;
      currentUser.lastCheckInDate = today;
      currentUser.xp += reward;
      appendTaskClaimToStore(store, user.telegramId, "daily_check_in", new Date().toISOString());

      return {
        currentStreak: currentUser.currentStreak,
        checkedInToday: true,
        xp: currentUser.xp,
        xpAwarded: reward,
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

    const nextStreak = getNextCheckInStreak(
      currentUser.last_check_in_date,
      currentUser.current_streak,
    );
    const reward = getCheckInXpReward(nextStreak);
    const claimedAt = new Date().toISOString();

    const updated = await client.query<{
      current_streak: number;
      xp: number;
    }>(
      `
        update public.users
        set
          current_streak = $2,
          last_check_in_date = $3::date,
          xp = xp + $4,
          updated_at = now()
        where telegram_id = $1
        returning current_streak, xp
      `,
      [user.telegramId, nextStreak, today, reward],
    );

    await appendTaskClaimToDatabase(client, user.telegramId, "daily_check_in", claimedAt);
    await client.query("commit");

    return {
      currentStreak: updated.rows[0].current_streak,
      checkedInToday: true,
      xp: updated.rows[0].xp,
      xpAwarded: reward,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function claimManualTask(user: AuthenticatedAppUser, taskType: TaskType) {
  if (!MANUAL_TASK_TYPE_SET.has(taskType)) {
    throw new Error("Task cannot be claimed manually.");
  }

  const claimableTaskType = taskType as ClaimableTaskType;

  const mode = await resolveStorageMode();

  if (mode === "local") {
    return mutateLocalStore((store) =>
      tryClaimTaskInStore(store, user.telegramId, claimableTaskType, {
        errorOnUnavailable: true,
      }),
    );
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await tryClaimTaskInDatabase(client, user.telegramId, claimableTaskType, {
      errorOnUnavailable: true,
    });
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export function maybeClaimSubmitCardTaskInStore(store: LocalStore, telegramId: number) {
  return tryClaimTaskInStore(store, telegramId, "submit_card");
}

export async function maybeClaimSubmitCardTaskInDatabase(
  queryable: Queryable,
  telegramId: number,
) {
  return tryClaimTaskInDatabase(queryable, telegramId, "submit_card");
}

export function maybeClaimInviteFriendTaskInStore(store: LocalStore, telegramId: number) {
  return tryClaimTaskInStore(store, telegramId, "invite_friend");
}

export async function maybeClaimInviteFriendTaskInDatabase(
  queryable: Queryable,
  telegramId: number,
) {
  return tryClaimTaskInDatabase(queryable, telegramId, "invite_friend");
}

export function recordVoteProgressInStore(store: LocalStore, telegramId: number) {
  appendTaskClaimToStore(store, telegramId, VOTE_PROGRESS_TASK_TYPE, new Date().toISOString());

  if (getVoteProgressCountFromStore(store, telegramId) < (TASK_DEFINITIONS.vote_on_3_cards.goal || 0)) {
    const currentUser = getLocalUserOrThrow(store, telegramId);

    return {
      claimed: false,
      xp: currentUser.xp,
    };
  }

  return tryClaimTaskInStore(store, telegramId, "vote_on_3_cards");
}

export async function recordVoteProgressInDatabase(queryable: Queryable, telegramId: number) {
  const claimedAt = new Date().toISOString();

  await appendTaskClaimToDatabase(queryable, telegramId, VOTE_PROGRESS_TASK_TYPE, claimedAt);

  if (
    (await getVoteProgressCountFromDatabase(queryable, telegramId)) <
    (TASK_DEFINITIONS.vote_on_3_cards.goal || 0)
  ) {
    const currentUser = await getDatabaseUserForUpdate(queryable, telegramId);

    return {
      claimed: false,
      xp: currentUser.xp,
    };
  }

  return tryClaimTaskInDatabase(queryable, telegramId, "vote_on_3_cards");
}
