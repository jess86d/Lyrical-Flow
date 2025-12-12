import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './components/Button';
import { UploadIcon, MusicIcon, PlayIcon, PauseIcon, DownloadIcon, SparklesIcon, CropIcon, ResetIcon, UndoIcon, RedoIcon, ChevronLeftIcon, ChevronRightIcon, ScissorsIcon, TrashIcon, LayerIcon, SaveIcon, FolderOpenIcon, MagicWandIcon, YouTubeIcon } from './components/Icons';
import { Timeline } from './components/Timeline';
import { Toast } from './components/Toast';
import { useHistory } from './hooks/useHistory';
import { generateImageCaption, generateLyrics } from './services/geminiService';
import { saveProject, loadProject } from './services/storageService';
import { AudioAsset, ImageAsset, AppState, TransitionEffect, CropData, VideoResolution, VideoFrameRate, ToastMessage, ToastType, TextOverlay, TextAnimation, ImageAdjustments, Subtitle } from './types';

// Constants for Base Logical Resolution (1280x720)
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const BASE_ASPECT = BASE_WIDTH / BASE_HEIGHT;

const RESOLUTIONS = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 }
};

const FONTS = ['Inter', 'Arial', 'Georgia', 'Courier New', 'Impact'];

const FILTER_PRESETS: { name: string; adjustments: ImageAdjustments }[] = [
    { name: 'Normal', adjustments: { brightness: 100, contrast: 100, saturation: 100, sepia: 0, grayscale: 0, blur: 0 } },
    { name: 'Vivid', adjustments: { brightness: 110, contrast: 120, saturation: 130, sepia: 0, grayscale: 0, blur: 0 } },
    { name: 'B&W', adjustments: { brightness: 100, contrast: 110, saturation: 0, sepia: 0, grayscale: 100, blur: 0 } },
    { name: 'Vintage', adjustments: { brightness: 90, contrast: 90, saturation: 60, sepia: 60, grayscale: 0, blur: 0 } },
    { name: 'Cold', adjustments: { brightness: 100, contrast: 100, saturation: 80, sepia: 0, grayscale: 0, blur: 0 } },
    { name: 'Dramatic', adjustments: { brightness: 90, contrast: 140, saturation: 90, sepia: 0, grayscale: 20, blur: 0 } },
];

