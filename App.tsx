import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UploadIcon, PlayIcon, PauseIcon, PrevIcon, NextIcon, ReconfigureIcon } from './components/icons';
import { ConfigurationView } from './components/ConfigurationView';

// Add type declaration for the pdf.js library loaded from a CDN
declare const pdfjsLib: any;

type AppState = 'upload' | 'configuring' | 'viewing';

const App: React.FC = () => {
    const [sheetPages, setSheetPages] = useState<string[]>([]);
    const [currentLeftIndex, setCurrentLeftIndex] = useState<number>(-1);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const [appState, setAppState] = useState<AppState>('upload');
    const [pageIntervals, setPageIntervals] = useState<number[]>([]);
    const timerRef = useRef<number | null>(null);

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

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files) return;
        setIsLoading(true);
        setLoadingMessage('Preparing files...');
        handleBackToUpload(true); // Clear previous state before loading new files

        const sortedFiles = [...event.target.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        const allPageUrls: string[] = [];
        for (const file of sortedFiles) {
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
        setSheetPages(allPageUrls);
        setPageIntervals(new Array(allPageUrls.length).fill(30));
        setAppState('configuring');
        setIsLoading(false);
        setLoadingMessage('');
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
        setSheetPages([]);
        setPageIntervals([]);
        setCurrentLeftIndex(-1);
        setIsPlaying(false);
        if (!silent) {
           setAppState('upload');
        }
    };

    const totalPages = sheetPages.length;

    const goToNextPage = useCallback(() => {
        if (totalPages === 0) return;
        setCurrentLeftIndex(prev => {
            if (prev + 2 < totalPages) {
                return prev + 1;
            }
            setIsPlaying(false);
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
                setIsPlaying(false);
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
        };
    }, [sheetPages]);

    const togglePlayPause = () => {
        if (totalPages > 0) {
            setIsPlaying(!isPlaying);
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
            <div className="flex flex-col h-screen bg-gray-900 text-white font-sans justify-center items-center">
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
        />;
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white font-sans">
            <header className="p-4 bg-gray-800/50 backdrop-blur-sm shadow-lg text-center z-20 flex justify-between items-center">
                <button onClick={() => handleBackToUpload()} className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-md text-sm font-semibold">
                    New Score
                </button>
                <h1 className="text-xl font-bold tracking-wider absolute left-1/2 -translate-x-1/2">Sheet Music Viewer</h1>
                 <button onClick={() => setAppState('configuring')} className="flex items-center gap-2 px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold">
                    <ReconfigureIcon />
                    <span>Reconfigure</span>
                </button>
            </header>

            <main className="flex-grow flex justify-center items-center p-4 overflow-hidden relative">
                {appState === 'upload' ? (
                    <UploadPrompt onFileUpload={handleFileUpload} />
                ) : (
                    <SheetDisplay pages={sheetPages} leftIndex={currentLeftIndex} />
                )}
            </main>

            {appState === 'viewing' && sheetPages.length > 0 && (
                 <footer className="sticky bottom-0 bg-gray-800/70 backdrop-blur-sm p-4 z-20 shadow-inner-top">
                    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                            <button onClick={goToPrevPage} disabled={currentLeftIndex <= -1} className="p-2 rounded-full bg-gray-700 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
                                <PrevIcon />
                            </button>
                            <button onClick={togglePlayPause} className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-colors duration-200 text-white shadow-lg">
                                {isPlaying ? <PauseIcon /> : <PlayIcon />}
                            </button>
                            <button onClick={goToNextPage} disabled={currentLeftIndex >= totalPages - 2} className="p-2 rounded-full bg-gray-700 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200">
                                <NextIcon />
                            </button>
                        </div>
                        <div className="text-center text-sm font-mono text-gray-300">
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
        <svg className="animate-spin h-10 w-10 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="mt-4 text-lg text-gray-300 font-medium tracking-wide">{message || 'Loading...'}</p>
    </div>
);

const UploadPrompt: React.FC<{onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void}> = ({ onFileUpload }) => (
    <div className="text-center p-8 border-2 border-dashed border-gray-600 rounded-lg max-w-md mx-auto">
        <UploadIcon className="mx-auto h-12 w-12 text-gray-500" />
        <h2 className="mt-4 text-xl font-semibold text-gray-300">Upload Your Sheet Music</h2>
        <p className="mt-2 text-sm text-gray-400">Select image files or PDF documents. They will be sorted by name automatically.</p>
        <div className="mt-6">
            <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-900">
                Select Files
            </label>
            <input id="file-upload" name="file-upload" type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={onFileUpload} />
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
                     <img src={pages[mobilePageIndex]} alt={`Sheet Music Page ${mobilePageIndex + 1}`} className="max-w-full max-h-full object-contain rounded-md shadow-2xl" />
                )}
            </div>
            <div className="hidden md:flex w-full h-full justify-center items-center gap-8">
                <div className="w-1/2 h-full flex justify-end items-center">
                    {leftIndex >= 0 && pages[leftIndex] && (
                        <img src={pages[leftIndex]} alt={`Sheet Music Page ${leftIndex + 1}`} className="max-w-full max-h-full object-contain rounded-md shadow-2xl" />
                    )}
                     {leftIndex === -1 && (
                        <div className="w-full h-full bg-gray-800 rounded-md shadow-inner flex items-center justify-center text-gray-500">
                           <p>Beginning of Score</p>
                        </div>
                    )}
                </div>
                <div className="w-1/2 h-full flex justify-start items-center">
                    {leftIndex + 1 < totalPages && pages[leftIndex + 1] && (
                         <img src={pages[leftIndex + 1]} alt={`Sheet Music Page ${leftIndex + 2}`} className="max-w-full max-h-full object-contain rounded-md shadow-2xl" />
                    )}
                    {leftIndex + 1 >= totalPages && totalPages > 0 && (
                         <div className="w-full h-full bg-gray-800 rounded-md shadow-inner flex items-center justify-center text-gray-500">
                            <p>End of Score</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;