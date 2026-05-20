"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Camera, DoorOpen, Eye, Radio, Settings, ShieldCheck, Users, Zap } from "lucide-react";
import { calculateEAR } from "@/lib/drowsiness/ear";
import { calculateJDS, describeJDS } from "@/lib/drowsiness/jds";
import { calculateMAR, YawnTracker } from "@/lib/drowsiness/mar";
import { BlinkTracker, PERCLOSTracker } from "@/lib/drowsiness/perclos";
import { estimateHeadPose } from "@/lib/drowsiness/headpose";
import type { DrowsinessMetrics, JdsResult, Landmark } from "@/lib/drowsiness/types";

type AuthUser = { id: string; username: string; displayName: string };
type ClassRoom = {
  id: string;
  code: string;
  name: string;
  members: { userId: string; username: string; role: string; jds: number; level: string; updatedAt: string }[];
};
type Snapshot = {
  id: string;
  username: string;
  imageUrl: string;
  jdsScore: number;
  caption: string;
  createdAt: string;
  reactions: Record<string, number>;
};

const fallbackMetrics: DrowsinessMetrics = {
  avgEAR: 0,
  mar: 0,
  perclos: 0,
  blinkRate: 0,
  blinkDuration: 0,
  yawnDetected: false,
  headPitch: 0,
  headRoll: 0,
  gazeDown: false,
  consecutiveClosed: 0,
};

const captions = ["오늘도 꿈나라행 직행 티켓", "공부와 수면의 절묘한 콜라보", "교과서가 최고의 수면제"];

