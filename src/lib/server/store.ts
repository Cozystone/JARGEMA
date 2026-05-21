import bcrypt from "bcryptjs";

export type UserRecord = {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName?: string;
};

export type ClassRecord = {
  id: string;
  code: string;
  name: string;
  hostId: string;
  members: { userId: string; username: string; role: "host" | "student"; jds: number; level: string; updatedAt: string }[];
  createdAt: string;
};

export type SnapshotRecord = {
  id: string;
  userId: string;
  username: string;
  imageUrl: string;
  jdsScore: number;
  caption: string;
  isPublic: boolean;
  classCode?: string;
  createdAt: string;
  reactions: Record<string, number>;
};

export type DetectionLogRecord = {
  userId: string;
  username: string;
  jds: number;
  level: string;
  createdAt: string;
  classCode?: string;
  perclos?: number;
  eyeClosureRatio?: number;
  microsleepDuration?: number;
  headDrop?: number;
};

export type PatternReport = {
  summary: string;
  peakDrowsyHour: number | null;
  riskWindows: { label: string; avgJds: number; count: number }[];
  recurringSignals: string[];
  nextRiskHint: string;
  sampleCount: number;
  updatedAt: string;
};

type MemoryStore = {
  users: UserRecord[];
  classes: ClassRecord[];
  snapshots: SnapshotRecord[];
  detectionLogs: DetectionLogRecord[];
};

const globalForStore = globalThis as unknown as { jargemaStore?: MemoryStore };

export const store =
  globalForStore.jargemaStore ??
  (globalForStore.jargemaStore = {
    users: [],
    classes: [],
    snapshots: [],
    detectionLogs: [],
  });

if (!store.detectionLogs) store.detectionLogs = [];

export function publicUser(user: UserRecord) {
  return { id: user.id, username: user.username, displayName: user.displayName ?? user.username };
}

export async function createUser(username: string, email: string, password: string) {
  if (store.users.some((user) => user.email === email || user.username === username)) {
    throw new Error("user_exists");
  }
  const user: UserRecord = {
    id: crypto.randomUUID(),
    username,
    email,
    displayName: username,
    passwordHash: await bcrypt.hash(password, 12),
  };
  store.users.push(user);
  return user;
}

export async function verifyUser(email: string, password: string) {
  const user = store.users.find((candidate) => candidate.email === email);
  if (!user) return null;
  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}

export function createClass(name: string, host: { id: string; username: string }) {
  let code = "";
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (store.classes.some((room) => room.code === code));

  const room: ClassRecord = {
    id: crypto.randomUUID(),
    code,
    name,
    hostId: host.id,
    createdAt: new Date().toISOString(),
    members: [{ userId: host.id, username: host.username, role: "host", jds: 0, level: "AWAKE", updatedAt: new Date().toISOString() }],
  };
  store.classes.unshift(room);
  return room;
}

export function joinClass(code: string, user: { id: string; username: string }) {
  const room = store.classes.find((candidate) => candidate.code === code.toUpperCase());
  if (!room) throw new Error("class_not_found");
  if (!room.members.some((member) => member.userId === user.id)) {
    room.members.push({ userId: user.id, username: user.username, role: "student", jds: 0, level: "AWAKE", updatedAt: new Date().toISOString() });
  }
  return room;
}

export function updateDetection(input: {
  classCode?: string;
  userId: string;
  username: string;
  jds: number;
  level: string;
  perclos?: number;
  eyeClosureRatio?: number;
  microsleepDuration?: number;
  headDrop?: number;
}) {
  addDetectionLog(input);
  if (!input.classCode) return null;
  const room = store.classes.find((candidate) => candidate.code === input.classCode?.toUpperCase());
  if (!room) return null;
  const member = room.members.find((candidate) => candidate.userId === input.userId);
  if (member) {
    member.jds = input.jds;
    member.level = input.level;
    member.updatedAt = new Date().toISOString();
  } else {
    room.members.push({ userId: input.userId, username: input.username, role: "student", jds: input.jds, level: input.level, updatedAt: new Date().toISOString() });
  }
  return room;
}

export function addDetectionLog(input: {
  classCode?: string;
  userId: string;
  username: string;
  jds: number;
  level: string;
  perclos?: number;
  eyeClosureRatio?: number;
  microsleepDuration?: number;
  headDrop?: number;
}) {
  store.detectionLogs.unshift({
    ...input,
    classCode: input.classCode?.toUpperCase(),
    createdAt: new Date().toISOString(),
  });

  const userLogs = store.detectionLogs.filter((log) => log.userId === input.userId);
  if (userLogs.length > 2000) {
    const keep = new Set(userLogs.slice(0, 2000).map((log) => log.createdAt));
    store.detectionLogs = store.detectionLogs.filter((log) => log.userId !== input.userId || keep.has(log.createdAt));
  }
}

