import crypto from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { AuthenticatedAppUser } from "@/types/telegram";
import { CardRecord } from "@/types/cards";
import { TaskClaimType } from "@/types/tasks";

export type LocalUserRecord = {
  telegramId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  displayName: string;
  language: AuthenticatedAppUser["language"];
  xp: number;
  currentStreak: number;
  lastCheckInDate?: string;
  referralCode: string;
  referredByTelegramId?: number;
};

export type LocalVoteRecord = {
  cardId: number;
  voterTelegramId: number;
  createdAt: string;
};

export type LocalTaskClaimRecord = {
  id: number;
  telegramId: number;
  taskType: TaskClaimType;
  claimedAt: string;
};

export type LocalStore = {
  users: LocalUserRecord[];
  cards: CardRecord[];
  votes: LocalVoteRecord[];
  taskClaims: LocalTaskClaimRecord[];
};

let schemaReady = false;
let storageMode: "database" | "local" | null = null;
let localStoreMutationQueue: Promise<void> = Promise.resolve();

function getLocalStorePath() {
  const dataDir = process.env.LOCAL_DATA_DIR || "./.data";
  return path.resolve(process.cwd(), dataDir, "cards.json");
}

export function getSchemaReadyState() {
  return schemaReady;
}

export function setSchemaReadyState(value: boolean) {
  schemaReady = value;
}

export function getStorageModeState() {
  return storageMode;
}

export function setStorageModeState(value: "database" | "local" | null) {
  storageMode = value;
}

export async function ensureLocalStore() {
  const storePath = getLocalStorePath();
  const directory = path.dirname(storePath);

  await mkdir(directory, { recursive: true });

  try {
    await readFile(storePath, "utf8");
  } catch {
    const initialStore: LocalStore = { users: [], cards: [], votes: [], taskClaims: [] };
    await writeFile(storePath, JSON.stringify(initialStore, null, 2), "utf8");
  }

  return storePath;
}

export function normalizeCardRecord(card: Partial<CardRecord>): CardRecord {
  return {
    id: Number(card.id || 0),
    caption: card.caption || "",
    imageUrl: card.imageUrl || "",
    authorTelegramId: Number(card.authorTelegramId || 0),
    authorDisplayName: card.authorDisplayName || "Unknown User",
    authorUsername: card.authorUsername || undefined,
    voteCount: Number(card.voteCount || 0),
    userHasVoted: Boolean(card.userHasVoted),
    createdAt: card.createdAt || new Date(0).toISOString(),
  };
}

export function parseLocalStore(contents: string) {
  try {
    return {
      store: JSON.parse(contents) as Partial<LocalStore>,
      recovered: false,
    };
  } catch {
    const match = contents.match(
      /\{[\s\S]*"votes"\s*:\s*\[[\s\S]*?\](?:\s*,\s*"taskClaims"\s*:\s*\[[\s\S]*?\])?\s*\}/,
    );

    if (!match) {
      throw new Error("Local cards store is corrupted.");
    }

    return {
      store: JSON.parse(match[0]) as Partial<LocalStore>,
      recovered: true,
    };
  }
}

function normalizeVoteRecord(
  vote: Partial<LocalVoteRecord> & { cardId?: number; voterTelegramId?: number },
): LocalVoteRecord {
  return {
    cardId: Number(vote.cardId || 0),
    voterTelegramId: Number(vote.voterTelegramId || 0),
    createdAt: vote.createdAt || new Date(0).toISOString(),
  };
}

function normalizeTaskClaimRecord(
  claim: Partial<LocalTaskClaimRecord> & {
    id?: number;
    telegramId?: number;
    taskType?: TaskClaimType;
  },
  fallbackId: number,
): LocalTaskClaimRecord {
  return {
    id: Number(claim.id || fallbackId),
    telegramId: Number(claim.telegramId || 0),
    taskType: (claim.taskType || "daily_check_in") as TaskClaimType,
    claimedAt: claim.claimedAt || new Date(0).toISOString(),
  };
}

export async function readLocalStore() {
  const storePath = await ensureLocalStore();
  const contents = await readFile(storePath, "utf8");
  const parsed = parseLocalStore(contents);
  const store = parsed.store;

  return {
    users: (store.users || []).map((user) => ({
      ...user,
      xp: user.xp ?? 0,
      currentStreak: user.currentStreak ?? 0,
      referralCode: user.referralCode || `ref_${user.telegramId}`,
    })),
    cards: (store.cards || []).map(normalizeCardRecord),
    votes: (store.votes || []).map(normalizeVoteRecord),
    taskClaims: (store.taskClaims || []).map((claim, index) =>
      normalizeTaskClaimRecord(claim, index + 1),
    ),
  } satisfies LocalStore;
}

export async function writeLocalStore(store: LocalStore) {
  const storePath = await ensureLocalStore();
  const tempPath = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;

  await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
  await rename(tempPath, storePath);
}

export async function withLocalStoreFileLock<T>(callback: () => Promise<T>) {
  const storePath = getLocalStorePath();
  const lockPath = `${storePath}.lock`;

  for (;;) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  try {
    return await callback();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

export async function mutateLocalStore<T>(mutator: (store: LocalStore) => Promise<T> | T) {
  const pendingMutation = localStoreMutationQueue.then(async () => {
    return withLocalStoreFileLock(async () => {
      const store = await readLocalStore();
      const result = await mutator(store);
      await writeLocalStore(store);
      return result;
    });
  });

  localStoreMutationQueue = pendingMutation.then(
    () => undefined,
    () => undefined,
  );

  return pendingMutation;
}
