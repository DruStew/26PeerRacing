"use client";

import * as jsAruco from "js-aruco2";

const { AR } = jsAruco;

import { TAG_FAMILY } from "@/lib/timing/tags";

/**
 * Client-side marker detection on a live camera stream. Frames are
 * downscaled before detection to keep per-frame cost ~5–15ms, which lets us
 * run on the main thread at a throttled rate without janking the UI.
 */

export type TagDetection = {
  tagId: number;
  /** Marker center in video pixel coordinates (full-resolution space). */
  cx: number;
  cy: number;
  /** Video timestamp of the analyzed frame (performance.now() based). */
  atPerfMs: number;
};

const DETECT_WIDTH = 480;

export class TagDetectorLoop {
  private detector: jsAruco.AR.Detector;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private timer: number | null = null;
  private video: HTMLVideoElement;
  private onDetections: (d: TagDetection[]) => void;
  private intervalMs: number;

  constructor(
    video: HTMLVideoElement,
    onDetections: (d: TagDetection[]) => void,
    opts?: { intervalMs?: number },
  ) {
    this.video = video;
    this.onDetections = onDetections;
    this.intervalMs = opts?.intervalMs ?? 120;
    this.detector = new AR.Detector({ dictionaryName: TAG_FAMILY });
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
  }

  start() {
    if (this.timer !== null) return;
    const tick = () => {
      this.detectOnce();
      this.timer = window.setTimeout(tick, this.intervalMs);
    };
    this.timer = window.setTimeout(tick, this.intervalMs);
  }

  stop() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private detectOnce() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh || this.video.readyState < 2) return;

    const scale = Math.min(1, DETECT_WIDTH / vw);
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const atPerfMs = performance.now();
    this.ctx.drawImage(this.video, 0, 0, w, h);
    let imageData: ImageData;
    try {
      imageData = this.ctx.getImageData(0, 0, w, h);
    } catch {
      return;
    }

    let markers: jsAruco.AR.Marker[] = [];
    try {
      markers = this.detector.detect(imageData);
    } catch {
      return;
    }
    if (markers.length === 0) return;

    const out: TagDetection[] = markers.map((m) => {
      const cx = m.corners.reduce((s, c) => s + c.x, 0) / m.corners.length / scale;
      const cy = m.corners.reduce((s, c) => s + c.y, 0) / m.corners.length / scale;
      return { tagId: m.id, cx, cy, atPerfMs };
    });
    this.onDetections(out);
  }
}

/** Open the rear camera at a resolution good for detection + recording. */
export async function openRearCamera(
  video: HTMLVideoElement,
  opts?: { width?: number; height?: number },
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: opts?.width ?? 1280 },
      height: { ideal: opts?.height ?? 720 },
      frameRate: { ideal: 30 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
