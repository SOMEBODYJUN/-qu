import React, { useState } from 'react';

interface ConfigurationViewProps {
    pages: string[];
    initialIntervals: number[];
    onSave: (intervals: number[]) => void;
    onCancel: () => void;
}

export const ConfigurationView: React.FC<ConfigurationViewProps> = ({ pages, initialIntervals, onSave, onCancel }) => {
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
        <div className="w-full h-screen flex flex-col p-4 bg-gray-900 text-white">
            <header className="flex-shrink-0 mb-4 text-center">
                <h2 className="text-2xl font-bold">Configure Page Timings</h2>
                <p className="text-gray-400">Set the auto-scroll interval for each page.</p>
            </header>
            
            <div className="flex-shrink-0 p-4 mb-4 bg-gray-800 rounded-lg flex items-center justify-center gap-4 flex-wrap">
                 <label htmlFor="default-interval" className="text-sm font-medium">Set all to:</label>
                 <input
                    type="number"
                    id="default-interval"
                    min="1"
                    value={defaultInterval}
                    onChange={(e) => setDefaultInterval(parseInt(e.target.value, 10))}
                    className="w-20 bg-gray-900 border border-gray-600 rounded-md px-2 py-1 text-center"
                 />
                 <span className="text-sm text-gray-400">seconds</span>
                 <button onClick={handleSetAll} className="px-4 py-1 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-medium">Apply to All</button>
            </div>

            <main className="flex-grow overflow-y-auto p-2">
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {pages.map((page, index) => (
                        <li key={index} className="bg-gray-800 p-3 rounded-lg flex flex-col items-center shadow-lg">
                            <img src={page} alt={`Page ${index + 1}`} className="w-full h-40 object-contain mb-3 rounded border border-gray-700"/>
                            <label htmlFor={`interval-${index}`} className="text-sm font-medium mb-1 text-gray-300">Page {index + 1} (s)</label>
                             <input
                                type="number"
                                id={`interval-${index}`}
                                min="1"
                                value={intervals[index] || ''}
                                onChange={(e) => handleIntervalChange(index, e.target.value)}
                                className="w-24 bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </li>
                    ))}
                </ul>
            </main>
            
            <footer className="flex-shrink-0 mt-4 pt-4 border-t border-gray-700 flex justify-center gap-4">
                <button onClick={onCancel} className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-md font-semibold transition-colors">Back to Upload</button>
                <button onClick={() => onSave(intervals)} className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-md font-semibold transition-colors">Start Viewing</button>
            </footer>
        </div>
    );
};
