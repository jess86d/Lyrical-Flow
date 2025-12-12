export interface Subtitle {
  id: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
}

export interface CropData {
  x: number; // Horizontal offset from center in canvas pixels
  y: number; // Vertical offset from center in canvas pixels
  scale: number; // Zoom scale multiplier (1 = default cover)
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  sepia: number;
  grayscale: number;
  blur: number;
}

export type TextAnimation = 'none' | 'fade' | 'slide-up' | 'typewriter';

export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  opacity: number;
  animation: TextAnimation;
  animationDuration: number;
}

export interface ImageAsset {
  id: string;
  url: string;
  file: File;
  crop?: CropData;
  adjustments?: ImageAdjustments;
  duration: number;
  textOverlays: TextOverlay[];
}

export interface AudioAsset {
  url: string;
  file: File;
  duration: number;
}

export enum AppState {
  IDLE,
  PROCESSING,
  READY,
  EXPORTING
}

export type TransitionEffect = 'none' | 'fade' | 'slide' | 'zoom';

export type VideoResolution = '720p' | '1080p';

export type VideoFrameRate = 30 | 60;

export type ToastType = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}