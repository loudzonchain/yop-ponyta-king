export const TASK_TYPES = [
  "daily_check_in",
  "submit_card",
  "vote_on_3_cards",
  "invite_friend",
  "share_on_x_twitter",
  "join_group_chat",
] as const;

export const INTERNAL_TASK_TYPES = ["vote_on_3_cards_progress"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type InternalTaskType = (typeof INTERNAL_TASK_TYPES)[number];
export type TaskClaimType = TaskType | InternalTaskType;

export type TaskStatus = {
  taskType: TaskType;
  claimed: boolean;
  claimedAt: string | null;
  xpReward: number;
  cooldownHours: number | null;
  cooldownRemainingMs: number | null;
  availableAt: string | null;
  manualClaim: boolean;
  progress?: number;
  goal?: number;
};

export type TaskSummary = {
  currentStreak: number;
  checkedInToday: boolean;
  referralCode: string;
  referralCount: number;
  referralLink: string;
  xp: number;
  tasks: TaskStatus[];
};
