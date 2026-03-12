export type CardRecord = {
  id: number;
  caption: string;
  imageUrl: string;
  authorTelegramId: number;
  authorDisplayName: string;
  authorUsername?: string;
  voteCount: number;
  userHasVoted: boolean;
  createdAt: string;
};

export type LeaderboardEntry = {
  telegramId: number;
  displayName: string;
  username?: string;
  xp: number;
  rank: number;
};
