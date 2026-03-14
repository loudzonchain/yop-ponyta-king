import { AppLanguage } from "@/types/telegram";

export type AppText = {
  title: string;
  subtitle: string;
  heroTopline: string;
  statusTelegram: string;
  statusDev: string;
  authenticating: string;
  authenticateError: string;
  authenticationFailed: string;
  displayName: string;
  username: string;
  source: string;
  language: string;
  streak: string;
  xp: string;
  cards: string;
  tasks: string;
  ranks: string;
  profile: string;
  cardsCopy: string;
  tasksCopy: string;
  ranksCopy: string;
  profileCopy: string;
  waiting: string;
  unavailable: string;
  profileStats: string;
  referralCount: string;
  checkedIn: string;
  checkedInDone: string;
  checkedInOpen: string;
  checkedInToday: string;
  sourceTelegram: string;
  sourceDev: string;
  sourceUnknown: string;
  languageToggle: string;
  devUser: string;
  defaultOption: string;
  english: string;
  japanese: string;
  updateLanguageError: string;
  uploadCardIntro: string;
  caption: string;
  captionPlaceholder: string;
  image: string;
  imageHint: string;
  submitCard: string;
  uploading: string;
  latestCards: string;
  newestFirst: string;
  noCardsYet: string;
  loadingGallery: string;
  vote: string;
  removeVote: string;
  yourCard: string;
  voteCount: (count: number) => string;
  loadCardsError: string;
  authenticateBeforeUpload: string;
  chooseImageBeforeSubmit: string;
  uploadCardError: string;
  cardUploaded: string;
  authenticateBeforeVote: string;
  updateVoteError: string;
  currentStreak: string;
  currentStreakValue: (count: number) => string;
  checkInStatus: string;
  claimDailyCheckIn: string;
  checkingIn: string;
  referralLink: string;
  referralDescription: string;
  copyLink: string;
  loadingTasks: string;
  loadTasksError: string;
  authenticateBeforeCheckIn: string;
  checkInError: string;
  dailyCheckInClaimed: string;
  referralLinkCopied: string;
  copyReferralLinkError: string;
  localDevHint: string;
  openAsDevUser: (devUser: string) => string;
  leaderboardIntro: string;
  loadingLeaderboard: string;
  loadLeaderboardError: string;
  noRankedUsers: string;
  noUsername: string;
};

export type AppCopy = Record<AppLanguage, AppText>;

