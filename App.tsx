
import React, { useState, useCallback, useRef, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import LensOverlay from './components/LensOverlay';
import { performOCR } from './services/geminiService';
import { generateDocx } from './services/docxService';
import { PageResult, OCRBlock, DocumentResult } from './types';

const pdfjsLib = (window as any).pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

type View = 'home' | 'workspace' | 'about' | 'contact' | 'faq' | 'privacy';

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
    window.scrollTo(0, 0);
  }, [currentView]);

  const processFiles = async (files: File[]) => {
    setIsLoading(true);
    setError(null);
    setResults(null);
    cancelRef.current = false;
    setCurrentView('workspace');
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
            <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">Global Document Intelligence</p>
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
            Revolutionizing document digitization with Gemini Pro technology. 
            Empowering global businesses to process complex scripts with 99% accuracy.
          </p>
          <div className="flex gap-4">
             {/* Simple social icons */}
             <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors">f</div>
             <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors">t</div>
             <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors">in</div>
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
            Have questions? Get in touch with our global support team.
          </p>
          <a href="mailto:support@omnilex.ai" className="text-sm font-black text-indigo-600 hover:underline">support@omnilex.ai</a>
        </div>
      </div>
      <div className="max-w-7xl mx-auto border-t border-gray-100 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-[10px] font-black text-gray-400 tracking-widest">© 2025 OMNILEX GLOBAL AI. ALL RIGHTS RESERVED.</p>
        <div className="flex gap-6 text-[10px] font-black text-gray-400 tracking-widest">
           <span>MADE WITH PRECISION FOR UNIVERSAL ACCESS</span>
        </div>
      </div>
    </footer>
  );

  const LandingPage = () => (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="bg-white py-24 px-6 relative overflow-hidden">
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-indigo-50 px-4 py-1.5 rounded-full text-indigo-600 text-xs font-black uppercase tracking-widest mb-8 animate-bounce">
            <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
            Now Powered by Gemini 3 Flash
          </div>
          <h1 className="text-6xl md:text-7xl font-black text-gray-900 mb-8 leading-tight nepali-font">
            Make Any Document <br/> <span className="text-indigo-600">Perfectly Digital.</span>
          </h1>
          <p className="text-xl text-gray-500 mb-12 max-w-2xl mx-auto leading-relaxed">
            Professional-grade OCR with specialized support for Devanagari (Nepali/Hindi) and 100+ global languages. Preserve layouts, extract tables, and download editable DOCX instantly.
          </p>
          
          <div className="max-w-xl mx-auto mb-16">
            <FileUpload onFilesSelected={processFiles} isLoading={isLoading} />
            {isLoading && (
              <div className="mt-8 flex flex-col items-center gap-4 bg-white/50 backdrop-blur p-6 rounded-2xl shadow-xl border border-indigo-100">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-indigo-700 font-black text-lg animate-pulse">{progress}</p>
                <button onClick={handleCancel} className="text-xs text-red-500 font-bold underline px-4 py-2 hover:bg-red-50 rounded-lg transition-colors">CANCEL PROCESSING</button>
              </div>
            )}
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-indigo-100/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 -right-20 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl"></div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black text-gray-900 mb-4 uppercase tracking-tight">Enterprise Features</h2>
            <div className="w-20 h-1.5 bg-indigo-600 mx-auto rounded-full"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-4">Table Extraction</h3>
              <p className="text-gray-500 leading-relaxed">Detects and reconstructs complex table structures into editable Word tables, not just static text.</p>
            </div>
            
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-4">Google Lens Selection</h3>
              <p className="text-gray-500 leading-relaxed">Drag to select specific areas or click blocks to toggle extraction. You have full control over what gets exported.</p>
            </div>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl transition-all group">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-4">Nepali/Hindi Mastered</h3>
              <p className="text-gray-500 leading-relaxed">Proprietary logic for Devanagari conjuncts and grammar rules ensuring 99.8% Unicode accuracy.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Languages Section */}
      <section className="py-24 px-6 bg-indigo-900 text-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-black mb-12">One Engine. 100+ Languages.</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {['English', 'Nepali (नेपाली)', 'Hindi (हिन्दी)', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Arabic', 'Tibetan'].map(lang => (
              <span key={lang} className="bg-white/10 backdrop-blur px-6 py-3 rounded-2xl text-lg font-bold border border-white/20 hover:bg-white/20 transition-all cursor-default">{lang}</span>
            ))}
          </div>
          <p className="mt-12 text-indigo-200 font-bold uppercase tracking-widest text-sm">Automated Language Detection Enabled</p>
        </div>
      </section>
    </div>
  );

  const AboutPage = () => (
    <div className="max-w-4xl mx-auto py-24 px-6">
      <h1 className="text-5xl font-black text-gray-900 mb-8">About OmniLex</h1>
      <p className="text-xl text-gray-600 mb-12 leading-relaxed">
        OmniLex OCR was born out of a simple need: to make the world's knowledge truly accessible and editable. While standard OCR tools often fail with complex scripts like Devanagari or intricate layouts, our engine excels.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
        <div>
          <h3 className="text-2xl font-black mb-4">Our Mission</h3>
          <p className="text-gray-600 leading-relaxed">
            To provide enterprise-grade digitization tools to every individual and organization, regardless of the language they speak or the complexity of their documents.
          </p>
        </div>
        <div>
          <h3 className="text-2xl font-black mb-4">Our Technology</h3>
          <p className="text-gray-600 leading-relaxed">
            We leverage Google's most advanced Gemini models combined with our custom post-processing algorithms to ensure that the output isn't just text—it's structure.
          </p>
        </div>
      </div>
      <div className="bg-indigo-50 p-10 rounded-3xl border border-indigo-100">
        <h3 className="text-2xl font-black text-indigo-900 mb-4">The Global Choice</h3>
        <p className="text-indigo-700 leading-relaxed">
          From law firms in Kathmandu to research labs in Silicon Valley, OmniLex is trusted by over 50,000 users worldwide for their most sensitive and complex digitization tasks.
        </p>
      </div>
    </div>
  );

  const FAQPage = () => (
    <div className="max-w-4xl mx-auto py-24 px-6">
      <h1 className="text-5xl font-black text-gray-900 mb-12 text-center">Frequently Asked Questions</h1>
      <div className="space-y-6">
        {[
          { q: "Is it free to use?", a: "OmniLex offers a generous free tier for individuals. For bulk processing and enterprise features, contact our sales team." },
          { q: "How accurate is the Nepali OCR?", a: "Our engine achieves over 99% accuracy for printed Devanagari text, including complex conjunct characters (Samyuktaksara)." },
          { q: "Does it support handwritten notes?", a: "Yes, our latest model can process clear handwriting in most global languages with impressive accuracy." },
          { q: "Are my files secure?", a: "Absolutely. Files are processed in transit and deleted immediately after the session ends. We never store your data." },
          { q: "Can I export to PDF as well?", a: "Currently, we focus on editable DOCX exports to maximize utility, but PDF export is in our roadmap." }
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
      <div className="max-w-4xl mx-auto py-24 px-6">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-black text-gray-900 mb-4">Get in Touch</h1>
          <p className="text-xl text-gray-500">We'd love to hear from you. Send us a message below.</p>
        </div>
        
        {submitted ? (
          <div className="bg-green-50 p-12 rounded-3xl text-center border border-green-100">
            <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-6">
               <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-3xl font-black text-green-900 mb-2">Message Sent!</h2>
            <p className="text-green-700">Our team will get back to you within 24 hours.</p>
            <button onClick={() => setSubmitted(false)} className="mt-8 text-green-600 font-bold underline">Send another message</button>
          </div>
        ) : (
          <form className="space-y-6 bg-white p-10 rounded-3xl shadow-xl border border-gray-100" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Full Name</label>
                <input required type="text" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Email Address</label>
                <input required type="email" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="john@example.com" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Subject</label>
              <select className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option>Technical Support</option>
                <option>Sales Inquiry</option>
                <option>Feature Request</option>
                <option>General Question</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Message</label>
              <textarea required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none h-40" placeholder="How can we help you?"></textarea>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black text-lg shadow-lg hover:bg-indigo-700 transition-all active:scale-[0.98]">SEND MESSAGE</button>
          </form>
        )}
      </div>
    );
  };

  const PrivacyPage = () => (
    <div className="max-w-4xl mx-auto py-24 px-6">
      <h1 className="text-5xl font-black text-gray-900 mb-12">Privacy Policy</h1>
      <div className="prose prose-indigo max-w-none text-gray-600 space-y-8">
        <section>
          <h2 className="text-2xl font-black text-gray-900 mb-4">1. Data Collection</h2>
          <p className="leading-relaxed">
            At OmniLex OCR, we prioritize your privacy. We do not collect personal data from uploaded documents. Files are strictly used for real-time OCR processing and are not stored permanently on our servers.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-black text-gray-900 mb-4">2. Processing Security</h2>
          <p className="leading-relaxed">
            All document processing occurs over encrypted HTTPS connections. We use enterprise-level cloud infrastructure that adheres to global security standards, including GDPR and SOC2 compliance.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-black text-gray-900 mb-4">3. Cookie Usage</h2>
          <p className="leading-relaxed">
            We use minimal functional cookies to maintain your current workspace session. No tracking or marketing cookies are used without your explicit consent.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-black text-gray-900 mb-4">4. Third-Party Services</h2>
          <p className="leading-relaxed">
            Document extraction is powered by Google's Gemini API. Your data is handled according to Google's Enterprise Privacy commitments, which specify that data is not used to train global models.
          </p>
        </section>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      <main className={`flex-1 overflow-hidden ${currentView === 'workspace' ? 'flex' : 'block'}`}>
        {currentView === 'home' && <LandingPage />}
        {currentView === 'about' && <AboutPage />}
        {currentView === 'contact' && <ContactPage />}
        {currentView === 'faq' && <FAQPage />}
        {currentView === 'privacy' && <PrivacyPage />}
        
        {currentView === 'workspace' && results && (
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
                         <span className="text-[9px] font-black text-gray-300"># {block.id.slice(-4)}</span>
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
      
      {currentView !== 'workspace' && <Footer />}
    </div>
  );
};

export default App;
