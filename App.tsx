
import React, { useState, useCallback, useRef, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import LensOverlay from './components/LensOverlay';
import { performOCR } from './services/geminiService';
import { generateDocx } from './services/docxService';
import { PageResult, OCRBlock, DocumentResult } from './types';

const pdfjsLib = (window as any).pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

type View = 'home' | 'workspace' | 'about' | 'contact' | 'faq' | 'privacy' | 'processing';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<DocumentResult | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [exportMode, setExportMode] = useState<'selected' | 'all'>('all');
  
  const cancelRef = useRef<boolean>(false);

  // Scroll to top on view change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentView]);

  const processFiles = async (files: File[]) => {
    setIsLoading(true);
    setError(null);
    setResults(null);
    cancelRef.current = false;
    setCurrentView('processing');
    setProgress('Initializing OmniLex Intelligence...');

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
        setCurrentView('workspace');
      } else {
        setCurrentView('home');
      }
    } catch (err: any) {
      console.error(err);
      setError("Rapid Extraction Failed. Please check network/API key.");
      setCurrentView('home');
    } finally {
      setIsLoading(false);
      setProgress('');
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setProgress('Operation Cancelled.');
    setCurrentView('home');
    setIsLoading(false);
  };

  const toggleBlockSelection = (blockId: string) => {
    setSelectedBlockId(blockId);
    setResults(prev => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      const page = { ...newPages[activePageIndex] };
      const blockIndex = page.blocks.findIndex(b => b.id === blockId);
      if (blockIndex !== -1) {
        const block = { ...page.blocks[blockIndex] };
        block.isSelected = !block.isSelected;
        page.blocks = [...page.blocks];
        page.blocks[blockIndex] = block;
        newPages[activePageIndex] = page;
      }
      return { ...prev, pages: newPages };
    });
  };

  const handleAreaSelection = (box: { xmin: number; ymin: number; xmax: number; ymax: number }) => {
    setResults(prev => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      const page = { ...newPages[activePageIndex] };
      page.blocks = page.blocks.map(block => {
        const [bymin, bxmin, bymax, bxmax] = block.box_2d;
        const isInside = (bxmin >= box.xmin && bxmax <= box.xmax && bymin >= box.ymin && bymax <= box.ymax);
        if (isInside) return { ...block, isSelected: true };
        return block;
      });
      newPages[activePageIndex] = page;
      return { ...prev, pages: newPages };
    });
  };

  const setAllSelection = (selected: boolean) => {
    setResults(prev => {
      if (!prev) return null;
      const newPages = [...prev.pages];
      const page = { ...newPages[activePageIndex] };
      page.blocks = page.blocks.map(b => ({ ...b, isSelected: selected }));
      newPages[activePageIndex] = page;
      return { ...prev, pages: newPages };
    });
  };

  const handleExport = async () => {
    if (!results) return;
    setIsLoading(true);
    const oldView = currentView;
    setCurrentView('processing');
    setProgress('Generating Professional DOCX...');
    await generateDocx(results.pages, exportMode === 'all');
    setIsLoading(false);
    setProgress('');
    setCurrentView(oldView);
  };

  const activePage = results?.pages[activePageIndex];

  // --- Sub-components for views ---

  const Header = () => (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shrink-0 shadow-sm">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('home')}>
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
        <nav className="hidden md:flex gap-6">
          <button onClick={() => setCurrentView('home')} className={`text-sm font-bold ${currentView === 'home' ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}>Home</button>
          <button onClick={() => setCurrentView('about')} className={`text-sm font-bold ${currentView === 'about' ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}>About</button>
          <button onClick={() => setCurrentView('faq')} className={`text-sm font-bold ${currentView === 'faq' ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}>FAQ</button>
          <button onClick={() => setCurrentView('contact')} className={`text-sm font-bold ${currentView === 'contact' ? 'text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}>Contact</button>
        </nav>
      </div>
      
      {results && currentView === 'workspace' && (
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
          <button onClick={() => { setResults(null); setCurrentView('home'); }} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </header>
  );

  const Footer = () => (
    <footer className="bg-white border-t border-gray-200 py-12 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="col-span-1 md:col-span-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-600 p-1.5 rounded shadow">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-black tracking-tight text-gray-900">OmniLex OCR</h2>
          </div>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Professional document digitization powered by Suresh Pangeni's specialized AI stack. 
            Empowering users to process complex scripts with 99% accuracy.
          </p>
          <div className="flex gap-4">
             <a href="https://facebook.com/pangeni.suresh" target="_blank" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors font-bold">f</a>
             <a href="https://twitter.com/sureshpangeni" target="_blank" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors font-bold">t</a>
             <a href="https://linkedin.com/in/sureshpangeni" target="_blank" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors font-bold">in</a>
          </div>
        </div>
        <div>
          <h4 className="font-black text-xs uppercase tracking-widest text-gray-400 mb-6">Platform</h4>
          <ul className="space-y-4 text-sm font-bold text-gray-600">
            <li className="cursor-pointer hover:text-indigo-600" onClick={() => setCurrentView('home')}>Home</li>
            <li className="cursor-pointer hover:text-indigo-600" onClick={() => setCurrentView('about')}>About Us</li>
            <li className="cursor-pointer hover:text-indigo-600" onClick={() => setCurrentView('faq')}>FAQ</li>
            <li className="cursor-pointer hover:text-indigo-600" onClick={() => setCurrentView('contact')}>Contact</li>
          </ul>
        </div>
        <div>
          <h4 className="font-black text-xs uppercase tracking-widest text-gray-400 mb-6">Legal</h4>
          <ul className="space-y-4 text-sm font-bold text-gray-600">
            <li className="cursor-pointer hover:text-indigo-600" onClick={() => setCurrentView('privacy')}>Privacy Policy</li>
            <li className="cursor-pointer hover:text-indigo-600">Terms of Service</li>
            <li className="cursor-pointer hover:text-indigo-600">Security Standard</li>
          </ul>
        </div>
        <div>
          <h4 className="font-black text-xs uppercase tracking-widest text-gray-400 mb-6">Contact</h4>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            Direct questions to Suresh Pangeni's team.
          </p>
          <div className="space-y-2">
            <a href="mailto:info@sureshpangeni.com.np" className="text-sm font-black text-indigo-600 block hover:underline">info@sureshpangeni.com.np</a>
            <a href="tel:+9779868479999" className="text-sm font-black text-gray-900 block hover:underline">+977 9868479999</a>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto border-t border-gray-100 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-[10px] font-black text-gray-400 tracking-widest uppercase">© 2025 sureshpangeni.com.np. ALL RIGHTS RESERVED.</p>
        <div className="flex gap-6 text-[10px] font-black text-gray-400 tracking-widest">
           <a href="https://sureshpangeni.com.np" className="hover:text-indigo-600">VISIT OFFICIAL SITE</a>
        </div>
      </div>
    </footer>
  );

  const ProcessingScreen = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-10 bg-gray-50 animate-in fade-in duration-500">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-indigo-100 rounded-full mx-auto"></div>
          <div className="w-24 h-24 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin absolute top-0 left-1/2 -translate-x-1/2"></div>
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-black text-gray-900">Processing Document</h2>
          <p className="text-indigo-600 font-bold text-lg animate-pulse">{progress}</p>
          <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
             <div className="h-full bg-indigo-600 animate-[loading_2s_infinite]"></div>
          </div>
        </div>
        <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-3">
          <p className="text-sm text-gray-500 font-medium leading-relaxed">
            Our AI is currently performing layout analysis and text reconstruction. This may take a few moments for large PDF files.
          </p>
          <button 
            onClick={handleCancel} 
            className="text-xs text-red-500 font-bold underline hover:text-red-700 transition-colors p-2"
          >
            CANCEL CURRENT TASK
          </button>
        </div>
      </div>
    </div>
  );

  const LandingPage = () => (
    <div className="flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero Section */}
      <section className="bg-white py-24 px-6 relative overflow-hidden">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-indigo-50 px-4 py-1.5 rounded-full text-indigo-600 text-xs font-black uppercase tracking-widest mb-8">
            <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
            Professional OCR Engine
          </div>
          <h1 className="text-6xl md:text-7xl font-black text-gray-900 mb-8 leading-tight nepali-font">
            Make Any Document <br/> <span className="text-indigo-600">Perfectly Digital.</span>
          </h1>
          <p className="text-xl text-gray-500 mb-12 max-w-2xl mx-auto leading-relaxed">
            High-precision OCR with specialized support for Devanagari (Nepali/Hindi) and 100+ global languages. Digitally transform your files into editable DOCX instantly.
          </p>
          
          <div className="max-w-xl mx-auto mb-16">
            <FileUpload onFilesSelected={processFiles} isLoading={isLoading} />
          </div>
        </div>
        
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-100/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 -right-20 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl"></div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-gray-900 mb-4 uppercase tracking-tight">Enterprise Capabilities</h2>
            <div className="w-20 h-1.5 bg-indigo-600 mx-auto rounded-full"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-4">Table Extraction</h3>
              <p className="text-gray-500 leading-relaxed">Detects and reconstructs complex table structures into editable Word tables with high accuracy.</p>
            </div>
            
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-4">Precision Selection</h3>
              <p className="text-gray-500 leading-relaxed">Drag to select specific areas or click blocks to toggle extraction. You decide exactly what gets digitized.</p>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-4">Devanagari Mastered</h3>
              <p className="text-gray-500 leading-relaxed">Advanced logic for Nepali and Hindi conjuncts ensuring professional Unicode standard output.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const AboutPage = () => (
    <div className="max-w-4xl mx-auto py-24 px-6 animate-in fade-in duration-500">
      <h1 className="text-5xl font-black text-gray-900 mb-8">About OmniLex</h1>
      <p className="text-xl text-gray-600 mb-12 leading-relaxed">
        OmniLex OCR is a specialized tool integrated into the Suresh Pangeni ecosystem. It addresses the gap in accurate Devanagari digitization by combining state-of-the-art AI with custom post-processing algorithms.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
        <div>
          <h3 className="text-2xl font-black mb-4">Our Goal</h3>
          <p className="text-gray-600 leading-relaxed">
            To provide precise document conversion for researchers, legal professionals, and students who work with multilingual documents.
          </p>
        </div>
        <div>
          <h3 className="text-2xl font-black mb-4">Technology Stack</h3>
          <p className="text-gray-600 leading-relaxed">
            Built using React, PDF.js, and Google's Gemini Flash, optimized for speed and structural accuracy.
          </p>
        </div>
      </div>
      <div className="bg-indigo-50 p-10 rounded-3xl border border-indigo-100">
        <h3 className="text-2xl font-black text-indigo-900 mb-4">Trusted Access</h3>
        <p className="text-indigo-700 leading-relaxed">
          OmniLex is used for complex digitization tasks where layout preservation is as critical as text accuracy.
        </p>
      </div>
    </div>
  );

  const FAQPage = () => (
    <div className="max-w-4xl mx-auto py-24 px-6 animate-in fade-in duration-500">
      <h1 className="text-5xl font-black text-gray-900 mb-12 text-center">Frequently Asked Questions</h1>
      <div className="space-y-6">
        {[
          { q: "Is it free to use?", a: "OmniLex is currently available for public use on sureshpangeni.com.np as a professional tool demonstration." },
          { q: "How accurate is the Nepali OCR?", a: "Our engine achieves over 99% accuracy for printed Devanagari text, handling complex conjuncts flawlessly." },
          { q: "Does it support handwritten notes?", a: "Clear handwriting is supported, though results may vary depending on the legibility of the script." },
          { q: "Are my files secure?", a: "Yes. Files are processed in real-time and deleted immediately after your session ends." }
        ].map((item, idx) => (
          <div key={idx} className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-black text-gray-900 mb-3">{item.q}</h3>
            <p className="text-gray-500 leading-relaxed">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const ContactPage = () => {
    const [submitted, setSubmitted] = useState(false);
    return (
      <div className="max-w-4xl mx-auto py-24 px-6 animate-in fade-in duration-500">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-black text-gray-900 mb-4">Contact Support</h1>
          <p className="text-xl text-gray-500">Need help? Send us a message or reach out via phone.</p>
        </div>
        
        {submitted ? (
          <div className="bg-green-50 p-12 rounded-3xl text-center border border-green-100">
            <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-6">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-3xl font-black text-green-900 mb-2">Message Received</h2>
            <p className="text-green-700 font-bold uppercase tracking-widest text-xs">We will contact you shortly</p>
            <button onClick={() => setSubmitted(false)} className="mt-8 text-green-600 font-bold underline">Send another message</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2">
              <form className="space-y-6 bg-white p-10 rounded-3xl shadow-xl border border-gray-100" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Full Name</label>
                    <input required type="text" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Enter your name" />
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Email Address</label>
                    <input required type="email" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="info@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Message</label>
                  <textarea required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none h-40" placeholder="Describe your issue or query"></textarea>
                </div>
                <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black text-lg shadow-lg hover:bg-indigo-700 transition-all active:scale-[0.98]">SEND ENQUIRY</button>
              </form>
            </div>
            <div className="space-y-8">
               <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-100">
                  <h3 className="text-lg font-black mb-6 uppercase tracking-widest">Office Info</h3>
                  <div className="space-y-6">
                    <div>
                      <span className="text-xs font-bold text-indigo-200 uppercase block mb-1">Support Email</span>
                      <p className="font-bold">info@sureshpangeni.com.np</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-indigo-200 uppercase block mb-1">Support Phone</span>
                      <p className="font-bold">+977 9868479999</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-indigo-200 uppercase block mb-1">Official Web</span>
                      <p className="font-bold">sureshpangeni.com.np</p>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const PrivacyPage = () => (
    <div className="max-w-4xl mx-auto py-24 px-6 animate-in fade-in duration-500">
      <h1 className="text-5xl font-black text-gray-900 mb-12">Privacy Policy</h1>
      <div className="prose prose-indigo max-w-none text-gray-600 space-y-8">
        <section>
          <h2 className="text-2xl font-black text-gray-900 mb-4">1. Data Commitment</h2>
          <p className="leading-relaxed">
            OmniLex OCR prioritizes user data integrity. We do not store, index, or sell the content of your uploaded documents. 
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-black text-gray-900 mb-4">2. Processing Flow</h2>
          <p className="leading-relaxed">
            All document processing is handled through encrypted sessions. Gemini Pro endpoints used for extraction are configured to discard data immediately after response generation.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-black text-gray-900 mb-4">3. Security</h2>
          <p className="leading-relaxed">
            Suresh Pangeni's digital infrastructure employs HTTPS-only protocols to ensure your data remains confidential between your device and our processing unit.
          </p>
        </section>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
      <Header />

      <main className={`flex-1 overflow-hidden ${currentView === 'workspace' ? 'flex' : 'block'}`}>
        {currentView === 'home' && <LandingPage />}
        {currentView === 'about' && <AboutPage />}
        {currentView === 'contact' && <ContactPage />}
        {currentView === 'faq' && <FAQPage />}
        {currentView === 'privacy' && <PrivacyPage />}
        {currentView === 'processing' && <ProcessingScreen />}
        
        {currentView === 'workspace' && results && (
          <div className="flex-1 flex overflow-hidden animate-in fade-in duration-300">
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
              <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-6 py-3 rounded-full shadow-2xl border border-gray-200 flex gap-6 text-[10px] font-black tracking-widest uppercase items-center">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-indigo-600 rounded-sm"></span>
                  Drag to select area
                </span>
                <span className="text-gray-300">|</span>
                <button onClick={() => setAllSelection(true)} className="text-indigo-600 hover:text-indigo-800">Select All</button>
                <button onClick={() => setAllSelection(false)} className="text-gray-400 hover:text-gray-600">Clear</button>
              </div>
            </div>

            <aside className="w-[480px] border-l border-gray-200 bg-white flex flex-col shrink-0">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="font-black text-gray-800 text-xs">EXTRACTION PREVIEW</h3>
                <span className="text-[10px] bg-indigo-100 text-indigo-600 px-3 py-1 rounded-full font-black">
                  {activePage?.blocks.filter(b => b.isSelected).length} SELECTED
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-gray-50/30">
                {activePage?.blocks.map((block) => (
                  <div 
                    key={block.id}
                    onClick={() => setSelectedBlockId(block.id)}
                    className={`p-5 rounded-2xl border-2 transition-all ${selectedBlockId === block.id ? 'border-indigo-400 bg-white shadow-xl translate-x-[-4px]' : 'border-white bg-white shadow-sm'} ${!block.isSelected && 'opacity-40 grayscale'}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                       <input type="checkbox" checked={!!block.isSelected} onChange={() => toggleBlockSelection(block.id)} className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer" />
                       <div className="flex items-center gap-2">
                         <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${block.type === 'table' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-50 text-indigo-500'}`}>
                           {block.type}
                         </span>
                       </div>
                    </div>
                    <textarea
                      className="w-full text-sm text-gray-800 bg-transparent focus:outline-none nepali-font leading-relaxed resize-none border-0 p-0"
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
      
      {currentView !== 'workspace' && currentView !== 'processing' && <Footer />}
    </div>
  );
};

export default App;
