import { ImageAsset, AudioAsset, Subtitle, VideoResolution, VideoFrameRate, TransitionEffect } from '../types';

const DB_NAME = 'LyricalFlowDB';
const STORE_NAME = 'project_store';
const KEY = 'current_project';

export interface ProjectSettings {
    resolution: VideoResolution;
    frameRate: VideoFrameRate;
    transitionEffect: TransitionEffect;
    transitionDuration: number;
    mainAudioVolume?: number;
}

interface StoredData {
    images: ImageAsset[];
    audioAsset: AudioAsset | null;
    bgAudioAsset: AudioAsset | null;
    bgMusicVolume: number;
    subtitles: Subtitle[];
    settings: ProjectSettings;
}

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
};

export const saveProject = async (
    images: ImageAsset[],
    audioAsset: AudioAsset | null,
    bgAudioAsset: AudioAsset | null,
    bgMusicVolume: number,
    subtitles: Subtitle[],
    settings: ProjectSettings
): Promise<void> => {
    const db = await openDB();
    
    // Prepare data for storage - Create Object URLs are not persistent, so we strip them
    // We rely on the 'file' property being a File object which is supported in IDB
    const imagesToStore = images.map(img => ({
        ...img,
        url: '' 
    }));
    
    const audioToStore = audioAsset ? { ...audioAsset, url: '' } : null;
    const bgAudioToStore = bgAudioAsset ? { ...bgAudioAsset, url: '' } : null;

    const data: StoredData = {
        images: imagesToStore,
        audioAsset: audioToStore,
        bgAudioAsset: bgAudioToStore,
        bgMusicVolume,
        subtitles,
        settings
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(data, KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const loadProject = async (): Promise<StoredData | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(KEY);
        request.onsuccess = () => {
            const data = request.result as StoredData;
            if (!data) {
                resolve(null);
                return;
            }
            
            // Re-create Object URLs
            if (data.images) {
                data.images = data.images.map(img => ({
                    ...img,
                    url: URL.createObjectURL(img.file)
                }));
            }
            if (data.audioAsset) {
                data.audioAsset.url = URL.createObjectURL(data.audioAsset.file);
            }
            if (data.bgAudioAsset) {
                data.bgAudioAsset.url = URL.createObjectURL(data.bgAudioAsset.file);
            }
            
            resolve(data);
        };
        request.onerror = () => reject(request.error);
    });
};