export default function App() {
  // State
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [activeTab, setActiveTab] = useState<'media' | 'audio' | 'text' | 'lyrics'>('media');
  const [audioAsset, setAudioAsset] = useState<AudioAsset | null>(null);
  const [bgAudioAsset, setBgAudioAsset] = useState<AudioAsset | null>(null);
  const [mainAudioVolume, setMainAudioVolume] = useState<number>(1.0);
  const [bgMusicVolume, setBgMusicVolume] = useState<number>(0.2);
  const [lyrics, setLyrics] = useState<Subtitle[]>([]);
  const [isSyncingLyrics, setIsSyncingLyrics] = useState(false);
  
  const { state: images, setState: setImages, undo, redo, canUndo, canRedo } = useHistory<ImageAsset[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  
  const [transitionEffect, setTransitionEffect] = useState<TransitionEffect>('none');
  const [transitionDuration, setTransitionDuration] = useState<number>(1.0);
  const [resolution, setResolution] = useState<VideoResolution>('720p');
  const [frameRate, setFrameRate] = useState<VideoFrameRate>(30);

  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [tempCrop, setTempCrop] = useState<CropData>({ x: 0, y: 0, scale: 1 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [isSnappedX, setIsSnappedX] = useState(false);
  const [isSnappedY, setIsSnappedY] = useState(false);
  
  // Text Dragging State
  const [isDraggingText, setIsDraggingText] = useState(false);
  const dragStartRef = useRef<{x: number, y: number}>({ x: 0, y: 0 });

  const audioRef = useRef<HTMLAudioElement>(null);
  const bgAudioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const imageElementsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const mainGainNodeRef = useRef<GainNode | null>(null);
  const bgSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bgGainNodeRef = useRef<GainNode | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const speakersGainNodeRef = useRef<GainNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  const totalImageDuration = images.reduce((acc, img) => acc + img.duration, 0);
  const totalDuration = Math.max(audioAsset?.duration || 0, totalImageDuration || 10);
  const selectedImage = images.find(img => img.id === selectedImageId);
  const selectedTextOverlay = selectedImage?.textOverlays.find(t => t.id === selectedTextId);

  // Find currently active image based on time for text editing
  const getActiveImageIndex = () => {
      if (images.length === 0) return -1;
      let accumulatedTime = 0;
      for (let i = 0; i < images.length; i++) {
          if (currentTime >= accumulatedTime && currentTime < accumulatedTime + images[i].duration) {
              return i;
          }
          accumulatedTime += images[i].duration;
      }
      return images.length - 1; // Default to last if at end
  };
  
  const activeIndex = getActiveImageIndex();
  const activeImage = activeIndex !== -1 ? images[activeIndex] : null;

  // --- Utils ---
  const addToast = (message: string, type: ToastType = 'info') => {
      const id = Math.random().toString(36).substr(2, 9);
      setToasts(prev => [...prev, { id, message, type }]);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const jumpToImage = (imageId: string) => {
      setSelectedImageId(imageId);
      let startTime = 0;
      for (const img of images) {
          if (img.id === imageId) break;
          startTime += img.duration;
      }
      // Seek to 0.1s into the image to ensure it's active
      const seekTime = startTime + 0.1;
      setCurrentTime(seekTime);
      if (audioRef.current) audioRef.current.currentTime = seekTime;
      if (bgAudioRef.current) bgAudioRef.current.currentTime = seekTime;
  };

  // --- Handlers ---
  const initAudioContext = () => {
    let ctx = audioContextRef.current;
    if (!ctx) {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256; 
        analyserRef.current = analyser;

        const dest = ctx.createMediaStreamDestination();
        destNodeRef.current = dest;

        const speakersGain = ctx.createGain();
        speakersGain.gain.value = 1;
        speakersGain.connect(ctx.destination);
        speakersGainNodeRef.current = speakersGain;
        
        // Connect Analyser to Speakers
        analyser.connect(speakersGain);
        
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }

    // Main Audio Source Setup
    if (audioRef.current && !sourceRef.current) {
        const source = ctx.createMediaElementSource(audioRef.current);
        sourceRef.current = source;
        
        const mainGain = ctx.createGain();
        mainGain.gain.value = mainAudioVolume;
        mainGainNodeRef.current = mainGain;

        source.connect(mainGain);
        if (analyserRef.current) mainGain.connect(analyserRef.current);
        if (destNodeRef.current) mainGain.connect(destNodeRef.current);
    }

    // BG Audio Source Setup
    if (bgAudioRef.current && !bgSourceRef.current) {
        const bgSource = ctx.createMediaElementSource(bgAudioRef.current);
        bgSourceRef.current = bgSource;
        
        const bgGain = ctx.createGain();
        bgGain.gain.value = bgMusicVolume;
        bgGainNodeRef.current = bgGain;
        
        bgSource.connect(bgGain);
        if (destNodeRef.current) bgGain.connect(destNodeRef.current);
        if (speakersGainNodeRef.current) bgGain.connect(speakersGainNodeRef.current);
    }
  };

  // Initialize audio context when assets change
  useEffect(() => {
    if (audioAsset || bgAudioAsset) {
        initAudioContext();
    }
  }, [audioAsset, bgAudioAsset]);

  // Volume Effect Hooks
  useEffect(() => { if (bgGainNodeRef.current) bgGainNodeRef.current.gain.value = bgMusicVolume; }, [bgMusicVolume]);
  useEffect(() => { if (mainGainNodeRef.current) mainGainNodeRef.current.gain.value = mainAudioVolume; }, [mainAudioVolume]);

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (audioRef.current) { audioRef.current.src = url; audioRef.current.load(); }
    const tempAudio = new Audio(url);
    tempAudio.onloadedmetadata = () => { setAudioAsset({ url, file, duration: tempAudio.duration }); setCurrentTime(0); setIsPlaying(false); addToast(`Loaded: ${file.name}`, 'success'); };
  };

  const handleBgAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      if (bgAudioRef.current) { bgAudioRef.current.src = url; bgAudioRef.current.load(); }
      const tempAudio = new Audio(url);
      tempAudio.onloadedmetadata = () => { setBgAudioAsset({ url, file, duration: tempAudio.duration }); addToast(`Background: ${file.name}`, 'success'); };
  };
  
  const removeBgAudio = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setBgAudioAsset(null);
      if (bgAudioRef.current) {
          bgAudioRef.current.src = "";
          bgAudioRef.current.load();
      }
      addToast("Background music removed", 'info');
  };

  const processFiles = (files: File[]) => {
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        let nextDuration = 5; 
        if (audioAsset && (images.length + imageFiles.length) > 0) nextDuration = audioAsset.duration / (images.length + imageFiles.length);
        const newImages: ImageAsset[] = imageFiles.map(file => ({ 
            id: Math.random().toString(36).substr(2, 9), 
            url: URL.createObjectURL(file), 
            file, 
            crop: { x: 0, y: 0, scale: 1 }, 
            adjustments: { brightness: 100, contrast: 100, saturation: 100, sepia: 0, grayscale: 0, blur: 0 },
            duration: nextDuration, 
            textOverlays: [] 
        }));
        setImages(prev => [...prev, ...newImages]);
        newImages.forEach(img => { const i = new Image(); i.src = img.url; imageElementsRef.current.set(img.id, i); });
        addToast(`Added ${imageFiles.length} images`, 'success');
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(e.target.files || []) as File[]; if (files.length > 0) processFiles(files); };
  const handleGlobalDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDraggingFile(false); if (draggedImageIndex !== null) return; const files = Array.from(e.dataTransfer.files) as File[]; if (files.length > 0) processFiles(files); };

  const updateSelectedImage = (updates: Partial<ImageAsset>) => { if(!selectedImageId) return; setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, ...updates } : img)); };
  
  const updateSelectedImageCrop = (updates: Partial<CropData>) => {
      if (!selectedImageId) return;
      setImages(prev => prev.map(img => {
          if (img.id !== selectedImageId) return img;
          const currentCrop = img.crop || { x: 0, y: 0, scale: 1 };
          return { ...img, crop: { ...currentCrop, ...updates } };
      }));
  };

  const updateSelectedImageAdjustments = (updates: Partial<ImageAdjustments>) => {
      if (!selectedImageId) return;
      setImages(prev => prev.map(img => {
          if (img.id !== selectedImageId) return img;
          const currentAdj = img.adjustments || { brightness: 100, contrast: 100, saturation: 100, sepia: 0, grayscale: 0, blur: 0 };
          return { ...img, adjustments: { ...currentAdj, ...updates } };
      }));
  };

  const applyPreset = (preset: ImageAdjustments) => {
      updateSelectedImageAdjustments(preset);
  };

  const addTextToSelected = () => { if(!selectedImageId) return; const newOverlay: TextOverlay = { id: Math.random().toString(36).substr(2, 9), text: "New Text", x: 0.5, y: 0.5, fontSize: 40, fontFamily: 'Inter', color: '#ffffff', opacity: 1, animation: 'none', animationDuration: 1.5 }; updateSelectedImage({ textOverlays: [...(selectedImage?.textOverlays || []), newOverlay] }); setSelectedTextId(newOverlay.id); };
  
  const handleGenerateCaption = async () => {
      if (!selectedImage) return;
      setIsGeneratingCaption(true); addToast("Analyzing image...", 'info');
      try {
          const caption = await generateImageCaption(selectedImage.file, audioAsset?.file.name);
          const newOverlay: TextOverlay = { id: Math.random().toString(36).substr(2, 9), text: caption, x: 0.5, y: 0.85, fontSize: 32, fontFamily: 'Inter', color: '#ffffff', opacity: 1, animation: 'fade', animationDuration: 2.0 };
          updateSelectedImage({ textOverlays: [...selectedImage.textOverlays, newOverlay] });
          addToast("Caption generated!", 'success');
      } catch (e) { console.error(e); addToast("Failed to generate caption.", 'error'); } finally { setIsGeneratingCaption(false); }
  };
  
  const handleSyncLyrics = async () => {
    if (!audioAsset) {
        addToast("Please upload audio first.", 'error');
        return;
    }
    setIsSyncingLyrics(true);
    addToast("Transcribing audio...", 'info');
    try {
        const generatedLyrics = await generateLyrics(audioAsset.file);
        const subtitlesWithIds = generatedLyrics.map(l => ({ ...l, id: Math.random().toString(36).substr(2, 9) }));
        setLyrics(subtitlesWithIds);
        addToast("Lyrics synced!", 'success');
    } catch (e) {
        console.error(e);
        addToast("Failed to sync lyrics.", 'error');
    } finally {
        setIsSyncingLyrics(false);
    }
  };
  
  const moveSelectedImageOrder = (direction: 'forward' | 'backward') => {
      if (!selectedImageId) return;
      const index = images.findIndex(img => img.id === selectedImageId);
      if (index === -1) return;

      if (direction === 'backward' && index > 0) {
          const newImages = [...images];
          [newImages[index], newImages[index - 1]] = [newImages[index - 1], newImages[index]];
          setImages(newImages);
      } else if (direction === 'forward' && index < images.length - 1) {
          const newImages = [...images];
          [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
          setImages(newImages);
      }
  };

  const openCropModal = (image: ImageAsset) => { setEditingImageId(image.id); setTempCrop(image.crop || { x: 0, y: 0, scale: 1 }); };
  const closeCropModal = () => { setEditingImageId(null); setIsSnappedX(false); setIsSnappedY(false); };
  const saveCrop = () => { if (!editingImageId) return; setImages(prev => prev.map(img => img.id === editingImageId ? { ...img, crop: tempCrop } : img)); closeCropModal(); };
  const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => { setIsDraggingCrop(true); dragStartRef.current = { x: e.clientX, y: e.clientY }; };
  const handleCropMouseMove = (e: React.MouseEvent<HTMLDivElement>) => { if (!isDraggingCrop) return; const dx = e.clientX - dragStartRef.current.x; const dy = e.clientY - dragStartRef.current.y; dragStartRef.current = { x: e.clientX, y: e.clientY }; const scaleFactor = 1280 / 640; setTempCrop(prev => { let newX = prev.x + (dx * scaleFactor); let newY = prev.y + (dy * scaleFactor); if (Math.abs(newX) < 30) newX = 0; if (Math.abs(newY) < 30) newY = 0; return { ...prev, x: newX, y: newY }; }); };
  const handleCropMouseUp = () => setIsDraggingCrop(false);

  const handleTextMouseDown = (e: React.MouseEvent, overlayId: string, imageId: string) => {
      e.stopPropagation();
      if (imageId !== selectedImageId) jumpToImage(imageId);
      setSelectedTextId(overlayId);
      setIsDraggingText(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleTextMouseMove = useCallback((e: MouseEvent) => {
      if (!isDraggingText || !selectedImageId || !selectedTextId || !canvasContainerRef.current) return;
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const dXPercent = dx / rect.width;
      const dYPercent = dy / rect.height;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      setImages(prev => prev.map(img => {
          if (img.id !== selectedImageId) return img;
          return { ...img, textOverlays: img.textOverlays.map(ov => ov.id !== selectedTextId ? ov : { ...ov, x: ov.x + dXPercent, y: ov.y + dYPercent }) };
      }));
  }, [isDraggingText, selectedImageId, selectedTextId, setImages]);

  const handleTextMouseUp = useCallback(() => setIsDraggingText(false), []);
  useEffect(() => { if (isDraggingText) { window.addEventListener('mousemove', handleTextMouseMove); window.addEventListener('mouseup', handleTextMouseUp); } return () => { window.removeEventListener('mousemove', handleTextMouseMove); window.removeEventListener('mouseup', handleTextMouseUp); }; }, [isDraggingText, handleTextMouseMove, handleTextMouseUp]);

  const togglePlay = () => { if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume(); if (isPlaying) { audioRef.current?.pause(); bgAudioRef.current?.pause(); } else { if (audioAsset) audioRef.current?.play(); if (bgAudioRef.current) { bgAudioRef.current.currentTime = audioRef.current?.currentTime || 0; bgAudioRef.current.play(); } } setIsPlaying(!isPlaying); };
  const handleSeek = (time: number) => { if (audioRef.current) audioRef.current.currentTime = time; if (bgAudioRef.current) bgAudioRef.current.currentTime = time; setCurrentTime(time); };
  
  const handleTimelineReorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const updatedImages = [...images];
    const [movedItem] = updatedImages.splice(fromIndex, 1);
    updatedImages.splice(toIndex, 0, movedItem);
    setImages(updatedImages);
  };

  const handleExport = useCallback(() => {
    if (!canvasRef.current || (images.length === 0 && !audioAsset)) return;
    setAppState(AppState.EXPORTING); setIsPlaying(false); audioRef.current?.pause(); bgAudioRef.current?.pause();
    if (speakersGainNodeRef.current) speakersGainNodeRef.current.gain.value = 0;

    try {
        const stream = canvasRef.current.captureStream(frameRate); 
        let combinedStream;
        if (destNodeRef.current) combinedStream = new MediaStream([...stream.getVideoTracks(), ...destNodeRef.current.stream.getAudioTracks()]);
        else { const audioStream = (audioRef.current as any).captureStream ? (audioRef.current as any).captureStream() : null; combinedStream = new MediaStream([...stream.getVideoTracks(), ...(audioStream ? audioStream.getAudioTracks() : [])]); }
        let bitrate = resolution === '1080p' ? (frameRate === 60 ? 8000000 : 5000000) : (frameRate === 60 ? 3500000 : 2500000);
        const options: MediaRecorderOptions = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: bitrate };
        if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) { options.mimeType = 'video/webm'; delete options.videoBitsPerSecond; }
        const recorder = new MediaRecorder(combinedStream, options);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => { const blob = new Blob(chunks, { type: 'video/webm' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `lyricalflow.webm`; a.click(); setAppState(AppState.READY); addToast("Exported!", 'success'); if (speakersGainNodeRef.current) speakersGainNodeRef.current.gain.value = 1; };
        setCurrentTime(0);
        if (audioAsset && audioRef.current) { audioRef.current.currentTime = 0; if(bgAudioRef.current) bgAudioRef.current.currentTime = 0; recorder.start(); audioRef.current.play(); if(bgAudioRef.current) bgAudioRef.current.play(); setIsPlaying(true); audioRef.current.onended = () => { recorder.stop(); audioRef.current!.onended = null; if(bgAudioRef.current) bgAudioRef.current.pause(); setIsPlaying(false); }; } 
        else { recorder.start(); setIsPlaying(true); setTimeout(() => { recorder.stop(); setIsPlaying(false); }, totalDuration * 1000); }
    } catch { addToast("Export failed.", 'error'); setAppState(AppState.READY); if (speakersGainNodeRef.current) speakersGainNodeRef.current.gain.value = 1; }
  }, [audioAsset, frameRate, resolution, totalDuration, images]);

  const handleSave = async () => { try { await saveProject(images, audioAsset, bgAudioAsset, bgMusicVolume, lyrics, { resolution, frameRate, transitionEffect, transitionDuration, mainAudioVolume }); addToast("Saved!", 'success'); } catch { addToast("Save failed.", 'error'); } };
  const handleLoad = async () => { try { const p = await loadProject(); if (!p) { addToast("No save.", 'info'); return; } setImages(p.images); setLyrics(p.subtitles || []); setBgMusicVolume(p.bgMusicVolume); setResolution(p.settings.resolution); setFrameRate(p.settings.frameRate); setTransitionEffect(p.settings.transitionEffect); setTransitionDuration(p.settings.transitionDuration); if (p.settings.mainAudioVolume !== undefined) setMainAudioVolume(p.settings.mainAudioVolume); p.images.forEach(img => { const i = new Image(); i.src = img.url; imageElementsRef.current.set(img.id, i); }); if (p.audioAsset) { setAudioAsset(p.audioAsset); if(audioRef.current) { audioRef.current.src = p.audioAsset.url; audioRef.current.load(); } } if (p.bgAudioAsset) { setBgAudioAsset(p.bgAudioAsset); if(bgAudioRef.current) { bgAudioRef.current.src = p.bgAudioAsset.url; bgAudioRef.current.load(); } } setTimeout(() => initAudioContext(), 500); addToast("Loaded!", 'success'); } catch { addToast("Load failed.", 'error'); } };

  // Drag Drop Internal
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => { setDraggedImageIndex(index); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => { e.preventDefault(); if (draggedImageIndex === null || draggedImageIndex === dropIndex) return; const updatedImages = [...images]; const [draggedItem] = updatedImages.splice(draggedImageIndex, 1); updatedImages.splice(dropIndex, 0, draggedItem); setImages(updatedImages); setDraggedImageIndex(null); };

  // --- Render Loop ---
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext('2d'); if (!canvas || !ctx) return;
    const width = canvas.width; const height = canvas.height; const scaleRatio = width / BASE_WIDTH;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
    if (images.length === 0 && !audioAsset) { ctx.fillStyle = '#1e1e24'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#4b5563'; ctx.font = `${30 * scaleRatio}px Inter`; ctx.textAlign = 'center'; ctx.fillText("LyricalFlow Studio", width / 2, height / 2); return; }
    if (images.length > 0) {
        let activeIndex = -1; let accumulatedTime = 0; let activeImageStartTime = 0;
        for (let i = 0; i < images.length; i++) { const dur = images[i].duration; if (currentTime >= accumulatedTime && currentTime < accumulatedTime + dur) { activeIndex = i; activeImageStartTime = accumulatedTime; break; } accumulatedTime += dur; }
        if (activeIndex !== -1) {
            const imgObj = images[activeIndex];
            const renderLayer = (idx: number, opacity: number) => {
                const img = images[idx]; const el = imageElementsRef.current.get(img.id); const c = img.crop || { x: 0, y: 0, scale: 1 };
                const adj = img.adjustments || { brightness: 100, contrast: 100, saturation: 100, sepia: 0, grayscale: 0, blur: 0 };
                if (el && el.complete) {
                    const ia = el.width / el.height; const ca = width / height; let rw, rh; 
                    if (ia > ca) { rh = height; rw = height * ia; } else { rw = width; rh = width / ia; }
                    let verticalBias = 0; if (rh > height) { verticalBias = (rh - height) * 0.25; }
                    let lst = 0; for(let k=0; k<idx; k++) lst += images[k].duration; const kb = Math.max(0, currentTime - lst) / img.duration; const z = 1 + (kb * 0.1); const fs = c.scale * z;
                    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, opacity)); 
                    ctx.filter = `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%) sepia(${adj.sepia || 0}%) grayscale(${adj.grayscale || 0}%) blur(${adj.blur || 0}px)`;
                    ctx.translate(width / 2, height / 2); 
                    ctx.save(); let bgScale = Math.max(width / el.width, height / el.height) * 1.2; ctx.scale(bgScale, bgScale); ctx.filter += ' blur(20px) brightness(0.5)'; ctx.drawImage(el, -el.width/2, -el.height/2); ctx.restore();
                    ctx.translate(c.x * scaleRatio, (c.y * scaleRatio) + verticalBias); ctx.scale(fs, fs); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 20; ctx.drawImage(el, -rw / 2, -rh / 2, rw, rh); ctx.restore();
                }
            };
            const tl = imgObj.duration - (currentTime - activeImageStartTime);
            const it = transitionEffect !== 'none' && tl <= (Math.min(transitionDuration, imgObj.duration/2)) && activeIndex < images.length - 1;
            if (it) { const p = 1 - (tl / Math.min(transitionDuration, imgObj.duration/2)); renderLayer(activeIndex, 1); renderLayer(activeIndex + 1, p); } else { renderLayer(activeIndex, 1); }
            
            if (imgObj.textOverlays) imgObj.textOverlays.forEach(ov => { 
                const relativeTime = currentTime - activeImageStartTime;
                const animDuration = ov.animationDuration || 1.5;
                const progress = Math.min(Math.max(relativeTime / animDuration, 0), 1);
                
                let renderOpacity = ov.opacity;
                let renderY = ov.y * height;
                let renderText = ov.text;

                if (ov.animation === 'fade') {
                    renderOpacity = ov.opacity * progress;
                } else if (ov.animation === 'slide-up') {
                    const offset = 40 * scaleRatio;
                    // Ease out cubic
                    const ease = 1 - Math.pow(1 - progress, 3);
                    renderY = (ov.y * height) + offset - (offset * ease);
                    renderOpacity = ov.opacity * progress;
                } else if (ov.animation === 'typewriter') {
                    const charCount = Math.floor(ov.text.length * progress);
                    renderText = ov.text.substring(0, charCount);
                }

                ctx.save(); 
                ctx.globalAlpha = renderOpacity; 
                ctx.fillStyle = ov.color; 
                ctx.font = `bold ${ov.fontSize * scaleRatio}px ${ov.fontFamily}`; 
                ctx.textAlign = 'center'; 
                ctx.textBaseline = 'middle'; 
                ctx.shadowColor = 'rgba(0,0,0,0.8)'; 
                ctx.shadowBlur = 4; 
                ctx.fillText(renderText, ov.x * width, renderY); 
                ctx.restore(); 
            });
        }
    }
    
    // Render Lyrics Subtitles
    if (lyrics.length > 0) {
        const currentLyric = lyrics.find(l => currentTime >= l.startTime && currentTime <= l.endTime);
        if (currentLyric) {
             ctx.save();
             ctx.font = `bold ${42 * scaleRatio}px Inter`;
             ctx.textAlign = 'center';
             ctx.textBaseline = 'bottom';
             ctx.fillStyle = 'white';
             ctx.shadowColor = 'rgba(0,0,0,0.8)';
             ctx.shadowBlur = 4;
             ctx.strokeStyle = 'black';
             ctx.lineWidth = 4 * scaleRatio;
             ctx.strokeText(currentLyric.text, width / 2, height - (50 * scaleRatio));
             ctx.fillText(currentLyric.text, width / 2, height - (50 * scaleRatio));
             ctx.restore();
        }
    }
  }, [audioAsset, images, currentTime, transitionEffect, resolution, lyrics]);

  useEffect(() => { let last = performance.now(); const loop = (t: number) => { const dt = (t - last)/1000; last = t; if (isPlaying) { if (audioAsset && audioRef.current) { if (!audioRef.current.paused) setCurrentTime(audioRef.current.currentTime); } else { setCurrentTime(p => { const n = p + dt; return n >= totalDuration ? (setIsPlaying(false), 0) : n; }); } } drawCanvas(); animationFrameRef.current = requestAnimationFrame(loop); }; animationFrameRef.current = requestAnimationFrame(loop); return () => { if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); }; }, [drawCanvas, isPlaying, audioAsset, totalDuration]);
  
  useEffect(() => { if (isDraggingCrop) { setIsSnappedX(tempCrop.x === 0); setIsSnappedY(tempCrop.y === 0); } else { setIsSnappedX(false); setIsSnappedY(false); } }, [tempCrop, isDraggingCrop]);

  return (
    <div className={`h-screen flex flex-col bg-[#0f0f12] text-gray-200 overflow-hidden font-inter ${isDraggingFile ? 'opacity-90' : ''}`} onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }} onDragLeave={() => setIsDraggingFile(false)} onDrop={handleGlobalDrop}>
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">{toasts.map(toast => (<div key={toast.id} className="pointer-events-auto"><Toast toast={toast} onDismiss={removeToast} /></div>))}</div>
      {isDraggingFile && <div className="fixed inset-0 z-50 border-4 border-indigo-500 border-dashed bg-indigo-500/10 flex items-center justify-center pointer-events-none"><div className="text-2xl font-bold text-white drop-shadow-md">Drop files</div></div>}
      
      {/* 1. Header */}
      <header className="h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-[#18181b] z-10">
        <div className="flex items-center gap-3"><div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-1.5 rounded"><MusicIcon /></div><span className="font-bold text-lg tracking-tight">LyricalFlow</span>
          <div className="ml-6 flex gap-1 bg-gray-800/50 rounded-lg p-0.5"><button onClick={undo} disabled={!canUndo} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white disabled:opacity-30"><UndoIcon /></button><button onClick={redo} disabled={!canRedo} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white disabled:opacity-30"><RedoIcon /></button></div>
          <div className="ml-2 flex gap-1 bg-gray-800/50 rounded-lg p-0.5"><button onClick={handleSave} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Save"><SaveIcon /></button><button onClick={handleLoad} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white" title="Load"><FolderOpenIcon /></button></div>
        </div>
        <div className="flex gap-3">
            <div className="flex items-center gap-2 bg-gray-800/50 px-3 py-1.5 rounded text-xs text-gray-400 border border-gray-700/50"><span>{resolution}</span><span className="w-px h-3 bg-gray-600"></span><span>{frameRate}fps</span></div>
            <a href="https://studio.youtube.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"><YouTubeIcon /> Upload</a>
            <Button variant="primary" className="text-xs px-4 h-8" icon={<DownloadIcon />} onClick={handleExport} disabled={appState===AppState.EXPORTING}>Export</Button>
        </div>
      </header>

      {/* 2. Workspace */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 border-r border-gray-800 flex flex-col bg-[#131316] z-10">
            <div className="flex border-b border-gray-800">
                <button className={`flex-1 py-2 text-xs font-medium ${activeTab === 'media' ? 'text-white bg-gray-800 border-b-2 border-indigo-500' : 'text-gray-500'}`} onClick={() => setActiveTab('media')}>Media</button>
                <button className={`flex-1 py-2 text-xs font-medium ${activeTab === 'audio' ? 'text-white bg-gray-800 border-b-2 border-indigo-500' : 'text-gray-500'}`} onClick={() => setActiveTab('audio')}>Audio</button>
                <button className={`flex-1 py-2 text-xs font-medium ${activeTab === 'text' ? 'text-white bg-gray-800 border-b-2 border-indigo-500' : 'text-gray-500'}`} onClick={() => setActiveTab('text')}>Text</button>
                <button className={`flex-1 py-2 text-xs font-medium ${activeTab === 'lyrics' ? 'text-white bg-gray-800 border-b-2 border-indigo-500' : 'text-gray-500'}`} onClick={() => setActiveTab('lyrics')}>Lyrics</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
                {activeTab === 'media' && <div className="space-y-4"><label className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-700 border-dashed rounded-lg cursor-pointer bg-gray-800/20 hover:bg-gray-800/40 transition-colors"><div className="flex flex-col items-center justify-center"><UploadIcon /><span className="mt-2 text-xs text-gray-500">Import Media</span></div><input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} /></label><div className="grid grid-cols-2 gap-2">{images.map((img) => (<div key={img.id} onClick={() => setSelectedImageId(img.id)} className={`aspect-square relative group rounded overflow-hidden bg-gray-800 cursor-pointer border-2 ${selectedImageId === img.id ? 'border-indigo-500' : 'border-transparent'}`}><img src={img.url} className="w-full h-full object-cover" /></div>))}</div></div>}
                {activeTab === 'audio' && (
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <div className="space-y-2"><label className="text-xs font-bold text-gray-400">Main</label><label className="flex items-center justify-between w-full p-2 bg-gray-800 rounded cursor-pointer border border-gray-700"><div className="flex items-center gap-2 overflow-hidden"><MusicIcon /><span className="text-xs truncate">{audioAsset ? audioAsset.file.name : "Import Song"}</span></div><input type="file" className="hidden" accept="audio/*" onChange={handleAudioUpload} /></label></div>
                            <div className="space-y-2"><label className="text-xs font-bold text-gray-400">BG Music</label><label className="flex items-center justify-between w-full p-2 bg-gray-800 rounded cursor-pointer border border-gray-700"><div className="flex items-center gap-2 overflow-hidden"><MusicIcon /><span className="text-xs truncate">{bgAudioAsset ? bgAudioAsset.file.name : "Import BGM"}</span></div><input type="file" className="hidden" accept="audio/*" onChange={handleBgAudioUpload} /></label>{bgAudioAsset && <div className="px-1 text-right"><span className="cursor-pointer text-xs text-red-400" onClick={removeBgAudio}>Remove</span></div>}</div>
                        </div>
                        {(audioAsset || bgAudioAsset) && (
                            <div className="space-y-3 pt-4 border-t border-gray-800">
                                <h3 className="text-xs font-semibold text-gray-300">Mixer</h3>
                                {audioAsset && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-gray-500"><span>Main Audio</span><span>{Math.round(mainAudioVolume * 100)}%</span></div>
                                        <input type="range" min="0" max="1" step="0.05" value={mainAudioVolume} onChange={(e) => setMainAudioVolume(Number(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer" />
                                    </div>
                                )}
                                {bgAudioAsset && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-gray-500"><span>Background</span><span>{Math.round(bgMusicVolume * 100)}%</span></div>
                                        <input type="range" min="0" max="1" step="0.05" value={bgMusicVolume} onChange={(e) => setBgMusicVolume(Number(e.target.value))} className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer" />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'text' && <div className="space-y-2"><p className="text-xs text-gray-500">Select image to add text.</p><Button disabled={!selectedImageId} onClick={addTextToSelected} className="w-full text-xs" variant="primary">+ Text Overlay</Button></div>}
                {activeTab === 'lyrics' && (
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-xs font-semibold text-gray-300 mb-2">Transcription Panel</h3>
                            <Button 
                                onClick={handleSyncLyrics} 
                                disabled={isSyncingLyrics || !audioAsset} 
                                className="w-full text-xs py-2" 
                                variant="primary" 
                                icon={<SparklesIcon />}
                            >
                                {isSyncingLyrics ? 'Transcribing...' : 'Sync Lyrics'}
                            </Button>
                            {!audioAsset && <p className="text-[10px] text-red-400 mt-1">Upload main audio first.</p>}
                        </div>
                        <div className="border-t border-gray-800 pt-3">
                            <h4 className="text-xs font-semibold text-gray-400 mb-2">Subtitles ({lyrics.length})</h4>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                {lyrics.length > 0 ? lyrics.map((lyric, idx) => (
                                    <div key={lyric.id} className="bg-gray-800/50 p-2 rounded border border-gray-700 text-xs">
                                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                            <span>{Math.floor(lyric.startTime / 60)}:{(lyric.startTime % 60).toFixed(1).padStart(4, '0')}</span>
                                            <span>-</span>
                                            <span>{Math.floor(lyric.endTime / 60)}:{(lyric.endTime % 60).toFixed(1).padStart(4, '0')}</span>
                                        </div>
                                        <p className="text-gray-300">{lyric.text}</p>
                                    </div>
                                )) : (
                                    <div className="text-center py-4 text-gray-500 text-[10px]">
                                        No lyrics yet. Click "Sync Lyrics" to generate from audio.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </aside>

        <main className="flex-1 bg-[#0a0a0c] flex flex-col relative min-w-0">
            <div className="flex-1 flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800/20 via-[#0a0a0c] to-[#0a0a0c]">
                <div ref={canvasContainerRef} className="relative shadow-2xl shadow-black/50 rounded-lg overflow-hidden border border-gray-800 group" style={{ aspectRatio: `${BASE_ASPECT}`, height: '70%', maxHeight: '600px' }}>
                    <canvas ref={canvasRef} width={RESOLUTIONS[resolution].width} height={RESOLUTIONS[resolution].height} className="w-full h-full bg-black" />
                    {activeImage && activeImage.textOverlays.map(ov => (<div key={ov.id} className={`absolute border-2 cursor-move flex items-center justify-center whitespace-nowrap transition-colors select-none ${selectedTextId === ov.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-transparent hover:border-white/50'}`} style={{ left: `${ov.x * 100}%`, top: `${ov.y * 100}%`, transform: 'translate(-50%, -50%)', fontSize: `${(ov.fontSize / BASE_WIDTH) * 100 * (canvasContainerRef.current?.getBoundingClientRect().width || 0) / (canvasContainerRef.current?.getBoundingClientRect().width || 1)}px`, fontFamily: ov.fontFamily, color: 'transparent', padding: '4px', minWidth: '50px', minHeight: '20px' }} onMouseDown={(e) => handleTextMouseDown(e, ov.id, activeImage.id)}><span style={{ fontSize: `${ov.fontSize}px`, opacity: 0 }}>{ov.text}</span>{selectedTextId === ov.id && (<div className="absolute -top-4 left-0 bg-indigo-600 text-white text-[9px] px-1 rounded">Drag</div>)}</div>))}
                    {appState === AppState.EXPORTING && <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30 backdrop-blur-sm"><div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div><h3 className="text-xl font-bold text-white">Rendering Video...</h3><p className="text-gray-400 mt-2 text-sm">Recording canvas playback. Do not close tab.</p><p className="text-gray-500 text-xs mt-1">Resolution: {resolution} • FPS: {frameRate}</p></div>}
                </div>
            </div>
            <div className="h-12 bg-[#131316] border-t border-gray-800 flex items-center justify-center gap-6"><button className="text-gray-400 hover:text-white"><ChevronLeftIcon /></button><button onClick={togglePlay} className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white hover:bg-indigo-500 transition-all">{isPlaying ? <PauseIcon /> : <PlayIcon />}</button><button className="text-gray-400 hover:text-white"><ChevronRightIcon /></button><span className="absolute right-4 text-xs font-mono text-gray-500">{Math.floor(currentTime/60)}:{Math.floor(currentTime%60).toString().padStart(2,'0')} / {Math.floor(totalDuration/60)}:{Math.floor(totalDuration%60).toString().padStart(2,'0')}</span></div>
            <div className="h-48 border-t border-gray-800 bg-[#131316] z-10 overflow-hidden">
                <Timeline
                    duration={totalDuration}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                    images={images}
                    hasAudio={!!audioAsset}
                    hasBgAudio={!!bgAudioAsset}
                    onReorder={handleTimelineReorder}
                    onSelectImage={(id) => {
                        setSelectedImageId(id);
                    }}
                    selectedImageId={selectedImageId}
                    subtitles={lyrics}
                />
            </div>
        </main>

        <aside className="w-72 border-l border-gray-800 flex flex-col bg-[#131316] z-10">
            <div className="h-10 border-b border-gray-800 flex items-center px-4"><span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Properties</span></div>
            <div className="flex-1 overflow-y-auto p-4">
                {selectedImage ? (
                    <div className="space-y-6">
                         <div className="mb-6 border-b border-gray-800 pb-4">
                            <h3 className="text-xs font-semibold text-gray-300 mb-3">Arrangement</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <Button 
                                    variant="secondary" 
                                    className="text-[10px] py-1" 
                                    onClick={() => moveSelectedImageOrder('backward')}
                                    disabled={images.findIndex(i => i.id === selectedImageId) === 0}
                                    icon={<ChevronLeftIcon />}
                                >
                                    Send Backward
                                </Button>
                                <Button 
                                    variant="secondary" 
                                    className="text-[10px] py-1" 
                                    onClick={() => moveSelectedImageOrder('forward')}
                                    disabled={images.findIndex(i => i.id === selectedImageId) === images.length - 1}
                                >
                                    Bring Forward <ChevronRightIcon /> 
                                </Button>
                            </div>
                        </div>
                        <div><h3 className="text-xs font-semibold text-gray-300 mb-3">Transform</h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between"><span className="text-xs text-gray-500">Duration</span><input type="number" step="0.1" className="w-16 bg-gray-900 border border-gray-700 rounded px-1 text-xs text-right" value={selectedImage.duration} onChange={(e) => updateSelectedImage({ duration: parseFloat(e.target.value) })} /></div>
                                <div className="space-y-2"><div><div className="flex justify-between text-[10px] text-gray-500"><span>Brightness</span><span>{(selectedImage.adjustments?.brightness || 100)}%</span></div><input type="range" min="0" max="200" value={(selectedImage.adjustments?.brightness || 100)} onChange={(e) => updateSelectedImageAdjustments({ brightness: Number(e.target.value) })} className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer" /></div><div><div className="flex justify-between text-[10px] text-gray-500"><span>Contrast</span><span>{(selectedImage.adjustments?.contrast || 100)}%</span></div><input type="range" min="0" max="200" value={(selectedImage.adjustments?.contrast || 100)} onChange={(e) => updateSelectedImageAdjustments({ contrast: Number(e.target.value) })} className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer" /></div><div><div className="flex justify-between text-[10px] text-gray-500"><span>Saturation</span><span>{(selectedImage.adjustments?.saturation || 100)}%</span></div><input type="range" min="0" max="200" value={(selectedImage.adjustments?.saturation || 100)} onChange={(e) => updateSelectedImageAdjustments({ saturation: Number(e.target.value) })} className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer" /></div></div>
                                <div className="grid grid-cols-3 gap-2 mt-2">{FILTER_PRESETS.map(preset => (<button key={preset.name} onClick={() => applyPreset(preset.adjustments)} className="text-[10px] bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded py-1">{preset.name}</button>))}</div>
                                <div className="grid grid-cols-2 gap-2"><div><label className="text-[10px] text-gray-500">Pan X</label><input type="range" min="-200" max="200" value={(selectedImage.crop?.x || 0)} onChange={(e) => updateSelectedImageCrop({ x: Number(e.target.value) })} className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer" /></div><div><label className="text-[10px] text-gray-500">Pan Y</label><input type="range" min="-200" max="200" value={(selectedImage.crop?.y || 0)} onChange={(e) => updateSelectedImageCrop({ y: Number(e.target.value) })} className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer" /></div></div>
                                <div><label className="text-[10px] text-gray-500">Zoom</label><input type="range" min="1" max="3" step="0.1" value={(selectedImage.crop?.scale || 1)} onChange={(e) => updateSelectedImageCrop({ scale: Number(e.target.value) })} className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer" /></div>
                                <Button variant="secondary" className="w-full text-xs py-1" icon={<CropIcon />} onClick={() => { setEditingImageId(selectedImage.id); }}>Advanced Crop</Button>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="text-xs font-semibold text-gray-300">Text Overlays</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <Button onClick={addTextToSelected} className="w-full text-xs py-2 shadow-md" variant="primary">+ Text</Button>
                                <Button onClick={handleGenerateCaption} disabled={isGeneratingCaption} className="w-full text-xs py-2 shadow-md" variant="secondary" icon={<MagicWandIcon />}>
                                    {isGeneratingCaption ? '...' : 'AI Caption'}
                                </Button>
                            </div>
                            {selectedImage.textOverlays.length > 0 ? (
                                <div className="space-y-3">
                                     <div className="flex flex-wrap gap-2 mb-4">
                                        {selectedImage.textOverlays.map(ov => (
                                            <button 
                                                key={ov.id}
                                                onClick={() => setSelectedTextId(ov.id)}
                                                className={`px-3 py-1.5 text-xs rounded border ${selectedTextId === ov.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}
                                            >
                                                {ov.text.substring(0, 10) || "Text"}...
                                            </button>
                                        ))}
                                     </div>

                                     {selectedTextOverlay ? (
                                         <div className="bg-gray-800/50 rounded p-3 border border-indigo-500/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-bold text-indigo-300">Editing: {selectedTextOverlay.text.substring(0, 12)}...</span>
                                                <button onClick={() => {
                                                     const newOverlays = selectedImage.textOverlays.filter(t => t.id !== selectedTextId);
                                                     updateSelectedImage({ textOverlays: newOverlays });
                                                     setSelectedTextId(null);
                                                }} className="text-red-400 hover:text-red-300 p-1"><TrashIcon /></button>
                                            </div>
                                            
                                            <textarea 
                                                className="w-full bg-black/20 border border-gray-700 rounded p-2 text-xs focus:border-indigo-500 outline-none mb-3 resize-none" 
                                                rows={2}
                                                value={selectedTextOverlay.text}
                                                onChange={(e) => {
                                                    const newOverlays = selectedImage.textOverlays.map(ov => 
                                                        ov.id === selectedTextId ? { ...ov, text: e.target.value } : ov
                                                    );
                                                    updateSelectedImage({ textOverlays: newOverlays });
                                                }}
                                            />

                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-gray-500">Color</label>
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="color" 
                                                            value={selectedTextOverlay.color}
                                                            onChange={(e) => {
                                                                const newOverlays = selectedImage.textOverlays.map(ov => 
                                                                    ov.id === selectedTextId ? { ...ov, color: e.target.value } : ov
                                                                );
                                                                updateSelectedImage({ textOverlays: newOverlays });
                                                            }}
                                                            className="h-8 w-8 rounded cursor-pointer bg-transparent"
                                                        />
                                                        <input 
                                                            type="text" 
                                                            value={selectedTextOverlay.color}
                                                            onChange={(e) => {
                                                                const newOverlays = selectedImage.textOverlays.map(ov => 
                                                                    ov.id === selectedTextId ? { ...ov, color: e.target.value } : ov
                                                                );
                                                                updateSelectedImage({ textOverlays: newOverlays });
                                                            }}
                                                            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 text-[10px] uppercase"
                                                        />
                                                    </div>
                                                </div>
                                                 <div className="space-y-1">
                                                    <label className="text-[10px] text-gray-500">Font</label>
                                                    <select 
                                                        className="w-full bg-gray-900 text-xs px-2 h-8 border border-gray-700 rounded"
                                                        value={selectedTextOverlay.fontFamily}
                                                        onChange={(e) => {
                                                            const newOverlays = selectedImage.textOverlays.map(ov => 
                                                                ov.id === selectedTextId ? { ...ov, fontFamily: e.target.value } : ov
                                                            );
                                                            updateSelectedImage({ textOverlays: newOverlays });
                                                        }}
                                                    >
                                                        {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="space-y-3 mb-3">
                                                 <div>
                                                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                                        <span>Size</span>
                                                        <span>{selectedTextOverlay.fontSize}px</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="12" 
                                                        max="120" 
                                                        step="2" 
                                                        value={selectedTextOverlay.fontSize}
                                                        onChange={(e) => {
                                                            const newOverlays = selectedImage.textOverlays.map(ov => 
                                                                ov.id === selectedTextId ? { ...ov, fontSize: Number(e.target.value) } : ov
                                                            );
                                                            updateSelectedImage({ textOverlays: newOverlays });
                                                        }}
                                                        className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer" 
                                                    />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                                        <span>Opacity</span>
                                                        <span>{Math.round(selectedTextOverlay.opacity * 100)}%</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="0" 
                                                        max="1" 
                                                        step="0.05" 
                                                        value={selectedTextOverlay.opacity}
                                                        onChange={(e) => {
                                                            const newOverlays = selectedImage.textOverlays.map(ov => 
                                                                ov.id === selectedTextId ? { ...ov, opacity: parseFloat(e.target.value) } : ov
                                                            );
                                                            updateSelectedImage({ textOverlays: newOverlays });
                                                        }}
                                                        className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer accent-indigo-500" 
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700/50">
                                                <div>
                                                    <label className="text-[10px] text-gray-500">Animation</label>
                                                    <select 
                                                        className="w-full bg-gray-900 text-xs px-1 border border-gray-700 rounded h-6 mt-1"
                                                        value={selectedTextOverlay.animation}
                                                        onChange={(e) => {
                                                            const newOverlays = selectedImage.textOverlays.map(ov => 
                                                                ov.id === selectedTextId ? { ...ov, animation: e.target.value as TextAnimation } : ov
                                                            );
                                                            updateSelectedImage({ textOverlays: newOverlays });
                                                        }}
                                                    >
                                                        <option value="none">None</option>
                                                        <option value="fade">Fade In</option>
                                                        <option value="slide-up">Slide Up</option>
                                                        <option value="typewriter">Typewriter</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-gray-500">Speed ({(selectedTextOverlay.animationDuration || 1.5).toFixed(1)}s)</label>
                                                    <input 
                                                        type="range" 
                                                        min="0.5" 
                                                        max="5" 
                                                        step="0.1" 
                                                        value={selectedTextOverlay.animationDuration || 1.5}
                                                        onChange={(e) => {
                                                            const newOverlays = selectedImage.textOverlays.map(ov => 
                                                                ov.id === selectedTextId ? { ...ov, animationDuration: parseFloat(e.target.value) } : ov
                                                            );
                                                            updateSelectedImage({ textOverlays: newOverlays });
                                                        }}
                                                        className="w-full h-1 bg-gray-600 rounded-lg cursor-pointer mt-2"
                                                    />
                                                </div>
                                            </div>

                                         </div>
                                     ) : (
                                         <div className="text-center py-8 text-gray-500 text-xs">
                                            Select a text overlay to edit properties
                                         </div>
                                     )}
                                </div>
                            ) : (<p className="text-xs text-gray-500 italic text-center">No text added yet.</p>)}
                        </div>
                    </div>
                ) : <div className="flex flex-col items-center justify-center h-full text-gray-600"><LayerIcon /><p className="text-xs mt-2">Select an item to edit</p></div>}
            </div>
        </aside>
      </div>

      {editingImageId && (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm">
                <div className="bg-[#18181b] p-6 rounded-xl border border-gray-800 w-full max-w-3xl flex flex-col gap-4 shadow-2xl">
                    <div className="flex justify-between items-center mb-2"><h3 className="text-lg font-bold text-white">Crop Image</h3></div>
                    <div className="relative w-full aspect-video bg-black overflow-hidden rounded-lg cursor-move ring-2 ring-indigo-500/50" onMouseDown={handleCropMouseDown} onMouseMove={handleCropMouseMove} onMouseUp={handleCropMouseUp} onMouseLeave={handleCropMouseUp}>
                        {(() => { const img = images.find(i => i.id === editingImageId); if (!img) return null; const el = imageElementsRef.current.get(img.id); if (!el) return null; const ia = el.width / el.height; const ca = 1280/720; let rw, rh, dx, dy; if (ia > ca) { rh = 360; rw = 360 * ia; dx = (640 - rw) / 2; dy = 0; } else { rw = 640; rh = 640 / ia; dx = 0; dy = (360 - rh) / 2; } let biasY = 0; if (rh > 360) biasY = (rh - 360) * 0.25; return (<img src={img.url} draggable={false} style={{ position: 'absolute', width: `${rw}px`, height: `${rh}px`, left: `${dx}px`, top: `${dy}px`, transform: `translate(${tempCrop.x * 0.5}px, ${(tempCrop.y * 0.5) + biasY}px) scale(${tempCrop.scale})`, transformOrigin: '50% 50%', pointerEvents: 'none' }} />); })()}
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-30"><div className="border-r border-b border-white"></div><div className="border-r border-b border-white"></div><div className="border-b border-white"></div><div className="border-r border-b border-white"></div><div className="border-r border-b border-white"></div><div className="border-b border-white"></div><div className="border-r border-white"></div><div className="border-r border-white"></div></div>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50"><div className="w-4 h-0.5 bg-yellow-400/80 absolute"></div><div className="h-4 w-0.5 bg-yellow-400/80 absolute"></div></div>
                    </div>
                    <div className="flex items-center gap-4 mt-2"><span className="text-sm text-gray-400">Zoom</span><input type="range" min="1" max="3" step="0.1" value={tempCrop.scale} onChange={(e) => setTempCrop(prev => ({...prev, scale: parseFloat(e.target.value)}))} className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" /><button onClick={() => setTempCrop({ x: 0, y: 0, scale: 1 })} className="p-2 text-gray-400 hover:text-white"><ResetIcon /></button></div>
                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-800"><Button variant="secondary" onClick={closeCropModal}>Cancel</Button><Button variant="primary" onClick={saveCrop}>Save Crop</Button></div>
                </div>
            </div>
      )}

      <audio ref={audioRef} crossOrigin="anonymous" onEnded={() => setIsPlaying(false)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      <audio ref={bgAudioRef} crossOrigin="anonymous" loop />
    </div>
  );
}