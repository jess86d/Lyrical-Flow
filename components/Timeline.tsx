import React, { useRef, useState, useEffect } from 'react';
import { ImageAsset, Subtitle } from '../types';

interface TimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  images: ImageAsset[];
  hasAudio: boolean;
  hasBgAudio: boolean;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onSelectImage: (id: string) => void;
  selectedImageId: string | null;
  subtitles: Subtitle[];
}

const PX_PER_SEC = 30;
const HEADER_WIDTH = 80; // Width of the sticky header (w-20 = 5rem = 80px)

export const Timeline: React.FC<TimelineProps> = ({ 
  duration, 
  currentTime, 
  onSeek,
  images,
  hasAudio,
  hasBgAudio,
  onReorder,
  onSelectImage,
  selectedImageId,
  subtitles
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Calculate widths
  const timeWidth = duration * PX_PER_SEC;
  const totalWidth = HEADER_WIDTH + timeWidth;

  // Auto-scroll logic to keep playhead visible
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Only auto-scroll if playing? 
    // The prompt implies "As the video plays", so essentially when currentTime changes.
    // We assume this effect runs often. If the user is manually scrolling while playing, 
    // this might fight them. A sophisticated implementation checks for user interaction.
    // For simplicity, we implement basic "keep visible" logic.
    
    const container = containerRef.current;
    const playheadPos = HEADER_WIDTH + (currentTime * PX_PER_SEC);
    const scrollLeft = container.scrollLeft;
    const clientWidth = container.clientWidth;
    
    // Define a "safe zone" (e.g., 20% padding)
    const buffer = clientWidth * 0.2;
    
    // Check if playhead is going out of view
    if (playheadPos > scrollLeft + clientWidth - buffer) {
        // Scroll forward
        container.scrollTo({ left: playheadPos - clientWidth + buffer, behavior: 'smooth' });
    } else if (playheadPos < scrollLeft + HEADER_WIDTH) {
        // Scroll backward (if jumped back)
        container.scrollTo({ left: playheadPos - HEADER_WIDTH - 20, behavior: 'smooth' });
    }

  }, [currentTime]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggedIndex !== null) return;
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    
    // If click is on the header, ignore
    if (x < HEADER_WIDTH) return;
    
    const time = (x - HEADER_WIDTH) / PX_PER_SEC;
    onSeek(Math.min(Math.max(time, 0), duration));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    onReorder(draggedIndex, dropIndex);
    setDraggedIndex(null);
  };

  return (
    <div className="w-full h-full flex flex-col select-none bg-[#0a0a0c]">
      {/* Time Header Summary (Static) */}
      <div className="flex justify-between text-[10px] text-gray-500 px-2 py-1 bg-[#131316] border-b border-gray-800 shrink-0 z-30">
          <span className="font-mono">{Math.floor(currentTime/60)}:{Math.floor(currentTime%60).toString().padStart(2, '0')}</span>
          <span className="font-mono">{Math.floor(duration/60)}:{Math.floor(duration%60).toString().padStart(2, '0')}</span>
      </div>

      <div 
        ref={containerRef}
        className="relative flex-1 overflow-x-auto overflow-y-hidden"
        onClick={handleSeek}
      >
        <div style={{ minWidth: '100%', width: `${totalWidth}px` }} className="h-full relative">
            
            {/* Playhead Line */}
            <div 
                className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none transition-transform duration-75"
                style={{ left: `${HEADER_WIDTH + (currentTime * PX_PER_SEC)}px` }}
            >
                <div className="absolute -top-0 -left-1.5 w-3 h-3 bg-red-500 transform rotate-45" />
            </div>

            {/* Tracks */}
            <div className="flex flex-col h-full">
            
                {/* 1. Vocals Track */}
                <div className="h-8 border-b border-gray-800/50 bg-gray-900/30 flex items-center relative shrink-0">
                    <div className="sticky left-0 w-20 h-full bg-[#131316] z-40 flex items-center px-2 border-r border-gray-800 text-[9px] text-gray-400 font-medium shrink-0 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                        Vocals
                    </div>
                    <div className="relative h-full" style={{ width: `${timeWidth}px` }}>
                        {subtitles.map((sub) => {
                            const left = sub.startTime * PX_PER_SEC;
                            const width = (sub.endTime - sub.startTime) * PX_PER_SEC;
                            return (
                                <div 
                                key={sub.id}
                                className="absolute top-1 bottom-1 bg-indigo-500/30 border border-indigo-500/50 rounded-sm truncate text-[8px] text-indigo-200 px-1 flex items-center hover:bg-indigo-500/50 transition-colors cursor-help"
                                style={{ left: `${left}px`, width: `${width}px` }}
                                title={`${sub.text}`}
                                >
                                    {sub.text}
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* 2. Music Track */}
                <div className="h-10 border-b border-gray-800/50 bg-gray-900/30 flex items-center relative shrink-0">
                    <div className="sticky left-0 w-20 h-full bg-[#131316] z-40 flex items-center px-2 border-r border-gray-800 text-[9px] text-gray-400 font-medium shrink-0 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                        Music
                    </div>
                    <div className="relative h-full" style={{ width: `${timeWidth}px` }}>
                        {hasAudio && (
                            <div className="absolute inset-0 top-1 bottom-1 bg-blue-500/20 rounded mx-1 flex items-center overflow-hidden">
                                <div className="flex items-center gap-0.5 opacity-40 w-full px-2">
                                    {/* Generate fake waveform bars approximately based on width */}
                                    {Array.from({ length: Math.min(200, Math.ceil(timeWidth / 10)) }).map((_, i) => (
                                        <div key={i} className="flex-1 bg-blue-400 rounded-full" style={{ height: `${Math.random() * 80 + 20}%` }}></div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Video Track */}
                <div className="h-20 border-b border-gray-800/50 bg-[#1a1a20] flex items-center relative shrink-0">
                    <div className="sticky left-0 w-20 h-full bg-[#131316] z-40 flex items-center px-2 border-r border-gray-800 text-[9px] text-gray-300 font-bold shrink-0 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                        Video
                    </div>
                    <div className="relative h-full flex" style={{ width: `${timeWidth}px` }}>
                        {images.map((img, i) => {
                            const width = img.duration * PX_PER_SEC;
                            return (
                                <div 
                                    key={img.id}
                                    className={`
                                        h-full relative group/item cursor-grab active:cursor-grabbing border-r border-gray-900 overflow-hidden shrink-0
                                        ${selectedImageId === img.id ? 'ring-2 ring-indigo-500 z-10' : 'opacity-80 hover:opacity-100'}
                                    `}
                                    style={{ width: `${width}px` }}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, i)}
                                    onDragOver={(e) => handleDragOver(e, i)}
                                    onDrop={(e) => handleDrop(e, i)}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectImage(img.id);
                                        const startTime = images.slice(0, i).reduce((acc, curr) => acc + curr.duration, 0);
                                        onSeek(startTime + 0.01);
                                    }}
                                >
                                    <img src={img.url} className="w-full h-full object-cover pointer-events-none" />
                                    
                                    {/* Film strip visuals */}
                                    <div className="absolute top-0 left-0 right-0 h-2 bg-black/40 flex justify-between px-1 items-center">
                                         {Array.from({length: Math.max(1, Math.floor(width/20))}).map((_, k) => <div key={k} className="w-1 h-1 bg-white/30 rounded-full"></div>)}
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/40 flex justify-between px-1 items-center">
                                         {Array.from({length: Math.max(1, Math.floor(width/20))}).map((_, k) => <div key={k} className="w-1 h-1 bg-white/30 rounded-full"></div>)}
                                    </div>

                                    <div className="absolute bottom-3 left-1 bg-black/60 text-[8px] text-white px-1 rounded truncate max-w-[90%] pointer-events-none border border-white/10">
                                        {i+1}. {img.file.name.length > 15 ? img.file.name.substring(0, 12) + '...' : img.file.name}
                                    </div>
                                    
                                    {draggedIndex === i && (
                                        <div className="absolute inset-0 bg-indigo-500/30 flex items-center justify-center">
                                            <span className="text-white font-bold text-xs drop-shadow-md">Move</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                         {images.length === 0 && (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-600 border-2 border-dashed border-gray-800 m-2 rounded bg-gray-900/50">
                                Drag and drop images to start
                            </div>
                        )}
                    </div>
                </div>

                {/* 4. BG Music Track */}
                <div className="h-8 bg-gray-900/30 flex items-center relative shrink-0">
                    <div className="sticky left-0 w-20 h-full bg-[#131316] z-40 flex items-center px-2 border-r border-gray-800 text-[9px] text-gray-500 font-medium shrink-0 shadow-[2px_0_5px_rgba(0,0,0,0.3)]">
                        BG Music
                    </div>
                    <div className="relative h-full" style={{ width: `${timeWidth}px` }}>
                        {hasBgAudio && (
                            <div className="absolute inset-0 top-1 bottom-1 bg-purple-500/20 rounded mx-1 flex items-center">
                                <div className="w-full h-0.5 bg-purple-500/50"></div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};