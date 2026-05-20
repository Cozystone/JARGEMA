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

type MemoryStore = {
  users: UserRecord[];
  classes: ClassRecord[];
  snapshots: SnapshotRecord[];
};

const globalForStore = globalThis as unknown as { jargemaStore?: MemoryStore };

export const store =
  globalForStore.jargemaStore ??
  (globalForStore.jargemaStore = {
    users: [],
    classes: [],
    snapshots: [],
  });

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

export function updateDetection(input: { classCode?: string; userId: string; username: string; jds: number; level: string }) {
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
