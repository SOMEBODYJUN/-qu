import React, { useState } from 'react';

type MediaType = 'audio' | 'video' | null;

interface ConfigurationViewProps {
    pages: string[];
    initialIntervals: number[];
    onSave: (intervals: number[]) => void;
    onCancel: () => void;
    mediaSrc: string | null;
    mediaType: MediaType;
    mediaFile: File | null;
}

export const ConfigurationView: React.FC<ConfigurationViewProps> = ({ pages, initialIntervals, onSave, onCancel, mediaSrc, mediaType, mediaFile }) => {
    const [intervals, setIntervals] = useState<number[]>(initialIntervals);
    const [defaultInterval, setDefaultInterval] = useState<number>(30);

    const handleIntervalChange = (index: number, value: string) => {
        const newIntervals = [...intervals];
        newIntervals[index] = Math.max(1, parseInt(value, 10)) || 1;
        setIntervals(newIntervals);
    };

    const handleSetAll = () => {
        const newInterval = Math.max(1, defaultInterval);
        setIntervals(new Array(pages.length).fill(newInterval));
    };
    
    return (
        <div className="w-full h-screen flex flex-col p-4 bg-stone-100 text-stone-800">
            <header className="flex-shrink-0 mb-4 text-center">
                <h2 className="text-2xl font-bold text-stone-900">Configure Page Timings</h2>
                <p className="text-stone-500">Set the auto-scroll interval for each page. Use the media player to sync timings.</p>
            </header>

            <div className="flex-shrink-0 p-4 mb-4 bg-white rounded-lg shadow-sm border border-stone-200">
                <h3 className="font-bold text-lg mb-2 text-center text-stone-700">Media Preview</h3>
                {mediaType === 'video' && mediaSrc && (
                    <video src={mediaSrc} controls className="w-full max-h-64 rounded bg-black" />
                )}
                {mediaType === 'audio' && mediaSrc && (
                    <div className="w-full p-2">
                        <p className="text-center text-sm text-stone-600 mb-2 truncate">{mediaFile?.name}</p>
                        <audio src={mediaSrc} controls className="w-full" />
                    </div>
                )}
                {!mediaType && (
                    <p className="text-center text-stone-500 py-4">No media file uploaded. Set intervals manually.</p>
                )}
            </div>
            
            <div className="flex-shrink-0 p-4 mb-4 bg-white rounded-lg shadow-sm flex items-center justify-center gap-4 flex-wrap border border-stone-200">
                 <label htmlFor="default-interval" className="text-sm font-medium">Set all to:</label>
                 <input
                    type="number"
                    id="default-interval"
                    min="1"
                    value={defaultInterval}
                    onChange={(e) => setDefaultInterval(parseInt(e.target.value, 10))}
                    className="w-20 bg-stone-50 border border-stone-300 rounded-md px-2 py-1 text-center"
                 />
                 <span className="text-sm text-stone-500">seconds</span>
                 <button onClick={handleSetAll} className="px-4 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium">Apply to All</button>
            </div>

            <main className="flex-grow overflow-y-auto p-2 bg-stone-200/50 rounded-lg">
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {pages.map((page, index) => (
                        <li key={index} className="bg-white p-3 rounded-lg flex flex-col items-center shadow-md border border-stone-200">
                            <img src={page} alt={`Page ${index + 1}`} className="w-full h-40 object-contain mb-3 rounded border border-stone-300 bg-white"/>
                            <label htmlFor={`interval-${index}`} className="text-sm font-medium mb-1 text-stone-600">Page {index + 1} (s)</label>
                             <input
                                type="number"
                                id={`interval-${index}`}
                                min="1"
                                value={intervals[index] || ''}
                                onChange={(e) => handleIntervalChange(index, e.target.value)}
                                className="w-24 bg-stone-50 border border-stone-300 rounded-md px-2 py-1 text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </li>
                    ))}
                </ul>
            </main>
            
            <footer className="flex-shrink-0 mt-4 pt-4 border-t border-stone-200 flex justify-center gap-4">
                <button onClick={onCancel} className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md font-semibold transition-colors">Back to Upload</button>
                <button onClick={() => onSave(intervals)} className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md font-semibold transition-colors">Start Viewing</button>
            </footer>
        </div>
    );
};
