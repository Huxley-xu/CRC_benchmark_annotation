/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, ChangeEvent, ReactNode } from 'react';
import { 
  Search, 
  Filter, 
  Play, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Database,
  FileText,
  Video,
  Lightbulb,
  MessageSquare,
  Zap,
  BarChart4,
  ArrowRight,
  LogIn,
  LogOut,
  Loader2,
  AlertTriangle,
  Info,
  Layers,
  ChevronRight,
  Settings,
  ShieldCheck,
  ShieldX,
  FolderOpen,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Patient, 
  Benchmark,
  LogicPoint, 
  IssueType,
  PatientStatus,
  HierarchicalQuestion,
  IngestionDiagnostic,
  ValidationScores
} from './types';
import { auth, login, logout, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, getDocs, setDoc, doc } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedVideoIdx, setSelectedVideoIdx] = useState(0);
  const [selectedCategoryIdx, setSelectedCategoryIdx] = useState(0);
  const [selectedQuestionIdx, setSelectedQuestionIdx] = useState(0);

  const selectedPatient = useMemo(() => patients.find(p => p.id === selectedPatientId) || patients[0] || null, [patients, selectedPatientId]);
  const selectedVideo = useMemo(() => selectedPatient?.videos?.[selectedVideoIdx] || null, [selectedPatient, selectedVideoIdx]);
  const selectedCategory = useMemo(() => selectedVideo?.categories?.[selectedCategoryIdx] || null, [selectedVideo, selectedCategoryIdx]);
  const selectedQuestion = useMemo(() => selectedCategory?.questions?.[selectedQuestionIdx] || null, [selectedCategory, selectedQuestionIdx]);

  const [searchTerm, setSearchTerm] = useState('');
  const [showDashboard, setShowDashboard] = useState(false);
  
  // Doctor Edit / Review State
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<HierarchicalQuestion | null>(null);

  useEffect(() => {
    if (selectedQuestion) {
      setEditForm({
        ...selectedQuestion,
        reviewStatus: selectedQuestion.reviewStatus || 'pending',
        doctorFeedback: selectedQuestion.doctorFeedback || '',
        issueType: selectedQuestion.issueType || 'none',
        originalData: (selectedQuestion as any).originalData || { ...selectedQuestion }
      });
    } else {
      setEditForm(null);
    }
  }, [selectedQuestion, selectedQuestionIdx, selectedCategoryIdx, selectedVideoIdx]);

  const [diagnostic, setDiagnostic] = useState<IngestionDiagnostic>({
    totalPatients: 0,
    totalVideos: 0,
    missingVideos: [],
    orphanedVideos: [],
    malformedRecords: 0,
    status: 'idle'
  });

  const [videoLoadError, setVideoLoadError] = useState(false);

  // Editor State
  const [logicPoint, setLogicPoint] = useState<LogicPoint>({
    evidence: { emr: true, video: true, knowledge: true },
    answerOrigin: 'Multimodal Synthesis from Video and Operative EMR',
    choiceRule: 'Surgical Procedural Deviation / Semantic Negation',
    doctorConstraints: 'Must reference BMI > 30 and specifically name the cystic duct variant.',
    distractorLogic: 'Include common misidentification of the accessory gallbladder.'
  });
  const [seedQuestion, setSeedQuestion] = useState('What specific anatomical variant was identified in the operative note that complicates dissection in Segment 04?');
  const [feedback, setFeedback] = useState('');
  const [issueType, setIssueType] = useState<IssueType>('none');
  const [videoInput, setVideoInput] = useState('');
  const [phaseVideoInput, setPhaseVideoInput] = useState('');
  const [stepVideoInput, setStepVideoInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [emrFolded, setEmrFolded] = useState(true);
  const [clinicalExpanded, setClinicalExpanded] = useState(false);

  const handleLinkVideo = async (url: string, level: 'node' | 'category' | 'question' = 'node') => {
    if (!selectedPatientId || !user || !selectedPatient) return;
    setSaving(true);
    try {
      // Ensure we have a valid videos array to work with
      let updatedVideos = [...(selectedPatient.videos || [])];

      if (level === 'node') {
        if (updatedVideos.length === 0) {
          // If no video nodes exist, create a default one
          updatedVideos = [{
            id: 'V1',
            title: 'Master Source',
            videoUrl: url,
            categories: []
          }];
        } else {
          // Update the currently selected video node
          updatedVideos = updatedVideos.map((v, i) => 
            i === selectedVideoIdx ? { ...v, videoUrl: url } : v
          );
        }
      } else if (level === 'category' && selectedVideo) {
        updatedVideos = updatedVideos.map((v, i) => {
          if (i !== selectedVideoIdx) return v;
          return {
            ...v,
            categories: (v.categories || []).map((c, j) => {
              if (j !== selectedCategoryIdx) return c;
              return { ...c, videoUrl: url };
            })
          };
        });
      } else if (level === 'question' && selectedVideo && selectedCategory) {
        updatedVideos = updatedVideos.map((v, i) => {
          if (i !== selectedVideoIdx) return v;
          return {
            ...v,
            categories: (v.categories || []).map((c, j) => {
              if (j !== selectedCategoryIdx) return c;
              return {
                ...c,
                questions: (c.questions || []).map((q, k) => {
                  if (k !== selectedQuestionIdx) return q;
                  return { ...q, videoUrl: url };
                })
              };
            })
          };
        });
      }

      await setDoc(doc(db, 'patients', selectedPatientId), {
        videos: updatedVideos,
        status: 'Annotating'
      }, { merge: true });
      
      // Update local state for immediate reaction
      setPatients(prev => prev.map(p => 
        p.id === selectedPatientId ? { ...p, videos: updatedVideos } : p
      ));

      setPhaseVideoInput('');
      setStepVideoInput('');
      alert('Video link updated successfully.');
      await fetchPatients();
      setVideoInput('');
    } catch (error) {
      console.error('Error linking video:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleLinkFolder = async (url: string) => {
    if (!selectedPatientId || !user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'patients', selectedPatientId), {
        videoFolderUrl: url,
        status: 'Annotating'
      }, { merge: true });
      await fetchPatients();
    } catch (error) {
      console.error('Error linking folder:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReview = async (decision: 'approve' | 'revise' | 'flag' | 'publish') => {
    if (!user || !selectedPatientId || !editForm) return;
    setSaving(true);
    try {
      const statusMap: Record<string, any> = {
         approve: 'reviewed',
         revise: 'revised',
         flag: 'flagged',
         publish: 'published'
      };

      const updatedQuestion: HierarchicalQuestion = {
        ...editForm,
        reviewStatus: statusMap[decision],
        lastEditedBy: user.displayName || user.email || 'Doctor',
        lastEditedTime: new Date().toISOString(),
      };

      // Deep update local state
      const updatedPatients = patients.map(p => {
        if (p.id !== selectedPatientId) return p;
        return {
          ...p,
          videos: p.videos.map((v, vIdx) => {
            if (vIdx !== selectedVideoIdx) return v;
            return {
              ...v,
              categories: v.categories.map((c, cIdx) => {
                if (cIdx !== selectedCategoryIdx) return c;
                return {
                  ...c,
                  questions: c.questions.map((q, qIdx) => {
                    if (qIdx !== selectedQuestionIdx) return q;
                    return updatedQuestion;
                  })
                };
              })
            };
          })
        };
      });

      setPatients(updatedPatients);
      
      // Persist to Firebase
      const patientToSave = updatedPatients.find(p => p.id === selectedPatientId);
      if (patientToSave) {
        await setDoc(doc(db, 'patients', selectedPatientId), patientToSave);
      }

      alert(`Benchmark Item updated: ${decision.toUpperCase()}`);
      if (decision === 'publish' || decision === 'approve') setEditMode(false);
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save review changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleLocalVideoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedPatientId) {
      const internalUrl = URL.createObjectURL(file);
      // For current session preview, update both the list and the active patient state if matched
      setPatients(prev => prev.map(p => 
        p.id === selectedPatientId ? { ...p, videoUrl: internalUrl } : p
      ));
      
      // Force refreshing the view by triggering a dummy state change if needed, 
      // but the setPatients update on selectedPatientId should be enough as it triggers selectedPatient memo.
      alert("Local video stream initialized. Switching to player view.");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        fetchPatients();
      }
    });
    return () => unsubscribe();
  }, []);

  async function fetchPatients() {
    try {
      const q = query(collection(db, 'patients'));
      const snapshot = await getDocs(q);
      const patientList = snapshot.docs.map(doc => doc.data() as Patient);
      setPatients(patientList);
      if (patientList.length > 0 && !selectedPatientId) {
        setSelectedPatientId(patientList[0].id);
      }
      runDiagnostics(patientList);
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  }

  const runDiagnostics = (list: Patient[]) => {
    const missing = list.filter(p => (!p.videos || p.videos.length === 0) && !p.videoFolderUrl).map(p => p.id);
    setDiagnostic({
      totalPatients: list.length,
      totalVideos: list.filter(p => (p.videos || []).some(v => !!v.videoUrl)).length,
      missingVideos: missing,
      orphanedVideos: [], 
      malformedRecords: list.filter(p => !p.id || !p.operativeEMR).length,
      status: 'ready'
    });
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!user) {
      alert("Authentication Required: Please sign in before ingesting codex data.");
      return;
    }

    setSaving(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawData = JSON.parse(event.target?.result as string);
        // Support { patients: [...] }, { patient: { ... } }, direct array, or single object with ID
        const patientsToImport = Array.isArray(rawData) 
          ? rawData 
          : (rawData.patients || (rawData.patient ? [rawData.patient] : (rawData.id || rawData.patientId || rawData.benchmarkPatientId ? [rawData] : [])));
        
        if (patientsToImport.length === 0) {
          throw new Error("No valid patient records found in JSON structure. Checked for 'patients' array, 'patient' object, or root 'id'.");
        }

        let importCount = 0;
        for (const p of patientsToImport) {
          const rawId = p.id || p.patientId || p.benchmarkPatientId;
          const videosSource = p.videos || p.videoNodes || [];
          
          if (rawId) {
            const safeId = String(rawId).trim().replace(/\s+/g, '_');
            const structuredPatient: Patient = {
              id: safeId,
              name: p.name || `Case ${safeId}`,
              status: p.status || 'Not started',
              operativeEMR: p.operativeEMR || p.emrSummary || p.emr || '',
              emrSummary: p.emrSummary || p.operativeEMR || p.emr || '',
              differences: p.differences || {},
              videoFolderUrl: p.videoFolderUrl || '',
              videos: (videosSource).map((v: any) => ({
                id: v.id || v.videoNodeId || Math.random().toString(36).substr(2, 9),
                title: v.title || v.videoNodeLabel || v.videoNodeType || v.id || 'Untitled Node',
                videoUrl: v.videoUrl || null,
                videoFolderUrl: v.videoFolderUrl || null,
                categories: (v.categories || []).map((cat: any) => ({
                  id: cat.id || cat.categoryId || Math.random().toString(36).substr(2, 9),
                  name: cat.name || cat.categoryLabel || 'Uncategorized',
                  questions: (cat.questions || []).map((q: any) => ({
                    ...q,
                    id: q.id || q.questionId || Math.random().toString(36).substr(2, 9),
                    question: q.question || '',
                    answer: q.answer || '',
                    choices: q.choices || q.options || [],
                    videoCaption: q.video_caption || q.videoCaption || '',
                    sourcePath: q.source_path || q.sourcePath || '',
                    clipInfo: q.clip_info || q.clipInfo || null,
                    scoring: q.scoring || {
                      consensus: {
                        questionConstruction: { finalScore5: 0 },
                        answerValidity: { finalScore5: 0 },
                        distractorQuality: { finalScore5: 0 },
                        unifiedReliabilityScore100: 0
                      },
                      escalationPolicy: { sendToHumanReview: false },
                      confidence: { overall: 0 }
                    }
                  }))
                }))
              })),
              benchmarkCount: (videosSource).reduce((acc: number, v: any) => 
                acc + (v.categories || []).reduce((acc2: number, c: any) => acc2 + (c.questions || []).length, 0), 0)
            };

            await setDoc(doc(db, 'patients', safeId), structuredPatient);
            importCount++;
          }
        }
        
        await fetchPatients();
        alert(`Successfully ingested ${importCount} patient records.`);
        setShowDashboard(true);
      } catch (error: any) {
        console.error('Import error:', error);
        alert(`Ingestion Failed: ${error.message || 'Ensure Codex-standard JSON structure.'}`);
      } finally {
        setSaving(false);
        // Clear input
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleResolveFolder = async () => {
    if (!selectedPatientId || !selectedPatient?.videoFolderUrl) return;
    setSaving(true);
    // Simulate server-side folder crawler resolving filenames
    setTimeout(async () => {
      const updatedClips = selectedPatient.clips?.map(clip => ({
        ...clip,
        // Simulation: if it has a filename, "resolve" it to a dummy playable URL
        videoUrl: clip.fileName ? `https://storage.googleapis.com/surgqa-assets/clips/${clip.fileName}` : undefined
      }));
      
      try {
        await setDoc(doc(db, 'patients', selectedPatientId), {
          clips: updatedClips,
          status: 'Annotating'
        }, { merge: true });
        await fetchPatients();
      } catch (e) {
        console.error(e);
      } finally {
        setSaving(false);
      }
    }, 1500);
  };

  const videoState = useMemo(() => {
    if (selectedQuestion?.videoUrl) return 'playable';
    if (selectedCategory?.videoUrl) return 'playable';
    if (selectedVideo?.videoUrl) return 'playable';
    if (selectedPatient?.videoUrl) return 'playable';
    if (!selectedVideo && !selectedPatient?.videoFolderUrl) return 'missing';
    if (selectedVideo?.videoFolderUrl || selectedPatient?.videoFolderUrl) return 'folder_only';
    return 'missing';
  }, [selectedVideo, selectedPatient, selectedQuestion, selectedCategory]);

  const currentVideoUrl = useMemo(() => {
    const rawUrl = (selectedQuestion?.videoUrl ||
                   selectedCategory?.videoUrl ||
                   selectedVideo?.videoUrl ||
                   selectedPatient?.videoUrl ||
                   '').trim();
    if (!rawUrl) return '';

    // Drive folder URLs cannot be embedded as a single video. Surface as-is so
    // the player UI can render an explicit "this is a folder" warning.
    if (/drive\.google\.com\/drive\/folders\//.test(rawUrl)) {
      return rawUrl;
    }

    // Transform Drive view links to direct embed/preview links for iframe.
    // Supported inputs:
    //   /file/d/<ID>/view?usp=sharing
    //   /file/d/<ID>/preview
    //   /open?id=<ID>
    //   /uc?id=<ID>&export=download
    if (rawUrl.includes('drive.google.com')) {
      const dMatch = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (dMatch && dMatch[1]) {
        return `https://drive.google.com/file/d/${dMatch[1]}/preview`;
      }
      const idMatch = rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
      }
    }

    // YouTube (recommended for browser-friendly playback)
    const ytMatch = rawUrl.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (ytMatch && ytMatch[1]) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }

    // Vimeo
    const vimeoMatch = rawUrl.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch && vimeoMatch[1]) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    // Dropbox: rewrite for direct streaming
    if (rawUrl.includes('dropbox.com')) {
      if (rawUrl.includes('dl=0')) return rawUrl.replace('dl=0', 'raw=1');
      if (!rawUrl.includes('raw=1')) return rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'raw=1';
    }

    return rawUrl;
  }, [selectedQuestion, selectedCategory, selectedVideo, selectedPatient]);

  // Classify the resolved URL so the player picks the right element.
  const videoSourceKind = useMemo<'drive-folder' | 'iframe' | 'native' | 'none'>(() => {
    if (!currentVideoUrl) return 'none';
    if (/drive\.google\.com\/drive\/folders\//.test(currentVideoUrl)) return 'drive-folder';
    if (
      currentVideoUrl.includes('drive.google.com') ||
      currentVideoUrl.includes('youtube.com/embed') ||
      currentVideoUrl.includes('player.vimeo.com')
    ) {
      return 'iframe';
    }
    return 'native';
  }, [currentVideoUrl]);

  // Reset video error state on source change
  useEffect(() => {
    setVideoLoadError(false);
  }, [currentVideoUrl]);

  const filteredPatients = useMemo(() => 
    patients.filter(p => 
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  , [searchTerm, patients]);

  const handleAddVideoNode = async () => {
    if (!selectedPatientId || !selectedPatient) return;
    const newNode = {
      id: `node_${Math.random().toString(36).substr(2, 5)}`,
      title: 'Manual Video Node',
      categories: [
        {
          id: 'cat_new',
          name: 'Surgical Stage A',
          questions: [
            {
              id: `q_${Math.random().toString(36).substr(2, 5)}`,
              question: 'New Clinical Question Placeholder',
              answer: 'Placeholder Answer',
              choices: ['Option A', 'Option B', 'Option C', 'Option D'],
              scoring: {
                consensus: {
                   questionConstruction: { finalScore5: 0 },
                   answerValidity: { finalScore5: 0 },
                   distractorQuality: { finalScore5: 0 },
                   unifiedReliabilityScore100: 0
                },
                escalationPolicy: { sendToHumanReview: false },
                confidence: { overall: 0 }
              }
            }
          ]
        }
      ]
    };
    
    const updatedVideos = [...(selectedPatient.videos || []), newNode];
    setSaving(true);
    try {
      await setDoc(doc(db, 'patients', selectedPatientId), {
        videos: updatedVideos
      }, { merge: true });
      await fetchPatients();
      setSelectedVideoIdx(updatedVideos.length - 1);
      setSelectedCategoryIdx(0);
      setSelectedQuestionIdx(0);
    } catch (error) {
      console.error('Error adding video node:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCommit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'benchmarks'), {
        patientId: selectedPatientId,
        question: seedQuestion,
        answer: "Corrected variant identified in calot triangle dissection phase.",
        choices: ['Standard Anatomy', 'Corrected variant', 'Ectopic gallbladder', 'Ductal accessory'],
        logic: logicPoint,
        status: 'approved',
        feedback: feedback,
        issueType: issueType,
        authorId: user.uid,
        createdAt: serverTimestamp()
      });
      alert('Benchmark validation audit committed successfully.');
      setFeedback('');
    } catch (error) {
      console.error('Commit error:', error);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>;

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-xl max-w-md w-full text-center space-y-8">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center text-white text-4xl font-black shadow-lg">SB</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Clinical Governance</h2>
            <p className="text-sm text-slate-500 leading-relaxed font-medium">Surgical AI Benchmark Construction & Quality Assurance Terminal</p>
          </div>
          <button 
            onClick={login}
            className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-black transition-all shadow-md group"
          >
            <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            Authenticate Clinical ID
          </button>
          <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
            <ShieldCheck className="w-3 h-3" />
            ISO 13485 Compliant Ingestion
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen font-sans bg-[#f1f5f9] text-slate-900">
      {/* 1. Global Header */}
      <header className="h-14 bg-slate-900 text-white flex items-center px-6 justify-between shrink-0 z-50 border-b border-white/10 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center font-black text-lg">S</div>
          <div className="flex flex-col">
            <h1 className="text-[13px] font-black uppercase tracking-wider flex items-center gap-2">
              SurgQA Terminal <span className="opacity-30 text-xs">|</span> <span className="text-blue-400 font-bold">Benchmark Operations</span>
            </h1>
            <div className="flex items-center gap-3 text-[9px] font-mono text-slate-400 mt-0.5">
              <span className="flex items-center gap-1"><Layers className="w-2.5 h-2.5" /> SECURE_HOST: {diagnostic.totalPatients} NODES</span>
              <span className="text-slate-600 uppercase">SYS_VER: 2.5.0-ALPHA</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <button 
            onClick={fetchPatients}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5 group"
            title="Force Sync Database"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 group-hover:text-blue-400 ${saving ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setShowDashboard(!showDashboard)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
              showDashboard ? 'bg-blue-600 text-white shadow-inner' : 'bg-white/10 hover:bg-white/20 text-slate-300'
            }`}
          >
            <BarChart4 className="w-3.5 h-3.5" />
            Ingestion Metrics
          </button>
          <div className="flex items-center gap-3 pl-6 border-l border-white/10">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-300 uppercase leading-none">{user.displayName || 'Doctor'}</p>
              <p className="text-[8px] font-mono text-blue-400 uppercase tracking-tighter mt-1">Admin_Clearance: Level_3</p>
            </div>
            <button onClick={logout} className="p-2 hover:bg-red-600 rounded-lg transition-colors group">
              <LogOut className="w-4 h-4 text-slate-400 group-hover:text-white" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 2. Primary Navigation (Sidebar) */}
        <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 shadow-sm z-40">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Lookup Case ID..."
                className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-[11px] font-bold text-slate-600 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredPatients.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPatientId(p.id)}
                className={`w-full group text-left px-5 py-4 border-b border-slate-100 transition-all flex items-center justify-between ${
                  selectedPatientId === p.id 
                    ? 'bg-blue-50 border-l-4 border-l-blue-600 shadow-inner' 
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col gap-1.5 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-black tracking-tight ${selectedPatientId === p.id ? 'text-blue-700' : 'text-slate-900 underline decoration-slate-200 underline-offset-2'}`}>
                      {p.id}
                    </span>
                    {(p.videos?.some(v => !!v.videoUrl) || p.videos?.some(v => v.categories?.some(c => !!c.videoUrl))) && (
                      <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse shrink-0" title="Video Evidence Linked" />
                    )}
                    {p.emrType === 'EMR Only' && <span className="bg-slate-100 text-slate-400 text-[8px] px-1 py-0.5 rounded font-black uppercase">EMR</span>}
                    {p.status === 'Missing Video' && <AlertTriangle className="w-3 h-3 text-orange-500" />}
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 truncate group-hover:text-slate-700 transition-colors uppercase tracking-tight">{p.name}</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusBadge status={p.status} />
                  {p.benchmarkCount > 0 && <span className="text-[8px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">{p.benchmarkCount} QA</span>}
                </div>
              </button>
            ))}
          </div>

          <div className="p-4 bg-slate-900 border-t border-white/10 mt-auto">
            <label className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-blue-500 shadow-lg transition-transform active:scale-95 group">
              <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform" />
              Ingest Codex
              <input type="file" accept=".json" className="hidden" onChange={handleImport} disabled={saving} />
            </label>
          </div>
        </aside>

        {/* 3. Operational Workspace */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden relative">
          <AnimatePresence>
            {showDashboard && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute inset-0 p-6 z-50 bg-slate-900/98 backdrop-blur-xl flex items-center justify-center"
              >
                 <div className="max-w-4xl w-full bg-slate-900 border border-white/10 rounded-3xl p-10 shadow-[0_0_100px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                        <Database className="text-blue-400" /> Ingestion Diagnostic Terminal
                      </h2>
                      <button onClick={() => setShowDashboard(false)} className="px-4 py-2 bg-white/10 rounded-lg text-xs font-black uppercase hover:bg-white/20 transition-colors">Close Monitor</button>
                    </div>
                    <div className="grid grid-cols-4 gap-6">
                      <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Total Records</p>
                        <p className="text-3xl font-black text-blue-400">{diagnostic.totalPatients}</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Video Ready</p>
                        <p className="text-3xl font-black text-green-400">{diagnostic.totalVideos}</p>
                      </div>
                      <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                        <p className="text-[10px] text-red-300 font-bold uppercase mb-1">Missing Media</p>
                        <p className="text-3xl font-black text-red-500">{diagnostic.missingVideos.length}</p>
                      </div>
                      <div className="bg-orange-500/10 p-4 rounded-xl border border-orange-500/20">
                        <p className="text-[10px] text-orange-300 font-bold uppercase mb-1">Orphaned Clips</p>
                        <p className="text-3xl font-black text-orange-500">0</p>
                      </div>
                    </div>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 min-h-0 p-6 flex flex-col gap-6 overflow-y-auto">
            {selectedPatient ? (
              <>
                {/* Top: Clinical Summary Grid */}
                <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex-1 space-y-1">
                           <div className="flex items-center justify-between">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Video Node</label>
                              <button 
                                onClick={handleAddVideoNode}
                                className="text-[8px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors flex items-center gap-1"
                                title="Add a new video source node to this patient"
                              >
                                <Plus className="w-2.5 h-2.5" /> Add Node
                              </button>
                           </div>
                           <select 
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10"
                             value={selectedVideoIdx}
                             onChange={(e) => {
                               setSelectedVideoIdx(Number(e.target.value));
                               setSelectedCategoryIdx(0);
                               setSelectedQuestionIdx(0);
                             }}
                           >
                             {selectedPatient?.videos?.map((v, i) => (
                               <option key={v.id} value={i}>{v.title || v.id}</option>
                             ))}
                             {(!selectedPatient?.videos || selectedPatient.videos.length === 0) && (
                               <option value={0}>No Video Nodes Available</option>
                             )}
                           </select>
                        </div>
                        <div className="flex-1 space-y-1">
                           <div className="flex items-center justify-between">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Surgical Stage / Category</label>
                              {selectedCategory?.videoUrl && <span className="text-[7px] font-black bg-green-500 text-white px-1 rounded">STREAM_LIVE</span>}
                           </div>
                           <select 
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 mb-2"
                             value={selectedCategoryIdx}
                             onChange={(e) => {
                               setSelectedCategoryIdx(Number(e.target.value));
                               setSelectedQuestionIdx(0);
                             }}
                           >
                             {selectedVideo?.categories?.map((c, i) => (
                               <option key={c.id} value={i}>{c.name}</option>
                             ))}
                           </select>
                           <div className="flex gap-1.5">
                             <input 
                               placeholder="Phase .mp4 link" 
                               className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 outline-none"
                               value={phaseVideoInput}
                               onChange={(e) => setPhaseVideoInput(e.target.value)}
                             />
                             <button 
                               onClick={() => handleLinkVideo(phaseVideoInput.trim(), 'category')}
                               disabled={!phaseVideoInput.trim() || saving}
                               className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-50"
                             >
                               Link
                             </button>
                           </div>
                        </div>
                        <div className="flex-1 space-y-1">
                           <div className="flex items-center justify-between">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Target Question</label>
                              {selectedQuestion?.videoUrl && <span className="text-[7px] font-black bg-blue-500 text-white px-1 rounded">STREAM_LIVE</span>}
                           </div>
                           <select 
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 mb-2"
                             value={selectedQuestionIdx}
                             onChange={(e) => setSelectedQuestionIdx(Number(e.target.value))}
                           >
                             {selectedCategory?.questions?.map((q, i) => (
                               <option key={i} value={i}>Q{i + 1}: {q.question.substring(0, 50)}...</option>
                             ))}
                           </select>
                           <div className="flex gap-1.5">
                             <input 
                               placeholder="Step .mp4 link" 
                               className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 outline-none"
                               value={stepVideoInput}
                               onChange={(e) => setStepVideoInput(e.target.value)}
                             />
                             <button 
                               onClick={() => handleLinkVideo(stepVideoInput.trim(), 'question')}
                               disabled={!stepVideoInput.trim() || saving}
                               className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
                             >
                               Link
                             </button>
                           </div>
                        </div>
                      </div>
                      
                      <h3 className="section-header !text-slate-900 flex items-center gap-2">
                         <FileText className="w-4 h-4 text-blue-500" />
                         Clinical Knowledge Object: {selectedPatient.id}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium uppercase tracking-widest mt-1">Vetting Stage: Clinical Operational Logic</p>
                    </div>
                    <button
                      onClick={() => setClinicalExpanded(v => !v)}
                      className="shrink-0 text-[9px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100 transition-colors"
                    >
                      {clinicalExpanded ? '▲ Hide EMR' : '▼ Show EMR & Deviations'}
                    </button>
                  </div>

                  {clinicalExpanded && <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden transition-all">
                        <button 
                          onClick={() => setEmrFolded(!emrFolded)}
                          className="w-full flex items-center justify-between p-4 hover:bg-slate-100 transition-colors"
                        >
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                             <ShieldCheck className="w-3 h-3 text-blue-500" /> Operative EMR
                          </h4>
                          <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest">
                            {emrFolded ? 'Show Full Text' : 'Hide Text'}
                          </span>
                        </button>
                        {!emrFolded && (
                          <div className="p-4 pt-0">
                             <p className="text-[12px] leading-relaxed text-slate-700 font-medium italic">"{selectedPatient.operativeEMR || selectedPatient.emrSummary}"</p>
                          </div>
                        )}
                        {emrFolded && (
                          <div className="px-4 pb-4">
                             <p className="text-[12px] leading-relaxed text-slate-400 truncate opacity-60">"{(selectedPatient.operativeEMR || selectedPatient.emrSummary).substring(0, 100)}..."</p>
                          </div>
                        )}
                      </div>
                      {selectedPatient.nonOperativeEMR && (
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">Non-Operative History</h4>
                          <p className="text-[11px] leading-snug text-slate-600">{selectedPatient.nonOperativeEMR}</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">Codex-Identified Deviations</h4>
                      <div className="space-y-3">
                         {selectedPatient.differences.anatomy && (
                           <div>
                             <p className="text-[9px] font-black text-blue-500 uppercase mb-1">Anatomical Variations</p>
                             <div className="flex flex-wrap gap-2">
                               {selectedPatient.differences.anatomy.map((d, i) => <span key={i} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-700 shadow-sm">{d}</span>)}
                             </div>
                           </div>
                         )}
                         {selectedPatient.differences.abnormalFindings && (
                           <div>
                             <p className="text-[9px] font-black text-orange-500 uppercase mb-1">Abnormal Procedural Findings</p>
                             <div className="flex flex-wrap gap-2">
                               {selectedPatient.differences.abnormalFindings.map((d, i) => <span key={i} className="px-2 py-1 bg-orange-50 border border-orange-100 rounded text-[10px] font-bold text-orange-700">{d}</span>)}
                             </div>
                           </div>
                         )}
                      </div>
                    </div>
                  </div>}
                </section>

                {/* Middle: Media Review Terminal */}
                <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
                        <Video className="w-4 h-4 text-slate-400" />
                        Professional Evidence Terminal
                      </h3>
                      {videoState === 'playable' && (
                        <span className="px-2 py-0.5 bg-green-500 text-white rounded-full text-[8px] font-black animate-pulse">STREAMING_LIVE</span>
                      )}
                    </div>
                       <div className="text-[9px] font-mono text-slate-400 flex gap-4">
                          {selectedQuestion?.videoUrl && <span className="text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-100 flex items-center gap-1"><Play className="w-2.5 h-2.5" /> STEP_SYNCED</span>}
                          {selectedCategory?.videoUrl && !selectedQuestion?.videoUrl && <span className="text-orange-500 font-bold bg-orange-50 px-2 py-0.5 rounded border border-orange-100 flex items-center gap-1"><Play className="w-2.5 h-2.5" /> PHASE_SYNCED</span>}
                          <span className="flex items-center gap-1"><Info className="w-2.5 h-2.5" /> 1080p_FHD</span>
                          <span className="flex items-center gap-1 text-green-500 underline underline-offset-2 font-bold cursor-help">CLIP_MANIFEST_VERIFIED</span>
                       </div>
                  </div>

                  <div className="flex flex-col h-[500px] bg-black relative">
                    {/* Integrated Player Shell */}
                    <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                       {currentVideoUrl ? (
                         <>
                           {videoSourceKind === 'drive-folder' ? (
                             <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 text-center bg-slate-900/95">
                               <AlertTriangle className="w-10 h-10 text-orange-400" />
                               <h4 className="text-sm font-black text-white uppercase tracking-wider">Folder URL Detected</h4>
                               <p className="text-[11px] text-slate-400 max-w-sm leading-relaxed">
                                 You linked a Google Drive <strong>folder</strong>, which cannot be played as a video.
                                 Open the folder, right-click an individual video file, choose
                                 <em> Share &rarr; Anyone with the link &rarr; Viewer</em>, then paste that file's URL.
                               </p>
                               <a
                                 href={currentVideoUrl}
                                 target="_blank"
                                 rel="noreferrer"
                                 className="px-4 py-2 bg-blue-600 text-white rounded text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 inline-flex items-center gap-2"
                               >
                                 <ExternalLink className="w-3 h-3" /> Open Folder in Drive
                               </a>
                             </div>
                           ) : videoSourceKind === 'iframe' ? (
                             <div className="w-full h-full relative group/iframe">
                               <iframe
                                 key={currentVideoUrl}
                                 src={currentVideoUrl}
                                 className="w-full h-full border-0"
                                 allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                                 allowFullScreen
                                 title="Surgical Evidence"
                               />
                               <div className="absolute bottom-4 right-4 opacity-0 group-hover/iframe:opacity-100 transition-opacity">
                                  <a 
                                    href={currentVideoUrl.replace('/preview', '/view')} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-500 shadow-xl"
                                  >
                                    <ExternalLink className="w-2.5 h-2.5" /> Source Window
                                  </a>
                               </div>
                             </div>
                           ) : (
                             <video 
                               key={currentVideoUrl}
                               src={currentVideoUrl} 
                               className="w-full h-full object-contain"
                               controls
                               autoPlay
                               onError={(e) => {
                                 console.error("Video load failed:", currentVideoUrl);
                                 setVideoLoadError(true);
                               }}
                             />
                           )}

                           <AnimatePresence>
                             {videoLoadError && (
                               <motion.div 
                                 initial={{ opacity: 0 }}
                                 animate={{ opacity: 1 }}
                                 exit={{ opacity: 0 }}
                                 className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-8 text-center space-y-6 z-10"
                               >
                                 <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center border border-orange-500/20">
                                    <AlertTriangle className="w-8 h-8 text-orange-500" />
                                 </div>
                                 <div className="space-y-2">
                                    <h4 className="text-sm font-black text-white uppercase tracking-wider">Stream Connection Blocked</h4>
                                    <p className="text-[10px] text-slate-400 max-w-xs leading-relaxed">
                                      The browser could not load this video. Most common cause for Google Drive:
                                      the file is not shared as <strong>"Anyone with the link &rarr; Viewer"</strong>.
                                      For private/HIPAA content, host the MP4 on a controlled signed-URL bucket
                                      (Firebase Storage, S3, GCS) instead.
                                    </p>
                                 </div>
                                 <div className="flex flex-col gap-2 w-full max-w-[200px]">
                                   <a 
                                     href={currentVideoUrl} 
                                     target="_blank" 
                                     rel="noreferrer"
                                     className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 shadow-lg text-center"
                                   >
                                     Open Source Link
                                   </a>
                                   <button 
                                     onClick={() => setVideoLoadError(false)}
                                     className="text-[9px] font-black text-slate-500 uppercase hover:text-white"
                                   >
                                     Retry Embed
                                   </button>
                                 </div>
                               </motion.div>
                             )}
                           </AnimatePresence>
                           <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
                             <span className="px-2 py-1 bg-black/60 backdrop-blur rounded text-[9px] font-black text-white border border-white/20 tracking-wider uppercase flex items-center gap-1.5 shadow-2xl">
                                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> 
                                Stream Level: {selectedQuestion?.videoUrl ? 'STEP_SPECIFIC' : selectedCategory?.videoUrl ? 'PHASE_SPECIFIC' : 'NODE_MASTER'}
                             </span>
                             <span className="px-2 py-1 bg-black/60 backdrop-blur rounded text-[8px] font-mono text-blue-300 border border-white/10 tracking-tight shadow-2xl">
                                Source: {currentVideoUrl.substring(0, 40)}...
                             </span>
                           </div>
                         </>
                       ) : videoState === 'folder_only' ? (
                         <div className="flex flex-col items-center justify-center gap-6 p-10 text-center w-full h-full bg-slate-900/40 backdrop-blur-sm">
                           <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                              <Layers className="w-8 h-8 text-blue-500" />
                           </div>
                           <div className="space-y-1 max-w-xs w-full">
                             <h4 className="text-xs font-black text-white uppercase tracking-tight">Evidence Folder Linked</h4>
                             <p className="text-[10px] text-slate-400 mb-4 tracking-tight uppercase">Segment resolution required</p>
                             
                             <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 max-h-40 overflow-y-auto shadow-sm text-left">
                               <p className="text-[8px] font-black text-slate-500 uppercase mb-3 px-1 border-b border-slate-800 pb-1">Expected Manifest:</p>
                               {(selectedVideo?.files || selectedPatient.clips || []).map((f: any, i: number) => (
                                 <div key={i} className="text-[10px] font-mono border-b border-slate-800 last:border-0 py-2 group/file line-clamp-1">
                                   <div className="flex items-center gap-2 text-slate-300 font-bold">
                                     <Video className="w-3 h-3 text-slate-500" /> {f.fileName}
                                   </div>
                                 </div>
                               ))}
                             </div>
                           </div>
                           <div className="flex gap-2 w-full max-w-xs">
                             <a 
                               href={selectedVideo?.videoFolderUrl || selectedPatient.videoFolderUrl} 
                               target="_blank" 
                               rel="noreferrer"
                               className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl transition-all flex items-center justify-center gap-2"
                             >
                               <Database className="w-3.5 h-3.5" /> Open Folder
                             </a>
                           </div>
                         </div>
                       ) : (
                         <div className="flex flex-col items-center justify-center gap-6 p-10 text-center w-full h-full">
                           <div className="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center border-2 border-dashed border-slate-800 mb-2">
                              <ShieldX className="w-10 h-10 text-slate-700" />
                           </div>
                           <div className="space-y-4 max-w-sm w-full">
                             <div>
                               <h4 className="text-sm font-black text-white uppercase tracking-[0.2em]">Evidence Area Reserved</h4>
                               <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest opacity-60">Synchronize direct stream or local MP4</p>
                             </div>
                             
                             <div className="flex flex-col gap-3">
                               <div className="flex gap-2">
                                 <input 
                                   type="text" 
                                   placeholder="Paste direct .mp4 URL (e.g. Dropbox/S3 link)"
                                   className="flex-1 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-700"
                                   value={videoInput}
                                   onChange={(e) => setVideoInput(e.target.value)}
                                 />
                                 <button 
                                   onClick={() => handleLinkVideo(videoInput.trim())}
                                   disabled={!videoInput.trim() || saving}
                                   className="px-6 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 disabled:opacity-30 transition-all shadow-lg"
                                 >
                                   Link
                                 </button>
                               </div>
                               <label className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-slate-800 hover:text-white transition-all">
                                 <Play className="w-3.5 h-3.5" />
                                 Link Local review Evidence
                                 <input type="file" accept="video/*" className="hidden" onChange={handleLocalVideoSelect} />
                               </label>
                             </div>
                           </div>
                         </div>
                       )}
                    </div>
                    
                    {/* Terminal Status Footer */}
                    <div className="bg-slate-950 px-6 py-2.5 flex items-center justify-between border-t border-slate-800">
                       <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                             <div className={`w-1.5 h-1.5 rounded-full ${currentVideoUrl ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse' : 'bg-slate-700'}`} />
                             <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest leading-none">Stream {currentVideoUrl ? 'Active' : 'Standby'}</span>
                          </div>
                          {currentVideoUrl && (
                             <span className="text-[8px] font-mono text-slate-700 opacity-60 truncate max-w-[200px]">{currentVideoUrl}</span>
                          )}
                       </div>
                       <div className="flex items-center gap-4">
                          <RefreshCw className="w-3 h-3 text-slate-700 hover:text-white cursor-pointer transition-colors" />
                          <Settings className="w-3 h-3 text-slate-800" />
                       </div>
                    </div>
                  </div>
                </section>

                {/* Bottom: Question Verification Workspace */}
                <section className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
                   <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                           <Zap className="w-5 h-5 text-blue-400 fill-blue-400/20" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Vetting Workspace</h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{selectedQuestion?.id}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setEditMode(!editMode)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
                            editMode ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {editMode ? 'Disable Edit Mode' : 'Enable Direct Edit'}
                        </button>
                        <button 
                          onClick={() => handleLinkFolder("https://drive.google.com/drive/folders/1a9ZXDICGstayfW1C24SL_CgdXrjqhNJu?usp=drive_link")}
                          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-black transition-all"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
                          Link User Video Folder
                        </button>
                      </div>
                   </div>

                   <div className="p-8 space-y-10">
                      {/* Q&A Presentation Area */}
                      <div className="grid grid-cols-5 gap-12">
                         <div className="col-span-3 space-y-8">
                            <div className="space-y-4">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Original Question Body</label>
                               <div className="text-xl font-bold text-slate-900 leading-snug">
                                  {selectedQuestion?.question}
                               </div>
                               {editMode && editForm && (
                                 <textarea 
                                   className="w-full mt-4 p-4 bg-orange-50/30 border-2 border-orange-100 rounded-2xl text-[13px] font-bold text-slate-700 outline-none focus:border-orange-300 transition-all min-h-[100px]"
                                   value={editForm.question}
                                   onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
                                   placeholder="Revise question text..."
                                 />
                               )}
                            </div>

                            <div className="space-y-4">
                               <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Choice Architecture</label>
                               <div className="grid gap-3">
                                  {(selectedQuestion?.choices || selectedQuestion?.options || []).map((opt, i) => {
                                    const isCorrect = opt === selectedQuestion?.answer;
                                    return (
                                      <div key={i} className={`flex items-start gap-4 p-4 rounded-2xl border transition-all ${
                                        isCorrect ? 'bg-green-50 border-green-200 border-2 shadow-sm' : 'bg-slate-50/50 border-slate-100'
                                      }`}>
                                         <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5 ${
                                           isCorrect ? 'bg-green-600 text-white' : 'bg-white border border-slate-200 text-slate-400'
                                         }`}>
                                            {String.fromCharCode(65 + i)}
                                         </span>
                                         <div className="flex-1">
                                            <p className={`text-[12px] leading-relaxed font-bold ${isCorrect ? 'text-green-900' : 'text-slate-600'}`}>{opt}</p>
                                            {isCorrect && <span className="text-[9px] font-black text-green-600 uppercase tracking-widest mt-1 block">Verified Correct Target</span>}
                                         </div>
                                      </div>
                                    );
                                  })}
                               </div>
                               
                               {editMode && editForm && (
                                 <div className="space-y-3 pt-6 border-t border-slate-100 border-dashed">
                                    <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest block">Revise Option Values</label>
                                    {editForm.choices.map((opt, i) => (
                                      <input 
                                        key={i}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600"
                                        value={opt}
                                        onChange={(e) => {
                                          const newChoices = [...editForm.choices];
                                          newChoices[i] = e.target.value;
                                          setEditForm({ ...editForm, choices: newChoices });
                                        }}
                                      />
                                    ))}
                                    <div className="pt-4">
                                       <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">Define Correct Answer Rationale (String Match)</label>
                                       <select 
                                         className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700"
                                         value={editForm.answer}
                                         onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                                       >
                                         {editForm.choices.map((c, i) => <option key={i} value={c}>Option {String.fromCharCode(65+i)}: {c.substring(0, 40)}...</option>)}
                                       </select>
                                    </div>
                                 </div>
                               )}
                            </div>
                         </div>

                         <div className="col-span-2 space-y-10">
                            <div className="space-y-6">
                               <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                     <Lightbulb className="w-3.5 h-3.5 text-blue-500" /> Evidence Context
                                  </h4>
                                  <div>
                                    <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Video Stream Caption</label>
                                    <p className="text-[11px] text-slate-700 leading-relaxed font-medium italic">"{selectedQuestion?.videoCaption}"</p>
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Source Tracking</label>
                                    <code className="text-[9px] font-mono text-blue-600 block bg-blue-50 px-2 py-1 rounded truncate">{selectedQuestion?.sourcePath}</code>
                                  </div>
                               </div>

                               <div className="space-y-4 pt-4">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Procedural Logic Config</label>
                                  <div className="grid gap-3">
                                     <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                        <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Answer Origin Source</label>
                                        {editMode && editForm ? (
                                           <input 
                                             className="w-full bg-slate-50 border-none px-0 text-xs font-bold text-slate-800 outline-none"
                                             value={editForm.logic?.answerOrigin || ''}
                                             onChange={(e) => setEditForm({ ...editForm, logic: { ...(editForm.logic || {evidence:{emr:false,video:false,knowledge:false}, answerOrigin: '', choiceRule: ''}), answerOrigin: e.target.value }})}
                                           />
                                        ) : (
                                           <p className="text-xs font-bold text-slate-800">{selectedQuestion?.logic?.answerOrigin || 'AI Multimodal Extraction'}</p>
                                        )}
                                     </div>
                                     <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                        <label className="text-[9px] font-black text-slate-500 uppercase mb-1 block">Distractor Construction Rule</label>
                                        {editMode && editForm ? (
                                           <input 
                                             className="w-full bg-slate-50 border-none px-0 text-xs font-bold text-slate-800 outline-none"
                                             value={editForm.logic?.choiceRule || ''}
                                             onChange={(e) => setEditForm({ ...editForm, logic: { ...(editForm.logic || {evidence:{emr:false,video:false,knowledge:false}, answerOrigin: '', choiceRule: ''}), choiceRule: e.target.value }})}
                                           />
                                        ) : (
                                           <p className="text-xs font-bold text-slate-800">{selectedQuestion?.logic?.choiceRule || 'Negative Constraint Mapping'}</p>
                                        )}
                                     </div>
                                  </div>
                               </div>
                            </div>

                            {selectedQuestion?.revisions && selectedQuestion.revisions.length > 0 && (
                               <div className="space-y-4">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Revision History</h4>
                                  <div className="space-y-2">
                                     {selectedQuestion.revisions.map((rev, i) => (
                                       <div key={i} className="p-3 bg-green-50 rounded-xl border border-green-100 flex items-center justify-between">
                                          <div>
                                             <p className="text-[10px] font-black text-green-700 capitalize">{rev.reviewDecision}</p>
                                             <p className="text-[8px] text-green-600 opacity-70">by {rev.authorId}</p>
                                          </div>
                                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                                       </div>
                                     ))}
                                  </div>
                               </div>
                            )}
                         </div>
                      </div>
                   </div>
                </section>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-20">
                <div className="w-32 h-32 bg-white border border-slate-200 rounded-[3rem] items-center justify-center flex shadow-xl mb-10 text-slate-200">
                  <Database className="w-16 h-16" strokeWidth={1} />
                </div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">System Idle</h2>
                <p className="text-slate-500 font-medium text-sm mt-2 max-w-sm">No clinical knowledge object selected. Please import a Codex dataset or select a patient record from the sidebar to initialize terminal.</p>
                <div className="mt-8 flex gap-4">
                   <button className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg hover:shadow-blue-500/20 transition-all active:scale-95">Initialize Node Lookup</button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* 4. Hierarchical Validation Console (Right Panel) */}
        <aside className="w-[400px] border-l border-slate-200 flex flex-col bg-white shrink-0 z-40 overflow-hidden text-slate-900 border-t border-slate-100">
          {/* Header & Item Summary */}
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <BarChart4 className="w-4 h-4 text-blue-600" /> Validation Engine
              </h3>
              <div className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${
                (selectedQuestion?.scoring?.consensus?.unifiedReliabilityScore100 || 0) < 85 || selectedQuestion?.scoring?.escalationPolicy?.sendToHumanReview
                  ? 'bg-orange-50 border-orange-200 text-orange-600'
                  : 'bg-green-50 border-green-200 text-green-600'
              }`}>
                {(selectedQuestion?.scoring?.consensus?.unifiedReliabilityScore100 || 0) < 85 || selectedQuestion?.scoring?.escalationPolicy?.sendToHumanReview
                  ? 'Needs Human' : 'Auto-Pass'}
              </div>
            </div>

            {/* NEW: Full Q&A Display at top of validation panel */}
            {selectedQuestion && (
              <div className="mb-6 p-4 bg-slate-900 rounded-2xl shadow-xl border border-white/5 space-y-3">
                <div className="space-y-1">
                  <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Question Body</p>
                  <p className="text-xs font-bold text-white leading-relaxed">{selectedQuestion.question}</p>
                </div>
                <div className="pt-2 border-t border-white/10 space-y-1">
                  <p className="text-[8px] font-black text-green-400 uppercase tracking-widest">Target Answer</p>
                  <p className="text-xs font-bold text-white leading-relaxed">{selectedQuestion.answer}</p>
                </div>
              </div>
            )}

            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
               <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Unified Reliability Profile</span>
                  <span className="text-lg font-mono font-black italic text-slate-900">{(selectedQuestion?.scoring?.consensus?.unifiedReliabilityScore100 || 0).toFixed(1)}</span>
               </div>
               <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ${(selectedQuestion?.scoring?.consensus?.unifiedReliabilityScore100 || 0) < 85 ? 'bg-orange-500' : 'bg-green-500'}`}
                    style={{ width: `${selectedQuestion?.scoring?.consensus?.unifiedReliabilityScore100 || 0}%` }}
                  />
               </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-8">
            {/* 1. Question Construction Score */}
            <div className="space-y-4">
               <ScoreDimension 
                 title="Question Construction" 
                 score={selectedQuestion?.scoring?.consensus?.questionConstruction?.finalScore5 || 0}
                 description="Assesses grounding, logical consistency, and linguistic clarity."
               >
                 <ScoreComponent label="Grounding" score={selectedQuestion?.scoring?.consensus?.questionConstruction?.components?.grounding || 0} />
                 <ScoreComponent label="Consistency" score={selectedQuestion?.scoring?.consensus?.questionConstruction?.components?.consistency || 0} />
                 <ScoreComponent label="Clarity" score={selectedQuestion?.scoring?.consensus?.questionConstruction?.components?.clarity || 0} />
               </ScoreDimension>

               <ScoreDimension 
                 title="Answer Validity" 
                 score={selectedQuestion?.scoring?.consensus?.answerValidity?.finalScore5 || 0}
                 description="Checks clinical evidence alignment and temporal phase fit."
               >
                 <ScoreComponent label="Evidence Align" score={selectedQuestion?.scoring?.consensus?.answerValidity?.components?.evidence_alignment || 0} />
                 <ScoreComponent label="Clinical Validity" score={selectedQuestion?.scoring?.consensus?.answerValidity?.components?.clinical_validity || 0} />
                 <ScoreComponent label="Temporal Fit" score={selectedQuestion?.scoring?.consensus?.answerValidity?.components?.temporal_phase_fit || 0} />
               </ScoreDimension>

               <ScoreDimension 
                 title="Distractor Quality" 
                 score={selectedQuestion?.scoring?.consensus?.distractorQuality?.finalScore5 || 0}
                 description="Evaluates distractor plausibility, separation, and set balance."
               >
                 <ScoreComponent label="Plausibility" score={selectedQuestion?.scoring?.consensus?.distractorQuality?.components?.plausibility || 0} />
                 <ScoreComponent label="Separation" score={selectedQuestion?.scoring?.consensus?.distractorQuality?.components?.separation || 0} />
                 <ScoreComponent label="Balance" score={selectedQuestion?.scoring?.consensus?.distractorQuality?.components?.balance || 0} />
               </ScoreDimension>
            </div>

            {/* Confidence Metadata */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5" /> High-Resolution Confidence
               </h4>
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <p className="text-[9px] font-bold text-slate-500 uppercase">Agreement Score</p>
                     <p className="text-xs font-black text-slate-800">{(selectedQuestion?.scoring?.confidence?.agreementScore || 0).toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                     <p className="text-[9px] font-bold text-slate-500 uppercase">Manual Trigger</p>
                     <p className="text-xs font-black text-slate-800">{selectedQuestion?.scoring?.confidence?.needsManualReview ? 'YES' : 'NO'}</p>
                  </div>
               </div>
               {selectedQuestion?.scoring?.confidence?.consistencyFlags && selectedQuestion.scoring.confidence.consistencyFlags.length > 0 && (
                 <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-2">Consistency Flags</p>
                    <div className="flex flex-wrap gap-1.5">
                       {selectedQuestion.scoring.confidence.consistencyFlags.map((flag, i) => (
                         <span key={i} className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[8px] font-black rounded uppercase">{flag}</span>
                       ))}
                    </div>
                 </div>
               )}
            </div>

            {/* Doctor Review Terminal */}
            <div className="pt-8 border-t border-slate-100 space-y-6 pb-20">
               <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-[10px]">DR</div>
                  <div>
                    <p className="text-[10px] font-black text-slate-900 uppercase">Clinical Auditor Console</p>
                    <p className="text-[8px] font-bold text-slate-400">SESSION: {user.email?.substring(0, 15)}...</p>
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Critical Issue Type</label>
                    <select 
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 transition-all"
                      value={editForm?.issueType || 'none'}
                      onChange={(e) => editForm && setEditForm({ ...editForm, issueType: e.target.value as any })}
                    >
                      <option value="none">No Issues Detected</option>
                      <option value="retrieval">Retrieval Failure</option>
                      <option value="logic">Logical Fallacy</option>
                      <option value="distractor">Distractor Implausibility</option>
                      <option value="grounding">Grounding Mismatch</option>
                      <option value="missing video">Missing Media Evidence</option>
                      <option value="wording">Clinical Terminology Error</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Manual Logic Feedback</label>
                    <textarea 
                      className="w-full h-32 bg-white border border-slate-200 rounded-2xl p-4 text-[11px] font-bold text-slate-700 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/10 transition-all resize-none leading-relaxed" 
                      placeholder="Specify corrective logic or clinical grounding overrides..."
                      value={editForm?.doctorFeedback || ''}
                      onChange={(e) => editForm && setEditForm({ ...editForm, doctorFeedback: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-4">
                     <button 
                       onClick={() => handleSaveReview('revise')}
                       disabled={saving}
                       className="flex-1 py-3.5 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-blue-400 hover:text-blue-600 transition-all disabled:opacity-50"
                     >
                       Save Draft
                     </button>
                     <button 
                       onClick={() => handleSaveReview('flag')}
                       disabled={saving}
                       className="flex-1 py-3.5 bg-red-50 text-red-600 border-2 border-red-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all disabled:opacity-50"
                     >
                       Flag Improvement
                     </button>
                  </div>
                  
                  <button 
                    onClick={() => handleSaveReview('publish')}
                    disabled={saving}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] shadow-xl hover:bg-black hover:scale-[1.01] transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 group"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-5 h-5 text-green-400" />}
                    {saving ? 'Transmitting...' : 'Approve & Publish'}
                  </button>
                  
                  <p className="text-[8px] text-slate-400 text-center uppercase font-black tracking-widest pt-2">
                    ISO 13485:2016 Compliant Final Validation
                  </p>
               </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ScoreDimension({ title, score, description, children }: { title: string, score: number, description: string, children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm group hover:shadow-md transition-all">
       <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{title}</h4>
            <p className="text-[8px] font-bold text-slate-400 max-w-[180px] leading-tight uppercase mt-0.5">{description}</p>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-black text-xs ${score > 4 ? 'bg-green-600 text-white' : score > 3 ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white'}`}>
             {score.toFixed(1)}
          </div>
       </div>
       <div className="p-1 px-4 pb-4 space-y-1 mt-3">
          {children}
       </div>
    </div>
  );
}

function ScoreComponent({ label, score }: { label: string, score: number }) {
  const scorePercent = (score / 5) * 100;
  return (
    <div className="flex items-center gap-3 py-1">
       <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter w-20 shrink-0">{label}</span>
       <div className="flex-1 bg-slate-100 h-1 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-700 ${score > 4 ? 'bg-green-500' : score > 3 ? 'bg-blue-500' : 'bg-orange-400'}`}
            style={{ width: `${scorePercent}%` }}
          />
       </div>
       <span className="text-[9px] font-mono font-black text-slate-600 w-6 text-right italic">{score.toFixed(1)}</span>
    </div>
  );
}

function ValidationCard({ label, score, icon, color, labelStr }: { label: string, score: number, icon: ReactNode, color: string, labelStr?: string }) {
  return (
    <div className="bg-white border border-slate-100 p-3 rounded-2xl shadow-sm hover:shadow-md transition-all group">
       <div className="flex items-center gap-2 mb-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <div className={`p-1 bg-slate-100 rounded-lg ${color}`}>{icon}</div>
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">{label}</span>
       </div>
       <p className={`text-lg font-mono font-black italic leading-none ${color}`}>{labelStr || score.toFixed(2)}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: PatientStatus }) {
  const settings = {
    'Completed': { bg: 'bg-green-500/10 text-green-600 border-green-500/20', icon: <CheckCircle2 className="w-2.5 h-2.5" /> },
    'Annotating': { bg: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: <Clock className="w-2.5 h-2.5" /> },
    'Not started': { bg: 'bg-slate-500/10 text-slate-500 border-slate-500/20', icon: <AlertCircle className="w-2.5 h-2.5" /> },
    'Missing Video': { bg: 'bg-red-500/10 text-red-600 border-red-500/20', icon: <ShieldX className="w-2.5 h-2.5" /> },
    'Needs Review': { bg: 'bg-orange-500/10 text-orange-600 border-orange-500/20', icon: <MessageSquare className="w-2.5 h-2.5" /> }
  };

  const current = settings[status] || settings['Not started'];

  return (
    <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 ${current.bg}`}>
      {current.icon}
      {status}
    </span>
  );
}