export const copy: AppCopy = {
  en: {
    title: "$YOP Ponyta King",
    subtitle: "Ponyta Ranch-inspired Telegram adventure",
    heroTopline: "PONYTA RANCH // TELEGRAM MINI APP",
    statusTelegram: "Connected to Telegram",
    statusDev: "Development fallback active",
    authenticating: "Authenticating...",
    authenticateError: "Unable to authenticate.",
    authenticationFailed: "Authentication failed",
    displayName: "Display Name",
    username: "Username",
    source: "Source",
    language: "Language",
    streak: "Streak",
    xp: "XP",
    cards: "Cards",
    tasks: "Tasks",
    ranks: "Ranks",
    profile: "Profile",
    cardsCopy: "Share meme cards with the ranch, then vote on the freshest uploads.",
    tasksCopy: "Keep your daily streak alive and track referral progress.",
    ranksCopy: "See where you stand in the Ponyta King leaderboard.",
    profileCopy: "Your Telegram identity, streak, XP, and growth stats live here.",
    waiting: "Waiting for auth",
    unavailable: "Unavailable",
    profileStats: "Profile Stats",
    referralCount: "Referrals",
    checkedIn: "Check-in",
    checkedInDone: "Done today",
    checkedInOpen: "Available",
    checkedInToday: "Checked In Today",
    sourceTelegram: "telegram",
    sourceDev: "dev",
    sourceUnknown: "Unknown",
    languageToggle: "Language",
    devUser: "Dev user",
    defaultOption: "Default",
    english: "English",
    japanese: "Japanese",
    updateLanguageError: "Unable to update language.",
    uploadCardIntro: "Upload a meme card with an image and caption, then vote on community cards.",
    caption: "Caption",
    captionPlaceholder: "Write a caption for your card",
    image: "Image",
    imageHint: "JPEG, PNG, GIF, or WebP up to 5MB",
    submitCard: "Submit Card",
    uploading: "Uploading...",
    latestCards: "Latest Cards",
    newestFirst: "Newest first",
    noCardsYet: "No cards yet. Upload the first one.",
    loadingGallery: "Loading gallery...",
    vote: "Vote",
    removeVote: "Remove Vote",
    yourCard: "Your card",
    voteCount: (count) => `${count} vote${count === 1 ? "" : "s"}`,
    loadCardsError: "Unable to load cards.",
    authenticateBeforeUpload: "Authenticate first before uploading.",
    chooseImageBeforeSubmit: "Choose an image before submitting.",
    uploadCardError: "Unable to upload card.",
    cardUploaded: "Card uploaded.",
    authenticateBeforeVote: "Authenticate first before voting.",
    updateVoteError: "Unable to update vote.",
    currentStreak: "Current Streak",
    currentStreakValue: (count) => `${count} day${count === 1 ? "" : "s"}`,
    checkInStatus: "Check-in Status",
    claimDailyCheckIn: "Claim Daily Check-in",
    checkingIn: "Checking In...",
    referralLink: "Referral Link",
    referralDescription:
      "Share this link. If a new user opens the app with it first, they are recorded as your referral.",
    copyLink: "Copy Link",
    loadingTasks: "Loading tasks...",
    loadTasksError: "Unable to load tasks.",
    authenticateBeforeCheckIn: "Authenticate first before checking in.",
    checkInError: "Unable to check in.",
    dailyCheckInClaimed: "Daily check-in claimed.",
    referralLinkCopied: "Referral link copied.",
    copyReferralLinkError: "Unable to copy referral link.",
    localDevHint:
      "Local dev hint: use one of the links below on another device so the referral opens as a different dev user.",
    openAsDevUser: (devUser) => `Open as ${devUser}`,
    leaderboardIntro: "Users are ranked by XP earned from votes received on their cards.",
    loadingLeaderboard: "Loading leaderboard...",
    loadLeaderboardError: "Unable to load leaderboard.",
    noRankedUsers: "No ranked users yet. Votes will populate the leaderboard.",
    noUsername: "No username",
  },
  ja: {
    title: "$YOP Ponyta King",
    subtitle: "ポニータ牧場風のTelegramミニアプリ",
    heroTopline: "PONYTA RANCH // TELEGRAM MINI APP",
    statusTelegram: "Telegram接続中",
    statusDev: "開発フォールバック中",
    authenticating: "認証中...",
    authenticateError: "認証できませんでした。",
    authenticationFailed: "認証に失敗しました",
    displayName: "表示名",
    username: "ユーザー名",
    source: "認証元",
    language: "言語",
    streak: "連続日数",
    xp: "XP",
    cards: "カード",
    tasks: "タスク",
    ranks: "ランキング",
    profile: "プロフィール",
    cardsCopy: "ミームカードを投稿して、新しいカードに投票しましょう。",
    tasksCopy: "毎日の連続記録を守り、紹介状況を確認しましょう。",
    ranksCopy: "Ponyta Kingランキングで自分の順位を確認できます。",
    profileCopy: "Telegram情報、連続記録、XP、紹介数をまとめて表示します。",
    waiting: "認証待ち",
    unavailable: "未設定",
    profileStats: "プロフィール統計",
    referralCount: "紹介人数",
    checkedIn: "今日のチェックイン",
    checkedInDone: "完了",
    checkedInOpen: "可能",
    checkedInToday: "本日はチェックイン済み",
    sourceTelegram: "telegram",
    sourceDev: "dev",
    sourceUnknown: "不明",
    languageToggle: "言語",
    devUser: "開発ユーザー",
    defaultOption: "デフォルト",
    english: "英語",
    japanese: "日本語",
    updateLanguageError: "言語を更新できませんでした。",
    uploadCardIntro: "画像とキャプション付きのミームカードを投稿して、みんなのカードに投票しましょう。",
    caption: "キャプション",
    captionPlaceholder: "カードのキャプションを書いてください",
    image: "画像",
    imageHint: "5MBまでのJPEG、PNG、GIF、またはWebP",
    submitCard: "カードを投稿",
    uploading: "アップロード中...",
    latestCards: "最新カード",
    newestFirst: "新しい順",
    noCardsYet: "まだカードがありません。最初の1枚を投稿しましょう。",
    loadingGallery: "ギャラリーを読み込み中...",
    vote: "投票",
    removeVote: "投票を取り消す",
    yourCard: "あなたのカード",
    voteCount: (count) => `${count}票`,
    loadCardsError: "カードを読み込めませんでした。",
    authenticateBeforeUpload: "投稿する前に認証してください。",
    chooseImageBeforeSubmit: "送信する前に画像を選択してください。",
    uploadCardError: "カードをアップロードできませんでした。",
    cardUploaded: "カードを投稿しました。",
    authenticateBeforeVote: "投票する前に認証してください。",
    updateVoteError: "投票を更新できませんでした。",
    currentStreak: "現在の連続日数",
    currentStreakValue: (count) => `${count}日`,
    checkInStatus: "チェックイン状況",
    claimDailyCheckIn: "デイリーチェックインを受け取る",
    checkingIn: "チェックイン中...",
    referralLink: "紹介リンク",
    referralDescription:
      "このリンクを共有しましょう。新しいユーザーが最初にこのリンクからアプリを開くと、あなたの紹介として記録されます。",
    copyLink: "リンクをコピー",
    loadingTasks: "タスクを読み込み中...",
    loadTasksError: "タスクを読み込めませんでした。",
    authenticateBeforeCheckIn: "チェックインする前に認証してください。",
    checkInError: "チェックインできませんでした。",
    dailyCheckInClaimed: "デイリーチェックインを受け取りました。",
    referralLinkCopied: "紹介リンクをコピーしました。",
    copyReferralLinkError: "紹介リンクをコピーできませんでした。",
    localDevHint:
      "ローカル開発のヒント: 別の端末で下のリンクを使うと、別の開発ユーザーとして紹介リンクを開けます。",
    openAsDevUser: (devUser) => `${devUser}として開く`,
    leaderboardIntro: "カードが獲得した投票によるXPでユーザーがランキングされます。",
    loadingLeaderboard: "ランキングを読み込み中...",
    loadLeaderboardError: "ランキングを読み込めませんでした。",
    noRankedUsers: "まだランキング登録ユーザーがいません。投票が入ると反映されます。",
    noUsername: "ユーザー名なし",
  },
};
