"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Camera, DoorOpen, Eye, Radio, Settings, ShieldCheck, Users, Zap } from "lucide-react";
import { calculateEAR } from "@/lib/drowsiness/ear";
import { clamp } from "@/lib/drowsiness/geometry";
import { calculateJDS, describeJDS } from "@/lib/drowsiness/jds";
import { calculateMAR, YawnTracker } from "@/lib/drowsiness/mar";
import { HeadMotionTracker } from "@/lib/drowsiness/headmotion";
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

type CameraDevice = {
  deviceId: string;
  label: string;
};

type DrawTransform = {
  sourceX: number;
  sourceY: number;
  scale: number;
};

const fallbackMetrics: DrowsinessMetrics = {
  avgEAR: 0,
  baselineEAR: 0,
  eyeClosureRatio: 0,
  mar: 0,
  perclos: 0,
  observedSeconds: 0,
  blinkRate: 0,
  blinkDuration: 0,
  longEyeClosure: false,
  microsleepDuration: 0,
  yawnDetected: false,
  headPitch: 0,
  baselineHeadPitch: 0,
  headDrop: 0,
  headDropVelocity: 0,
  nodDetected: false,
  gradualHeadDrop: false,
  headRoll: 0,
  gazeDown: false,
  consecutiveClosed: 0,
};

const captions = [
  "오늘도 꿈나라행 직행 티켓",
  "공부와 수면의 절묘한 콜라보",
  "교과서가 최고의 수면제",
  "집중력 로그아웃 직전",
  "필기보다 꿈이 먼저 왔다",
  "눈꺼풀이 과제 제출을 거부함",
  "수업 중 절전 모드 진입",
  "잠깐 눈만 감은 게 맞나요",
  "책상 앞 소규모 기절 사건",
  "뇌가 임시 휴업을 선언함",
  "졸음 점수 오늘의 최고 기록",
  "공부는 켜짐, 의식은 꺼짐",
  "고개가 먼저 하교했습니다",
  "눈꺼풀 방화벽에 막힌 집중력",
  "잠과의 조별과제 진행 중",
  "수면 모드 자동 업데이트",
  "지식보다 잠이 빠르게 흡수됨",
  "잠깐의 휴식이 길어지는 중",
  "책상 위 꿈 탐험가 발견",
  "오늘의 졸림 MVP 후보",
  "노트북은 켜졌고 나는 꺼졌다",
  "공부 계획에 낮잠이 침투함",
  "눈꺼풀이 조퇴 신청 완료",
  "집중력 배터리 1퍼센트",
  "수업 화면보다 꿈 화면 선명함",
  "잠깐 충전 중입니다",
  "지금 이 순간 뇌는 백그라운드",
  "깨어있는 척 고급 기술 시전",
  "고개 숙여 잠에게 경례",
  "오늘도 졸음에게 한 표",
];
const FACE_OVERVIEW_POINTS = [1, 10, 33, 61, 133, 152, 263, 291, 362, 468, 473];
const LEFT_EYE_POINTS = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_POINTS = [362, 385, 387, 263, 373, 380];
const MOUTH_POINTS = [61, 185, 40, 39, 291, 375, 321, 405];