export function analyzeUserPatterns(userId: string): PatternReport {
  const logs = store.detectionLogs
    .filter((log) => log.userId === userId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const sampleCount = logs.length;
  const updatedAt = new Date().toISOString();

  if (sampleCount < 12) {
    return {
      summary: "분석 데이터 수집 중입니다. 감지를 켠 상태로 조금 더 사용하면 개인 패턴을 찾습니다.",
      peakDrowsyHour: null,
      riskWindows: [],
      recurringSignals: ["최소 1분 정도의 감지 로그가 필요합니다."],
      nextRiskHint: "감지 시작 후 평소처럼 공부하면 JARGEMA가 졸음 패턴을 모읍니다.",
      sampleCount,
      updatedAt,
    };
  }

  const byHour = new Map<number, DetectionLogRecord[]>();
  for (const log of logs) {
    const hour = new Date(log.createdAt).getHours();
    byHour.set(hour, [...(byHour.get(hour) ?? []), log]);
  }

  const hourStats = [...byHour.entries()]
    .map(([hour, values]) => {
      const avgJds = average(values.map((log) => log.jds));
      const highCount = values.filter((log) => log.jds >= 60 || log.level === "ASLEEP").length;
      return { hour, avgJds, highCount, count: values.length };
    })
    .sort((a, b) => b.avgJds + b.highCount * 3 - (a.avgJds + a.highCount * 3));

  const peak = hourStats[0];
  const riskWindows = hourStats
    .filter((stat) => stat.count >= 2)
    .slice(0, 3)
    .map((stat) => ({ label: `${stat.hour}시대`, avgJds: Math.round(stat.avgJds), count: stat.count }));

  const recent = logs.filter((log) => Date.now() - new Date(log.createdAt).getTime() <= 30 * 60_000);
  const recentAvg = average(recent.map((log) => log.jds));
  const totalAvg = average(logs.map((log) => log.jds));
  const signals = buildRecurringSignals(logs, recentAvg, totalAvg);
  const peakHour = peak ? peak.hour : null;

  return {
    summary:
      peakHour === null
        ? "아직 뚜렷한 시간대 패턴은 약하지만, 최근 졸음 신호를 계속 비교하고 있습니다."
        : `${peakHour}시대에 졸음 점수가 가장 높게 나타납니다. 최근 평균 JDS는 ${Math.round(recentAvg)}점입니다.`,
    peakDrowsyHour: peakHour,
    riskWindows,
    recurringSignals: signals,
    nextRiskHint: buildNextRiskHint(peakHour, recentAvg, totalAvg),
    sampleCount,
    updatedAt,
  };
}

export function addSnapshot(snapshot: Omit<SnapshotRecord, "id" | "createdAt" | "reactions">) {
  const record: SnapshotRecord = {
    ...snapshot,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reactions: {},
  };
  store.snapshots.unshift(record);
  return record;
}

function buildRecurringSignals(logs: DetectionLogRecord[], recentAvg: number, totalAvg: number) {
  const signals: string[] = [];
  const eyeHeavy = logs.filter((log) => (log.eyeClosureRatio ?? 0) >= 0.55 || (log.microsleepDuration ?? 0) >= 800).length;
  const headHeavy = logs.filter((log) => (log.headDrop ?? 0) >= 8).length;
  const highJds = logs.filter((log) => log.jds >= 60).length;

  if (eyeHeavy / logs.length >= 0.25) signals.push("눈 감김과 긴 깜빡임이 반복적으로 먼저 나타납니다.");
  if (headHeavy / logs.length >= 0.2) signals.push("고개 하강이 졸음 상승과 함께 자주 감지됩니다.");
  if (highJds >= 3) signals.push("높은 졸음 구간이 여러 번 반복되었습니다.");
  if (recentAvg > totalAvg + 8) signals.push("최근 30분 졸음이 평소보다 빠르게 올라가고 있습니다.");
  if (signals.length === 0) signals.push("아직 한 가지로 고정된 반복 신호는 약합니다.");
  return signals.slice(0, 4);
}

function buildNextRiskHint(peakHour: number | null, recentAvg: number, totalAvg: number) {
  const nowHour = new Date().getHours();
  if (recentAvg >= 50) return "지금 이미 위험 구간입니다. 자리에서 일어나거나 조명을 밝게 하는 편이 좋습니다.";
  if (peakHour !== null && Math.abs(peakHour - nowHour) <= 1) return "평소 졸음이 올라오는 시간대에 가까워졌습니다. 10분 안에 짧게 환기하세요.";
  if (recentAvg > totalAvg + 5) return "최근 점수가 평소보다 높습니다. 다음 졸음 상승 전 눈과 자세를 먼저 확인하세요.";
  return "현재는 급한 위험 신호가 약합니다. 같은 시간대 로그가 더 쌓이면 예측이 선명해집니다.";
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
