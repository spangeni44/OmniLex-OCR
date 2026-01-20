
import React, { useState, useCallback, useRef } from 'react';
import FileUpload from './components/FileUpload';
import LensOverlay from './components/LensOverlay';
import { performOCR } from './services/geminiService';
import { generateDocx } from './services/docxService';
import { PageResult, OCRBlock, DocumentResult } from './types';

const pdfjsLib = (window as any).pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<DocumentResult | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<'selected' | 'all'>('all');
  
  const cancelRef = useRef<boolean>(false);

  const processFiles = async (files: File[]) => {
    setIsLoading(true);
    setError(null);
    setResults(null);
    cancelRef.current = false;
    setProgress('OmniLex Engine v3.2 Initializing...');

    try {
      const allPages: PageResult[] = [];
      
      for (const file of files) {
        if (cancelRef.current) break;

        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          
          for (let i = 1; i <= pdf.numPages; i++) {
            if (cancelRef.current) break;
            setProgress(`Scanning PDF Page ${i}/${pdf.numPages}...`);
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d')!;
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({ canvasContext: context, viewport }).promise;
            const imageData = canvas.toDataURL('image/jpeg', 0.85);
            
            const blocks = await performOCR(imageData, 'image/jpeg');
            allPages.push({
              pageNumber: allPages.length + 1,
              imageUrl: imageData,
              blocks,
              width: viewport.width,
              height: viewport.height
            });
          }
        } else if (file.type.startsWith('image/')) {
          setProgress(`Processing ${file.name}...`);
          const reader = new FileReader();
          const imageData = await new Promise<string>((resolve) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
          });
          
          const blocks = await performOCR(imageData, file.type);
          allPages.push({
            pageNumber: allPages.length + 1,
            imageUrl: imageData,
            blocks,
            width: 0,
            height: 0
          });
        }
      }

      if (!cancelRef.current) {
        setResults({ fileName: files[0].name, pages: allPages });
      }
    } catch (err: any) {
      console.error(err);
      setError("Rapid Extraction Failed. Please check network/API key.");
    } finally {
      setIsLoading(false);
      setProgress('');
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setProgress('Operation Cancelled.');
  };

  const toggleBlockSelection = (blockId: string) => {
    setSelectedBlockId(blockId);
    setResults(prev => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      const block = newPages[activePageIndex].blocks.find(b => b.id === blockId);
      if (block) block.isSelected = !block.isSelected;
      return { ...prev, pages: newPages };
    });
  };

  const handleAreaSelection = (box: { xmin: number; ymin: number; xmax: number; ymax: number }) => {
    setResults(prev => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      const page = newPages[activePageIndex];
      page.blocks.forEach(block => {
        const [bymin, bxmin, bymax, bxmax] = block.box_2d;
        // Simple overlap check
        const isInside = (bxmin >= box.xmin && bxmax <= box.xmax && bymin >= box.ymin && bymax <= box.ymax);
        if (isInside) block.isSelected = true;
      });
      return { ...prev, pages: newPages };
    });
  };

  const setAllSelection = (selected: boolean) => {
    setResults(prev => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      newPages[activePageIndex].blocks.forEach(b => b.isSelected = selected);
      return { ...prev, pages: newPages };
    });
  };

  const handleExport = async () => {
    if (!results) return;
    setIsLoading(true);
    setProgress('Generating Professional DOCX...');
    await generateDocx(results.pages, exportMode === 'all');
    setIsLoading(false);
    setProgress('');
  };

  const activePage = results?.pages[activePageIndex];

  return (
    <div className="min-h-screen flex flex-col h-screen overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-gray-900">OmniLex OCR</h1>
            <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">Rapid Document Intelligence</p>
          </div>
        </div>
        
        {results && (
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button 
                onClick={() => setExportMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${exportMode === 'all' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
              >
                EXPORT ALL
              </button>
              <button 
                onClick={() => setExportMode('selected')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${exportMode === 'selected' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
              >
                ONLY SELECTED
              </button>
            </div>
            <button 
              onClick={handleExport}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95"
            >
              DOWNLOAD DOCX
            </button>
            <button onClick={() => setResults(null)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-hidden flex bg-gray-100">
        {!results ? (
          <div className="flex-1 flex flex-col items-center justify-center p-10">
            <div className="max-w-2xl w-full text-center">
              <h2 className="text-4xl font-black text-gray-900 mb-4 nepali-font">कागजातलाई डिजिटल बनाउनुहोस्</h2>
              <p className="text-gray-500 mb-8 text-lg">Instant OCR with Google Lens-style selection for global languages.</p>
              
              {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200">{error}</div>}
              
              <FileUpload onFilesSelected={processFiles} isLoading={isLoading} />
              
              {isLoading && (
                <div className="mt-8 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-indigo-700 font-bold animate-pulse">{progress}</p>
                  <button onClick={handleCancel} className="text-xs text-red-500 font-bold underline">CANCEL TASK</button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            <aside className="w-60 border-r border-gray-200 bg-white flex flex-col no-scrollbar overflow-y-auto p-4 gap-4 shrink-0">
              {results.pages.map((page, idx) => (
                <button
                  key={idx}
                  onClick={() => setActivePageIndex(idx)}
                  className={`relative rounded-xl overflow-hidden border-4 transition-all ${activePageIndex === idx ? 'border-indigo-600 shadow-lg' : 'border-transparent opacity-60'}`}
                >
                  <img src={page.imageUrl} alt={`Page ${idx + 1}`} className="w-full object-cover aspect-[3/4]" />
                  <div className="absolute top-2 left-2 bg-black/60 text-white text-[9px] px-2 py-1 rounded-md font-bold">PAGE {idx + 1}</div>
                </button>
              ))}
            </aside>

            <div className="flex-1 relative bg-gray-200 overflow-auto flex justify-center items-start p-8 no-scrollbar">
              <div className="relative shadow-2xl bg-white rounded-lg overflow-hidden">
                {activePage && (
                  <>
                    <img 
                      src={activePage.imageUrl} 
                      className="max-w-none block select-none pointer-events-none" 
                      style={{ height: '1200px', width: 'auto' }}
                    />
                    <LensOverlay 
                      blocks={activePage.blocks} 
                      onToggleBlock={toggleBlockSelection} 
                      onSelectArea={handleAreaSelection}
                      activeBlockId={selectedBlockId}
                    />
                  </>
                )}
              </div>
              <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-2xl border border-gray-200 flex gap-4 text-[10px] font-black tracking-widest uppercase">
                <span>Drag to select area</span>
                <span className="text-gray-300">|</span>
                <button onClick={() => setAllSelection(true)} className="text-indigo-600">Select All</button>
                <button onClick={() => setAllSelection(false)} className="text-gray-400">Clear</button>
              </div>
            </div>

            <aside className="w-[480px] border-l border-gray-200 bg-white flex flex-col shrink-0">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="font-black text-gray-800 text-xs">EXTRACTION PREVIEW</h3>
                <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded font-bold">
                  {activePage?.blocks.filter(b => b.isSelected).length} SELECTED
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-gray-50/30">
                {activePage?.blocks.map((block) => (
                  <div 
                    key={block.id}
                    onClick={() => setSelectedBlockId(block.id)}
                    className={`p-4 rounded-xl border-2 transition-all ${selectedBlockId === block.id ? 'border-indigo-400 bg-indigo-50/30 shadow-sm' : 'border-white bg-white shadow-sm'} ${!block.isSelected && 'opacity-40'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                       <input type="checkbox" checked={!!block.isSelected} onChange={() => toggleBlockSelection(block.id)} className="rounded text-indigo-600" />
                       <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{block.type}</span>
                    </div>
                    <textarea
                      className="w-full text-sm text-gray-800 bg-transparent focus:outline-none nepali-font leading-relaxed resize-none"
                      value={block.text}
                      rows={Math.max(1, block.text.split('\n').length)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setResults(prev => {
                          if (!prev) return null;
                          const newPages = [...prev.pages];
                          const b = newPages[activePageIndex].blocks.find(blk => blk.id === block.id);
                          if (b) b.text = val;
                          return { ...prev, pages: newPages };
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