export function JargemaApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceMeshLoopRef = useRef<number | null>(null);
  const canvasRatioRef = useRef("16 / 9");
  const drawTransformRef = useRef<DrawTransform>({ sourceX: 0, sourceY: 0, scale: 1 });
  const baselineRef = useRef({ ear: 0, samples: [] as number[] });
  const uploadInFlightRef = useRef(false);
  const lastUploadAtRef = useRef(0);
  const autoUploadRef = useRef(false);
  const soundOnRef = useRef(true);
  const trackersRef = useRef({
    perclos: new PERCLOSTracker(900),
    blink: new BlinkTracker(),
    yawn: new YawnTracker(),
    head: new HeadMotionTracker(),
  });

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("student");
  const [email, setEmail] = useState("student@jargema.local");
  const [password, setPassword] = useState("jargema1234");
  const [authError, setAuthError] = useState("");
  const [cameraStatus, setCameraStatus] = useState("카메라 대기 중");
  const [cameraDiagnostic, setCameraDiagnostic] = useState("");
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [canvasRatio, setCanvasRatio] = useState("16 / 9");
  const [snapshotStatus, setSnapshotStatus] = useState("스냅샷 대기 중");
  const [snapshotCooldownSeconds, setSnapshotCooldownSeconds] = useState(0);
  const [metrics, setMetrics] = useState<DrowsinessMetrics>(fallbackMetrics);
  const [jds, setJds] = useState<JdsResult>(describeJDS(0));
  const [autoUpload, setAutoUpload] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [className, setClassName] = useState("오후 자습반");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<ClassRoom | null>(null);
  const [feed, setFeed] = useState<Snapshot[]>([]);

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
    setCameraDiagnostic("");
    if (!window.isSecureContext) {
      setCameraStatus("카메라는 HTTPS 또는 localhost에서만 허용됩니다.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("이 브라우저는 카메라 API를 지원하지 않습니다.");
      return;
    }
    try {
      const stream = await openCameraStream();
      await attachCameraStream(stream);
      await loadCameraDevices();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "CameraError";
      const message =
        name === "NotAllowedError"
          ? "카메라 권한이 차단되었습니다. 주소창 왼쪽 권한 아이콘에서 허용으로 바꾸세요."
          : name === "NotFoundError"
            ? "브라우저가 카메라를 찾지 못했습니다. 다른 앱에서 카메라를 사용 중인지 확인한 뒤 다시 시도하세요."
            : name === "NotReadableError"
              ? "카메라가 다른 앱에서 사용 중이거나 OS 권한이 꺼져 있습니다."
            : `카메라를 시작하지 못했습니다. (${name})`;
      setCameraStatus(message);
      await runCameraDiagnostics(name);
    }
  }

  async function runCameraDiagnostics(errorName = "ManualCheck") {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setCameraDiagnostic("장치 목록 API를 지원하지 않는 브라우저입니다.");
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      const permission =
        "permissions" in navigator
          ? await navigator.permissions
              .query({ name: "camera" as PermissionName })
              .then((result) => result.state)
              .catch(() => "unknown")
          : "unknown";

      setCameraDevices(
        cameras.map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `카메라 ${index + 1}`,
        })),
      );
      setCameraDiagnostic(`진단: ${cameras.length}개 카메라 감지, 권한 ${permission}, 오류 ${errorName}`);
    } catch {
      setCameraDiagnostic("카메라 진단을 실행하지 못했습니다.");
    }
  }

  async function openCameraStream() {
    const attempts: MediaStreamConstraints[] = selectedCameraId
      ? [
          {
            video: { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          },
          { video: { deviceId: selectedCameraId }, audio: false },
          { video: true, audio: false },
        ]
      : [
          { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          { video: true, audio: false },
        ];

    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async function attachCameraStream(stream: MediaStream) {
    const video = videoRef.current;
    if (!video) return;
    const previous = video.srcObject;
    if (previous instanceof MediaStream) {
      previous.getTracks().forEach((track) => track.stop());
    }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    updateCanvasRatio(16, 9);
    setCameraStatus("감지 실행 중");
    await startFaceMesh(video);
  }

  async function loadCameraDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `카메라 ${index + 1}` }));
    setCameraDevices(cameras);
    if (!selectedCameraId && cameras[0]) setSelectedCameraId(cameras[0].deviceId);
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
      drawLandmarks(landmarks);
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
    canvas.width = 1280;
    canvas.height = 720;
    updateCanvasRatio(canvas.width, canvas.height);
    ctx.fillStyle = "#10120f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const dx = (canvas.width - drawWidth) / 2;
    const dy = (canvas.height - drawHeight) / 2;
    drawTransformRef.current = {
      sourceX: dx,
      sourceY: dy,
      scale,
    };
    ctx.drawImage(video, dx, dy, drawWidth, drawHeight);
  }

  function updateCanvasRatio(width: number, height: number) {
    const nextRatio = `${width} / ${height}`;
    if (canvasRatioRef.current === nextRatio) return;
    canvasRatioRef.current = nextRatio;
    setCanvasRatio(nextRatio);
  }

  function drawLandmarks(landmarks: Landmark[]) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawPointSet(ctx, canvas, landmarks, FACE_OVERVIEW_POINTS, "#00ff88", 3);
    drawPointSet(ctx, canvas, landmarks, LEFT_EYE_POINTS, "#5ee7ff", 4);
    drawPointSet(ctx, canvas, landmarks, RIGHT_EYE_POINTS, "#5ee7ff", 4);
    drawPointSet(ctx, canvas, landmarks, MOUTH_POINTS, "#ffd166", 4);
  }

  function drawPointSet(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, landmarks: Landmark[], points: number[], color: string, radius: number) {
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 2;
    for (const index of points) {
      const landmark = landmarks[index];
      if (!landmark) continue;
      const sourceWidth = videoRef.current?.videoWidth || 640;
      const sourceHeight = videoRef.current?.videoHeight || 480;
      const transform = drawTransformRef.current;
      const x = transform.sourceX + landmark.x * sourceWidth * transform.scale;
      const y = transform.sourceY + landmark.y * sourceHeight * transform.scale;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();
    }
  }

  function processLandmarks(landmarks: Landmark[]) {
    const earLeft = calculateEAR(landmarks, "left");
    const earRight = calculateEAR(landmarks, "right");
    const avgEAR = (earLeft + earRight) / 2;
    const mar = calculateMAR(landmarks);
    const headPose = estimateHeadPose(landmarks);
    const headMotion = trackersRef.current.head.update(headPose.pitch);
    const baselineEAR = updateBaselineEAR(avgEAR);
    const closedThreshold = baselineEAR > 0 ? Math.max(0.12, baselineEAR * 0.72) : 0.2;
    const fullClosedThreshold = baselineEAR > 0 ? Math.max(0.08, baselineEAR * 0.48) : 0.13;
    const eyeClosureRatio =
      baselineEAR > 0 ? clamp((baselineEAR - avgEAR) / Math.max(0.01, baselineEAR - fullClosedThreshold), 0, 1) : avgEAR < 0.2 ? 1 : 0;
    const isClosed = avgEAR < closedThreshold || eyeClosureRatio > 0.62;
    const trackers = trackersRef.current;

    trackers.perclos.update(isClosed);
    trackers.blink.update(isClosed);
    const yawnDetected = trackers.yawn.update(mar);

    const nextMetrics: DrowsinessMetrics = {
      avgEAR,
      baselineEAR,
      eyeClosureRatio,
      mar,
      perclos: trackers.perclos.getPerclos(),
      observedSeconds: trackers.perclos.getObservedSeconds(),
      blinkRate: trackers.blink.getRate(),
      blinkDuration: trackers.blink.getLastDuration(),
      longEyeClosure: trackers.blink.isLongClosure(),
      microsleepDuration: trackers.blink.getMicrosleepDuration(),
      yawnDetected,
      headPitch: headPose.pitch,
      baselineHeadPitch: headMotion.baselinePitch,
      headDrop: headMotion.headDrop,
      headDropVelocity: headMotion.velocity,
      nodDetected: headMotion.nodDetected,
      gradualHeadDrop: headMotion.gradualDrop,
      headRoll: headPose.roll,
      gazeDown: headMotion.headDrop > 8 || headPose.pitch > 14,
      consecutiveClosed: trackers.perclos.getConsecutiveClosed(),
    };
    const nextJds = calculateJDS(nextMetrics);
    setMetrics(nextMetrics);
    setJds(nextJds);
    setCameraStatus("감지 실행 중");
    void publishDetection(nextJds);
    if (soundOnRef.current && nextJds.score >= 40) beep(nextJds.score);
    if (shouldAutoCapture(nextJds.score, nextMetrics)) {
      if (autoUploadRef.current) {
        setSnapshotStatus("자동 촬영 조건 도달. 피드에 추가 중");
        void uploadSnapshot(nextJds.score);
      }
      else setSnapshotStatus("촬영 조건 도달. 자동 촬영이 꺼져 있습니다.");
    }
  }

  function shouldAutoCapture(score: number, nextMetrics: DrowsinessMetrics) {
    if (score >= 80) return true;
    if (score >= 75 && nextMetrics.eyeClosureRatio > 0.7) return true;
    if (score >= 70 && nextMetrics.microsleepDuration > 1800) return true;
    if (score >= 70 && nextMetrics.nodDetected && nextMetrics.eyeClosureRatio > 0.45) return true;
    if (nextMetrics.microsleepDuration > 2800 && nextMetrics.eyeClosureRatio > 0.8) return true;
    return false;
  }

  function updateBaselineEAR(avgEAR: number) {
    if (avgEAR <= 0.12 || avgEAR >= 0.45) return baselineRef.current.ear;

    const baseline = baselineRef.current;
    if (baseline.samples.length < 90) {
      baseline.samples.push(avgEAR);
      baseline.ear = baseline.samples.reduce((sum, value) => sum + value, 0) / baseline.samples.length;
      return baseline.ear;
    }

    if (avgEAR > baseline.ear * 0.86) {
      baseline.ear = baseline.ear * 0.995 + avgEAR * 0.005;
    }
    return baseline.ear;
  }

  function resetCalibration() {
    baselineRef.current = { ear: 0, samples: [] };
    trackersRef.current = {
      perclos: new PERCLOSTracker(900),
      blink: new BlinkTracker(),
      yawn: new YawnTracker(),
      head: new HeadMotionTracker(),
    };
    setMetrics(fallbackMetrics);
    setJds(describeJDS(0));
    setCameraStatus("기준을 다시 측정합니다. 정면을 보고 눈을 떠주세요.");
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
    if (!autoUploadRef.current) {
      setSnapshotStatus("자동 촬영이 꺼져 있습니다.");
      return;
    }
    if (uploadInFlightRef.current) return;
    if (now - lastUploadAtRef.current < 30_000) {
      setSnapshotStatus("스냅샷 쿨타임");
      return;
    }
    const canvas = createCleanSnapshotCanvas(score);
    if (!canvas) {
      setSnapshotStatus("스냅샷 캡처 실패. 카메라 프레임을 기다리는 중");
      return;
    }
    uploadInFlightRef.current = true;
    lastUploadAtRef.current = now;
    setSnapshotCooldownSeconds(30);
    setSnapshotStatus("피드에 스냅샷 추가됨. 서버 업로드 중");
    const imageUrl = canvas.toDataURL("image/jpeg", 0.82);
    const localSnapshot: Snapshot = {
      id: `local_${now}`,
      username: user?.username ?? "guest",
      imageUrl,
      jdsScore: score,
      caption: captions[Math.floor(Math.random() * captions.length)],
      createdAt: new Date().toISOString(),
      reactions: {},
    };
    setFeed((current) => mergeSnapshots([localSnapshot], current));
    if (!user) {
      setSnapshotStatus("로컬 피드에 표시됨. 서버 업로드는 로그인 후 동작합니다.");
      uploadInFlightRef.current = false;
      return;
    }
    try {
      const response = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          jdsScore: score,
          caption: localSnapshot.caption,
          isPublic: true,
          classCode: room?.code,
        }),
      });
      if (!response.ok) {
        setSnapshotStatus("로컬 피드에 표시됨. 서버 업로드는 실패했습니다.");
        return;
      }
      const data = (await response.json()) as { snapshot?: Snapshot };
      if (data.snapshot) {
        setFeed((current) => mergeSnapshots([data.snapshot as Snapshot], current.filter((snapshot) => snapshot.id !== localSnapshot.id)));
      }
      setSnapshotStatus("스냅샷 업로드 완료. 30초 쿨타임");
    } finally {
      uploadInFlightRef.current = false;
    }
  }

  function createCleanSnapshotCanvas(score: number) {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const dx = (canvas.width - drawWidth) / 2;
    const dy = (canvas.height - drawHeight) / 2;

    ctx.fillStyle = "#10120f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, dx, dy, drawWidth, drawHeight);
    ctx.fillStyle = "rgba(255, 0, 0, 0.72)";
    ctx.fillRect(0, canvas.height - 42, canvas.width, 42);
    ctx.fillStyle = "white";
    ctx.font = "bold 16px monospace";
    ctx.fillText(`JARGEMA | JDS: ${score} | ${new Date().toLocaleString("ko-KR")}`, 12, canvas.height - 16);
    return canvas;
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

  const refreshRoom = useCallback(async (code: string) => {
    const response = await fetch(`/api/classes/${code}`);
    const data = await response.json();
    if (response.ok) setRoom(data.classRoom);
  }, []);

  const fetchFeed = useCallback(async () => {
    const response = await fetch("/api/feed");
    const data = await response.json();
    if (response.ok) setFeed((current) => mergeSnapshots(current, data.snapshots));
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchFeed();
    });
    const timer = window.setInterval(() => {
      void fetchFeed();
      if (room?.code) refreshRoom(room.code);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchFeed, refreshRoom, room?.code]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((30_000 - (Date.now() - lastUploadAtRef.current)) / 1000));
      setSnapshotCooldownSeconds(remaining);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    autoUploadRef.current = autoUpload;
  }, [autoUpload]);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

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
              <canvas ref={canvasRef} className="w-full object-cover" style={{ aspectRatio: canvasRatio }} />
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
              {cameraDevices.length > 0 && (
                <select
                  value={selectedCameraId}
                  onChange={(event) => setSelectedCameraId(event.target.value)}
                  className="h-11 rounded-md border border-black/15 bg-white px-3 text-sm font-semibold"
                >
                  {cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              )}
              <button onClick={() => runCameraDiagnostics()} className="h-11 rounded-md border border-black/20 px-3 text-sm font-bold">
                카메라 진단
              </button>
              <button onClick={resetCalibration} className="h-11 rounded-md border border-black/20 px-3 text-sm font-bold">
                기준 재설정
              </button>
              {cameraDiagnostic && <p className="rounded-md bg-[#fff4d6] p-3 text-xs font-bold text-[#6a5200]">{cameraDiagnostic}</p>}
              <p className="rounded-md bg-[#edf0e6] p-3 text-sm font-semibold">{alertText}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="EAR" value={metrics.avgEAR.toFixed(3)} icon={<Eye size={18} />} />
            <Metric label="기준 EAR" value={metrics.baselineEAR ? metrics.baselineEAR.toFixed(3) : "측정 중"} icon={<Eye size={18} />} />
            <Metric label="PERCLOS" value={`${metrics.perclos.toFixed(1)}%`} icon={<Radio size={18} />} />
            <Metric label="눈 감김" value={`${Math.round(metrics.eyeClosureRatio * 100)}%`} icon={<Zap size={18} />} />
            <Metric label="눈 지속" value={`${Math.round(metrics.microsleepDuration)}ms`} icon={<Eye size={18} />} />
            <Metric label="고개 하강" value={`${metrics.headDrop.toFixed(1)}deg`} icon={<Settings size={18} />} />
            <Metric label="고개 속도" value={`${metrics.headDropVelocity.toFixed(1)}deg/s`} icon={<Settings size={18} />} />
            <Metric label="고개 패턴" value={metrics.nodDetected ? "훅 떨어짐" : metrics.gradualHeadDrop ? "점진 하강" : "안정"} icon={<Settings size={18} />} />
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
              <span>스냅샷 자동 촬영</span>
              <input
                type="checkbox"
                checked={autoUpload}
                onChange={(event) => {
                  autoUploadRef.current = event.target.checked;
                  setAutoUpload(event.target.checked);
                  setSnapshotStatus(event.target.checked ? "자동 촬영 켜짐" : "자동 촬영이 꺼져 있습니다.");
                }}
              />
            </label>
            <p className="border-b border-black/10 py-3 text-sm font-bold text-[#69705d]">
              {snapshotCooldownSeconds > 0 ? `${snapshotStatus} · ${snapshotCooldownSeconds}초 남음` : snapshotStatus}
            </p>
            <label className="flex items-center justify-between py-3 font-bold">
              <span>경고음</span>
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(event) => {
                  soundOnRef.current = event.target.checked;
                  setSoundOn(event.target.checked);
                }}
              />
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

function mergeSnapshots(primary: Snapshot[], secondary: Snapshot[]) {
  const seen = new Set<string>();
  return [...primary, ...secondary]
    .filter((snapshot) => {
      if (seen.has(snapshot.id)) return false;
      seen.add(snapshot.id);
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20);
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