export function JargemaApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceMeshLoopRef = useRef<number | null>(null);
  const trackersRef = useRef({
    perclos: new PERCLOSTracker(900),
    blink: new BlinkTracker(),
    yawn: new YawnTracker(),
  });

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("student");
  const [email, setEmail] = useState("student@jargema.local");
  const [password, setPassword] = useState("jargema1234");
  const [authError, setAuthError] = useState("");
  const [cameraStatus, setCameraStatus] = useState("카메라 대기 중");
  const [metrics, setMetrics] = useState<DrowsinessMetrics>(fallbackMetrics);
  const [jds, setJds] = useState<JdsResult>(describeJDS(0));
  const [autoUpload, setAutoUpload] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [className, setClassName] = useState("오후 자습반");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<ClassRoom | null>(null);
  const [feed, setFeed] = useState<Snapshot[]>([]);
  const [lastUploadAt, setLastUploadAt] = useState(0);

  const alertText = useMemo(() => {
    if (jds.score >= 80) return "촬영 조건 도달. 업로드 동의가 켜져 있으면 피드로 전송됩니다.";
    if (jds.score >= 60) return "심각한 졸음입니다. 자세를 바꾸고 잠깐 일어나세요.";
    if (jds.score >= 40) return "졸음 감지. 눈을 크게 뜨고 화면을 다시 봐주세요.";
    if (jds.score >= 20) return "졸음 초기 징후가 있습니다.";
    return "안정적으로 깨어 있습니다.";
  }, [jds.score]);

  async function authenticate() {
    setAuthError("");
    const path = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      setAuthError(data.message ?? authErrorMessage(data.error));
      return;
    }
    setUser(data.user);
  }

  function authErrorMessage(error?: string) {
    if (error === "user_exists") return "이미 사용 중인 이메일 또는 닉네임입니다.";
    if (error === "invalid_input") return "이메일, 닉네임, 비밀번호를 확인해주세요.";
    if (error === "invalid_credentials") return "이메일 또는 비밀번호가 맞지 않습니다.";
    return "인증에 실패했습니다.";
  }

  async function startCamera() {
    setCameraStatus("권한 요청 중");
    if (!window.isSecureContext) {
      setCameraStatus("카메라는 HTTPS 또는 localhost에서만 허용됩니다.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("이 브라우저는 카메라 API를 지원하지 않습니다.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      setCameraStatus("감지 실행 중");
      await startFaceMesh(video);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "CameraError";
      const message =
        name === "NotAllowedError"
          ? "카메라 권한이 차단되었습니다. 주소창 왼쪽 권한 아이콘에서 허용으로 바꾸세요."
          : name === "NotFoundError"
            ? "사용 가능한 카메라를 찾지 못했습니다."
            : `카메라를 시작하지 못했습니다. (${name})`;
      setCameraStatus(message);
    }
  }

  async function startFaceMesh(video: HTMLVideoElement) {
    const { FaceMesh } = await import("@mediapipe/face_mesh");

    const faceMesh = new FaceMesh({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results: { multiFaceLandmarks?: Landmark[][] }) => {
      const landmarks = results.multiFaceLandmarks?.[0];
      drawFrame(video);
      if (!landmarks?.length) {
        setCameraStatus("얼굴을 카메라 중앙에 맞춰주세요.");
        return;
      }
      processLandmarks(landmarks);
    });

    if (faceMeshLoopRef.current) window.cancelAnimationFrame(faceMeshLoopRef.current);
    const sendFrame = async () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        await faceMesh.send({ image: video });
      }
      faceMeshLoopRef.current = window.requestAnimationFrame(sendFrame);
    };
    faceMeshLoopRef.current = window.requestAnimationFrame(sendFrame);
  }

  function drawFrame(video: HTMLVideoElement) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }

  function processLandmarks(landmarks: Landmark[]) {
    const earLeft = calculateEAR(landmarks, "left");
    const earRight = calculateEAR(landmarks, "right");
    const avgEAR = (earLeft + earRight) / 2;
    const mar = calculateMAR(landmarks);
    const headPose = estimateHeadPose(landmarks);
    const isClosed = avgEAR < 0.2;
    const trackers = trackersRef.current;

    trackers.perclos.update(isClosed);
    trackers.blink.update(isClosed);
    const yawnDetected = trackers.yawn.update(mar);

    const nextMetrics: DrowsinessMetrics = {
      avgEAR,
      mar,
      perclos: trackers.perclos.getPerclos(),
      blinkRate: trackers.blink.getRate(),
      blinkDuration: trackers.blink.getLastDuration(),
      yawnDetected,
      headPitch: headPose.pitch,
      headRoll: headPose.roll,
      gazeDown: headPose.pitch > 10,
      consecutiveClosed: trackers.perclos.getConsecutiveClosed(),
    };
    const nextJds = calculateJDS(nextMetrics);
    setMetrics(nextMetrics);
    setJds(nextJds);
    setCameraStatus("감지 실행 중");
    void publishDetection(nextJds);
    if (soundOn && nextJds.score >= 40) beep(nextJds.score);
    if (autoUpload && nextJds.score >= 80) void uploadSnapshot(nextJds.score);
  }

  async function publishDetection(nextJds: JdsResult) {
    if (!user || !room) return;
    await fetch("/api/detections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classCode: room.code, jds: nextJds.score, level: nextJds.level }),
    });
  }

  function beep(score: number) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audio = new AudioContextClass();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = score >= 80 ? 880 : 520;
    gain.gain.value = 0.03;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    window.setTimeout(() => {
      osc.stop();
      audio.close();
    }, 120);
  }

  async function uploadSnapshot(score: number) {
    const now = Date.now();
    if (!user || now - lastUploadAt < 60_000) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setLastUploadAt(now);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(255, 0, 0, 0.72)";
      ctx.fillRect(0, canvas.height - 42, canvas.width, 42);
      ctx.fillStyle = "white";
      ctx.font = "bold 16px monospace";
      ctx.fillText(`JARGEMA | JDS: ${score} | ${new Date().toLocaleString("ko-KR")}`, 12, canvas.height - 16);
    }
    const imageUrl = canvas.toDataURL("image/jpeg", 0.82);
    await fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageUrl,
        jdsScore: score,
        caption: captions[Math.floor(Math.random() * captions.length)],
        isPublic: true,
        classCode: room?.code,
      }),
    });
    await fetchFeed();
  }

  async function createRoom() {
    if (!user) return;
    const response = await fetch("/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: className }),
    });
    const data = await response.json();
    if (response.ok) setRoom(data.classRoom);
  }

  async function joinRoom() {
    if (!user) return;
    const response = await fetch("/api/classes/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinCode }),
    });
    const data = await response.json();
    if (response.ok) setRoom(data.classRoom);
  }

  async function refreshRoom(code: string) {
    const response = await fetch(`/api/classes/${code}`);
    const data = await response.json();
    if (response.ok) setRoom(data.classRoom);
  }

  async function fetchFeed() {
    const response = await fetch("/api/feed");
    const data = await response.json();
    if (response.ok) setFeed(data.snapshots);
  }

  useEffect(() => {
    fetchFeed();
    const timer = window.setInterval(() => {
      fetchFeed();
      if (room?.code) refreshRoom(room.code);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [room?.code]);

  return (
    <main className="min-h-screen bg-[#f6f7f2] text-[#161712]">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-[#f6f7f2]/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#69705d]">졸면 전시된다</p>
            <h1 className="text-2xl font-black tracking-normal sm:text-3xl">JARGEMA</h1>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck size={18} />
            <span className="hidden sm:inline">자동 업로드 기본 OFF</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <section className="space-y-4">
          <div className="grid gap-4 rounded-lg border border-black/10 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="relative overflow-hidden rounded-md bg-[#10120f]">
              <video ref={videoRef} className="hidden" />
              <canvas ref={canvasRef} className="aspect-video w-full object-cover" />
              <div className="absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-xs font-semibold text-white">{cameraStatus}</div>
              <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 0 9999px ${jds.score >= 40 ? "rgba(255,140,0,0.12)" : "transparent"}` }} />
            </div>
            <div className="flex flex-col justify-between gap-3">
              <div className="rounded-md border border-black/10 p-4" style={{ borderColor: jds.color }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#69705d]">JDS SCORE</span>
                  <span className="rounded px-2 py-1 text-xs font-black text-white" style={{ background: jds.color }}>{jds.level}</span>
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-6xl font-black">{jds.score}</span>
                  <span className="mb-2 font-bold text-[#69705d]">/100</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/10">
                  <div className="h-full rounded-full" style={{ width: `${jds.score}%`, background: jds.color }} />
                </div>
              </div>
              <button onClick={startCamera} className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#161712] px-4 font-bold text-white">
                <Camera size={18} /> 감지 시작
              </button>
              <p className="rounded-md bg-[#edf0e6] p-3 text-sm font-semibold">{alertText}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="EAR" value={metrics.avgEAR.toFixed(3)} icon={<Eye size={18} />} />
            <Metric label="PERCLOS" value={`${metrics.perclos.toFixed(1)}%`} icon={<Radio size={18} />} />
            <Metric label="깜빡임" value={`${metrics.blinkRate}/min`} icon={<Zap size={18} />} />
            <Metric label="고개" value={`${metrics.headPitch.toFixed(1)}deg`} icon={<Settings size={18} />} />
          </div>

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">클래스 라이브보드</h2>
                <p className="text-sm font-medium text-[#69705d]">방 코드로 참가하고 5초마다 현재 JDS가 갱신됩니다.</p>
              </div>
              {room && <span className="rounded-md bg-[#00a66a] px-3 py-2 font-black text-white">{room.code}</span>}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="flex gap-2">
                <input value={className} onChange={(event) => setClassName(event.target.value)} className="min-w-0 flex-1 rounded-md border border-black/15 px-3" />
                <button onClick={createRoom} className="rounded-md bg-[#161712] px-4 font-bold text-white">방 만들기</button>
              </div>
              <div className="flex gap-2">
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="참가 코드" className="min-w-0 flex-1 rounded-md border border-black/15 px-3" />
                <button onClick={joinRoom} className="rounded-md border border-black/20 px-4 font-bold">참가</button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(room?.members ?? []).map((member) => (
                <div key={member.userId} className="rounded-md border border-black/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-black">@{member.username}</span>
                    <span className="text-xs font-bold text-[#69705d]">{member.role}</span>
                  </div>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-3xl font-black">{member.jds}</span>
                    <span className="text-sm font-bold">{member.level}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-black"><DoorOpen size={20} /> 계정</h2>
            {user ? (
              <p className="rounded-md bg-[#edf0e6] p-3 font-bold">@{user.username} 로그인됨</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setAuthMode("register")} className={`rounded-md p-2 font-bold ${authMode === "register" ? "bg-[#161712] text-white" : "bg-[#edf0e6]"}`}>가입</button>
                  <button onClick={() => setAuthMode("login")} className={`rounded-md p-2 font-bold ${authMode === "login" ? "bg-[#161712] text-white" : "bg-[#edf0e6]"}`}>로그인</button>
                </div>
                {authMode === "register" && <input value={username} onChange={(event) => setUsername(event.target.value)} className="h-11 w-full rounded-md border border-black/15 px-3" placeholder="username" />}
                <input value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 w-full rounded-md border border-black/15 px-3" placeholder="email" />
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="h-11 w-full rounded-md border border-black/15 px-3" placeholder="password" />
                <button onClick={authenticate} className="h-11 w-full rounded-md bg-[#161712] font-bold text-white">계속</button>
                {authError && <p className="text-sm font-bold text-red-600">{authError}</p>}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-xl font-black">설정</h2>
            <label className="flex items-center justify-between border-b border-black/10 py-3 font-bold">
              <span>스냅샷 자동 업로드</span>
              <input type="checkbox" checked={autoUpload} onChange={(event) => setAutoUpload(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between py-3 font-bold">
              <span>경고음</span>
              <input type="checkbox" checked={soundOn} onChange={(event) => setSoundOn(event.target.checked)} />
            </label>
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-black"><Users size={20} /> 공개 피드</h2>
            <div className="space-y-3">
              {feed.length === 0 && <p className="rounded-md bg-[#edf0e6] p-3 text-sm font-semibold">아직 공개 스냅샷이 없습니다.</p>}
              {feed.map((snapshot) => (
                <article key={snapshot.id} className="overflow-hidden rounded-md border border-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={snapshot.imageUrl} alt="JARGEMA snapshot" className="aspect-video w-full object-cover" />
                  <div className="p-3">
                    <div className="flex justify-between text-sm font-black">
                      <span>JDS {snapshot.jdsScore} · @{snapshot.username}</span>
                      <span>{new Date(snapshot.createdAt).toLocaleTimeString("ko-KR")}</span>
                    </div>
                    <p className="mt-1 font-bold">{snapshot.caption}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-[#69705d]">
        <span className="text-sm font-black">{label}</span>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}
