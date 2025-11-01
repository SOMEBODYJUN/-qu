
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UploadIcon, PlayIcon, PauseIcon, PrevIcon, NextIcon, ReconfigureIcon, ExportIcon, MusicNoteIcon, VideoIcon, ClearIcon } from './components/icons';
import { ConfigurationView } from './components/ConfigurationView';

// Add type declaration for the libraries loaded from a CDN
declare const pdfjsLib: any;
declare const JSZip: any;

type AppState = 'upload' | 'configuring' | 'viewing';
type MediaType = 'audio' | 'video' | null;

const App: React.FC = () => {
    const [sheetPages, setSheetPages] = useState<string[]>([]);
    const [mediaSrc, setMediaSrc] = useState<string | null>(null);
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaType, setMediaType] = useState<MediaType>(null);
    const [currentLeftIndex, setCurrentLeftIndex] = useState<number>(-1);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const [appState, setAppState] = useState<AppState>('upload');
    const [pageIntervals, setPageIntervals] = useState<number[]>([]);
    
    const timerRef = useRef<number | null>(null);
    const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement>(null);


    const processPdf = async (file: File): Promise<string[]> => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
        const fileReader = new FileReader();
        return new Promise((resolve, reject) => {
            fileReader.onload = async (e) => {
                if (e.target?.result) {
                    const typedArray = new Uint8Array(e.target.result as ArrayBuffer);
                    try {
                        const pdf = await pdfjsLib.getDocument(typedArray).promise;
                        const pageUrls: string[] = [];
                        for (let i = 1; i <= pdf.numPages; i++) {
                            setLoadingMessage(`Processing PDF: ${file.name} (page ${i}/${pdf.numPages})`);
                            const page = await pdf.getPage(i);
                            const viewport = page.getViewport({ scale: 2.0 });
                            const canvas = document.createElement('canvas');
                            const context = canvas.getContext('2d');
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;
                            if (context) {
                                await page.render({ canvasContext: context, viewport: viewport }).promise;
                                pageUrls.push(canvas.toDataURL('image/jpeg', 0.9));
                            }
                        }
                        resolve(pageUrls);
                    } catch (error) {
                        console.error('Error processing PDF:', error);
                        alert(`Failed to process PDF file: ${file.name}. It might be corrupted or unsupported.`);
                        reject(error);
                    }
                } else {
                    reject(new Error('Failed to read file'));
                }
            };
            fileReader.onerror = reject;
            fileReader.readAsArrayBuffer(file);
        });
    };
    
    const processZip = async (file: File): Promise<{ pages: string[], intervals: number[], mediaSrc: string | null, mediaFile: File | null, mediaType: MediaType }> => {
        const zip = await JSZip.loadAsync(file);
        const settingsFile = zip.file('settings.json');
        if (!settingsFile) {
            throw new Error('Invalid package: settings.json not found.');
        }
        const settings = JSON.parse(await settingsFile.async('string'));
        const intervals = settings.intervals || [];
        const audioFilename = settings.audioFilename;
        const videoFilename = settings.videoFilename;
        const mediaFilename = videoFilename || audioFilename;

        const imageFiles = (Object.values(zip.files) as any[]).filter(f => !f.dir && f.name !== 'settings.json' && f.name !== mediaFilename);
        imageFiles.sort((a, b) => a.name.localeCompare(b.name));

        const pageUrls: string[] = [];
        for (const [index, imageFile] of imageFiles.entries()) {
            setLoadingMessage(`Loading package: ${file.name} (file ${index + 1}/${imageFiles.length})`);
            const blob = await imageFile.async('blob');
            pageUrls.push(URL.createObjectURL(blob));
        }

        let loadedMediaSrc: string | null = null;
        let loadedMediaFile: File | null = null;
        let loadedMediaType: MediaType = null;

        if (mediaFilename) {
            const mediaZipFile = zip.file(mediaFilename);
            if (mediaZipFile) {
                const blob = await mediaZipFile.async('blob');
                loadedMediaSrc = URL.createObjectURL(blob);
                loadedMediaFile = new File([blob], mediaFilename, { type: blob.type });
                if (videoFilename) {
                    loadedMediaType = 'video';
                } else if (audioFilename) {
                    loadedMediaType = 'audio';
                }
            }
        }

        // FIX: The shorthand property 'pages' had no value in scope. Changed to use 'pageUrls'.
        return { pages: pageUrls, intervals, mediaSrc: loadedMediaSrc, mediaFile: loadedMediaFile, mediaType: loadedMediaType };
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0) return;
        setIsLoading(true);
        setLoadingMessage('Preparing files...');
        handleBackToUpload(true); 

        const uploadedFiles = Array.from(event.target.files);
        const zipFile = uploadedFiles.find(f => f.type === 'application/zip');

        if (zipFile) {
             try {
                const { pages, intervals, mediaSrc, mediaFile, mediaType } = await processZip(zipFile);
                setSheetPages(pages);
                setPageIntervals(intervals);
                if (mediaSrc && mediaFile) {
                    setMediaSrc(mediaSrc);
                    setMediaFile(mediaFile);
                    setMediaType(mediaType);
                }
                setCurrentLeftIndex(-1);
                setIsPlaying(false);
                setAppState('viewing');
            } catch (error) {
                console.error(error);
                alert(`Failed to load package: ${error instanceof Error ? error.message : 'Unknown error'}`);
                handleBackToUpload();
            } finally {
                setIsLoading(false);
                setLoadingMessage('');
            }
            return;
        }
        
        const sheetMusicFiles = uploadedFiles.filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
        const firstVideoFile = uploadedFiles.find(f => f.type === 'video/mp4');
        const firstAudioFile = uploadedFiles.find(f => f.type.startsWith('audio/'));

        sheetMusicFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        
        const allPageUrls: string[] = [];
        for (const file of sheetMusicFiles) {
            if (file.type.startsWith('image/')) {
                allPageUrls.push(URL.createObjectURL(file));
            } else if (file.type === 'application/pdf') {
                try {
                    const pdfUrls = await processPdf(file);
                    allPageUrls.push(...pdfUrls);
                } catch (error) {
                    setIsLoading(false);
                    setLoadingMessage('');
                    return;
                }
            }
        }

        if (firstVideoFile) {
            setMediaFile(firstVideoFile);
            setMediaSrc(URL.createObjectURL(firstVideoFile));
            setMediaType('video');
        } else if (firstAudioFile) {
            setMediaFile(firstAudioFile);
            setMediaSrc(URL.createObjectURL(firstAudioFile));
            setMediaType('audio');
        }
        
        setSheetPages(allPageUrls);
        setPageIntervals(new Array(allPageUrls.length).fill(30));
        setAppState('configuring');
        setIsLoading(false);
        setLoadingMessage('');
    };

    const handleExport = async () => {
        if (sheetPages.length === 0) return;
        setIsLoading(true);
        setLoadingMessage('Creating package...');
        try {
            const zip = new JSZip();
            const settings: { intervals: number[], audioFilename?: string, videoFilename?: string } = { intervals: pageIntervals };

            if (mediaFile) {
                zip.file(mediaFile.name, mediaFile);
                if (mediaType === 'video') {
                    settings.videoFilename = mediaFile.name;
                } else {
                    settings.audioFilename = mediaFile.name;
                }
            }

            zip.file('settings.json', JSON.stringify(settings));

            for (let i = 0; i < sheetPages.length; i++) {
                setLoadingMessage(`Adding page ${i + 1}/${sheetPages.length}...`);
                const pageUrl = sheetPages[i];
                const response = await fetch(pageUrl);
                const blob = await response.blob();
                const fileName = `page_${String(i + 1).padStart(3, '0')}.jpeg`;
                zip.file(fileName, blob);
            }

            setLoadingMessage('Generating ZIP file...');
            const content = await zip.generateAsync({ type: 'blob' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `sheet-music-session-${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch(error) {
            console.error("Failed to export session:", error);
            alert("An error occurred while creating the export package.");
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };
    
    const handleSaveConfiguration = (intervals: number[]) => {
        setPageIntervals(intervals);
        setCurrentLeftIndex(-1);
        setIsPlaying(false);
        setAppState('viewing');
    };

    const handleBackToUpload = (silent: boolean = false) => {
        sheetPages.forEach(page => {
            if (page.startsWith('blob:') || page.startsWith('data:')) {
                URL.revokeObjectURL(page);
            }
        });
        if (mediaSrc) {
            URL.revokeObjectURL(mediaSrc);
        }
        setSheetPages([]);
        setPageIntervals([]);
        setMediaSrc(null);
        setMediaFile(null);
        setMediaType(null);
        setCurrentLeftIndex(-1);
        setIsPlaying(false);
        if (mediaRef.current) {
            mediaRef.current.currentTime = 0;
        }
        if (!silent) {
           setAppState('upload');
        }
    };
    
    const clearMedia = () => {
        if (mediaRef.current) {
            mediaRef.current.pause();
            mediaRef.current.currentTime = 0;
        }
        if (mediaSrc) {
            URL.revokeObjectURL(mediaSrc);
        }
        setMediaSrc(null);
        setMediaFile(null);
        setMediaType(null);
        setIsPlaying(false);
    };

    const totalPages = sheetPages.length;

    const goToNextPage = useCallback(() => {
        if (totalPages === 0) return;
        setCurrentLeftIndex(prev => {
            if (prev + 2 < totalPages) {
                return prev + 1;
            }
            setIsPlaying(false);
            if(mediaRef.current) mediaRef.current.pause();
            return prev;
        });
    }, [totalPages]);

    const goToPrevPage = useCallback(() => {
        setCurrentLeftIndex(prev => Math.max(prev - 1, -1));
    }, []);

    useEffect(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
        if (isPlaying && appState === 'viewing') {
            const intervalIndex = currentLeftIndex + 1;
            if (intervalIndex < totalPages && currentLeftIndex + 2 < totalPages) {
                const intervalForCurrentView = pageIntervals[intervalIndex] || 30;
                timerRef.current = window.setTimeout(() => {
                    goToNextPage();
                }, intervalForCurrentView * 1000);
            } else {
                // Last page reached, but media might still be playing.
                // Let the media `onEnded` event handle stopping.
            }
        }
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [isPlaying, currentLeftIndex, pageIntervals, appState, totalPages, goToNextPage]);
    
    useEffect(() => {
        return () => {
            sheetPages.forEach(page => {
                if (page.startsWith('blob:')) {
                    URL.revokeObjectURL(page);
                }
            });
            if(mediaSrc) {
                URL.revokeObjectURL(mediaSrc);
            }
        };
    }, [sheetPages, mediaSrc]);

    const togglePlayPause = () => {
        if (totalPages > 0) {
            const newIsPlaying = !isPlaying;
            setIsPlaying(newIsPlaying);
            if (mediaRef.current) {
                if (newIsPlaying) {
                    mediaRef.current.play().catch(e => {
                        console.error("Media play failed:", e);
                        setIsPlaying(false); // Revert state if play fails
                    });
                } else {
                    mediaRef.current.pause();
                }
            }
        }
    };
    
    const renderPageNumber = () => {
        if (totalPages === 0 || appState !== 'viewing') return null;

        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

        if (isMobile) {
            const mobilePageIndex = currentLeftIndex + 1;
            return `Page ${mobilePageIndex + 1} of ${totalPages}`;
        }

        const isCoverView = currentLeftIndex === -1;
        if (isCoverView) return `Cover (Page 1 of ${totalPages})`;
        if (currentLeftIndex >= totalPages - 2) return `Pages ${totalPages - 1}-${totalPages} of ${totalPages}`;
        return `Pages ${currentLeftIndex + 1}-${currentLeftIndex + 2} of ${totalPages}`;
    };

    if (isLoading) {
        return (
            <div className="flex flex-col h-screen bg-stone-100 text-stone-800 font-sans justify-center items-center">
                <LoadingIndicator message={loadingMessage} />
            </div>
        );
    }

    if (appState === 'configuring') {
        return <ConfigurationView 
            pages={sheetPages} 
            initialIntervals={pageIntervals} 
            onSave={handleSaveConfiguration}
            onCancel={() => handleBackToUpload()}
            mediaSrc={mediaSrc}
            mediaType={mediaType}
            mediaFile={mediaFile}
        />;
    }

    return (
        <div className="flex flex-col h-screen bg-stone-100 text-stone-800 font-sans">
            {mediaType === 'audio' && <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={mediaSrc ?? undefined} onEnded={() => setIsPlaying(false)} />}

            <header className="p-3 bg-white/80 backdrop-blur-sm shadow-md z-20 flex justify-between items-center border-b border-stone-200 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                    <button onClick={() => handleBackToUpload()} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-semibold">
                        New Score
                    </button>
                     <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded-md text-sm font-semibold">
                        <ExportIcon />
                        <span>Export</span>
                    </button>
                </div>
                
                <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
                    <h1 className="text-xl font-bold tracking-wider text-stone-900">Sheet Music Viewer</h1>
                    {appState === 'viewing' && mediaFile && (
                        <div className="flex items-center gap-2 text-xs bg-stone-200 px-2 py-0.5 rounded-full mt-1 text-stone-700">
                            {mediaType === 'video' ? <VideoIcon /> : <MusicNoteIcon />}
                            <span className="font-medium truncate max-w-[200px]">{mediaFile.name}</span>
                            <button onClick={clearMedia} className="text-stone-500 hover:text-red-600">
                                <ClearIcon />
                            </button>
                        </div>
                    )}
                </div>

                 <button onClick={() => setAppState('configuring')} className="flex items-center gap-2 px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded-md text-sm font-semibold" disabled={sheetPages.length === 0}>
                    <ReconfigureIcon />
                    <span>Reconfigure</span>
                </button>
            </header>

            <main className="flex-grow flex flex-col md:flex-row justify-center items-stretch p-4 overflow-hidden relative gap-4">
                {appState === 'upload' ? (
                     <div className="w-full h-full flex justify-center items-center">
                        <UploadPrompt onFileUpload={handleFileUpload} />
                    </div>
                ) : (
                    <>
                        {mediaType === 'video' && mediaSrc && (
                            <div className="w-full md:w-1/3 h-1/3 md:h-full flex-shrink-0">
                                 <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={mediaSrc} onEnded={() => setIsPlaying(false)} controls className="w-full h-full object-contain rounded-lg bg-black shadow-lg"/>
                            </div>
                        )}
                        <div className="flex-grow w-full h-full">
                            <SheetDisplay pages={sheetPages} leftIndex={currentLeftIndex} />
                        </div>
                    </>
                )}
            </main>

            {appState === 'viewing' && sheetPages.length > 0 && (
                 <footer className="sticky bottom-0 bg-white/90 backdrop-blur-sm p-4 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] border-t border-stone-200">
                    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                            <button onClick={goToPrevPage} disabled={currentLeftIndex <= -1} className="p-2 rounded-full bg-stone-200 hover:bg-indigo-500 hover:text-white text-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
                                <PrevIcon />
                            </button>
                            <button onClick={togglePlayPause} className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-colors duration-200 text-white shadow-lg">
                                {isPlaying ? <PauseIcon /> : <PlayIcon />}
                            </button>
                            <button onClick={goToNextPage} disabled={currentLeftIndex >= totalPages - 2} className="p-2 rounded-full bg-stone-200 hover:bg-indigo-500 hover:text-white text-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
                                <NextIcon />
                            </button>
                        </div>
                        <div className="text-center text-sm font-mono text-stone-600">
                            {renderPageNumber()}
                        </div>
                    </div>
                </footer>
            )}
        </div>
    );
};

const LoadingIndicator: React.FC<{ message: string }> = ({ message }) => (
    <div className="text-center flex flex-col items-center justify-center p-8">
        <svg className="animate-spin h-10 w-10 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="mt-4 text-lg text-stone-600 font-medium tracking-wide">{message || 'Loading...'}</p>
    </div>
);

const UploadPrompt: React.FC<{onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void}> = ({ onFileUpload }) => (
    <div className="text-center p-8 border-2 border-dashed border-gray-400 rounded-lg max-w-lg mx-auto bg-white shadow-sm">
        <UploadIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h2 className="mt-4 text-xl font-semibold text-gray-800">Upload Your Session</h2>
        <p className="mt-2 text-sm text-gray-500">Select images, PDFs, a video/audio file, or a previously exported ZIP package. Files will be sorted automatically.</p>
        <div className="mt-6">
            <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-stone-100">
                Select Files
            </label>
            <input id="file-upload" name="file-upload" type="file" multiple accept="image/*,application/pdf,application/zip,audio/*,video/mp4" className="sr-only" onChange={onFileUpload} />
        </div>
    </div>
);

interface SheetDisplayProps {
    pages: string[];
    leftIndex: number;
}

const SheetDisplay: React.FC<SheetDisplayProps> = ({ pages, leftIndex }) => {
    const totalPages = pages.length;
    const mobilePageIndex = leftIndex + 1;

    return (
        <div className="w-full h-full flex justify-center items-center md:gap-8">
            <div className="md:hidden w-full h-full flex justify-center items-center">
                {pages[mobilePageIndex] && (
                     <img src={pages[mobilePageIndex]} alt={`Sheet Music Page ${mobilePageIndex + 1}`} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white" />
                )}
            </div>
            <div className="hidden md:flex w-full h-full justify-center items-center gap-8">
                <div className="w-1/2 h-full flex justify-end items-center">
                    {leftIndex >= 0 && pages[leftIndex] && (
                        <img src={pages[leftIndex]} alt={`Sheet Music Page ${leftIndex + 1}`} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white" />
                    )}
                     {leftIndex === -1 && (
                        <div className="w-full h-full bg-stone-200/50 rounded-lg shadow-inner flex items-center justify-center text-stone-500">
                           <p>Beginning of Score</p>
                        </div>
                    )}
                </div>
                <div className="w-1/2 h-full flex justify-start items-center">
                    {leftIndex + 1 < totalPages && pages[leftIndex + 1] && (
                         <img src={pages[leftIndex + 1]} alt={`Sheet Music Page ${leftIndex + 2}`} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white" />
                    )}
                    {leftIndex + 1 >= totalPages && totalPages > 0 && (
                         <div className="w-full h-full bg-stone-200/50 rounded-lg shadow-inner flex items-center justify-center text-stone-500">
                            <p>End of Score</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;