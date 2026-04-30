import { useMemo, useState } from "react";
import {
  Activity, Beaker, BookOpen, Brain, Check, ChevronRight,
  ClipboardList, Database, Eye, FileText, Filter, Layers,
  Loader2, MessageSquare, Microscope, Sparkles, Stethoscope,
  Target, TrendingUp, Video, Workflow,
} from "lucide-react";

// Palette: #F1A7A1 #006F77 #60D0CF #A54C52 #FF6D4E
const C = {
  pink:    "#F1A7A1",
  teal:    "#006F77",
  cyan:    "#60D0CF",
  wine:    "#A54C52",
  orange:  "#FF6D4E",
};

// ───────────────────────────── mock data ──────────────────────────────
const PHASES = [
  { id: "P0", name: "Pre-op Planning",   color: C.teal },
  { id: "P1", name: "Exposure",          color: C.cyan },
  { id: "P2", name: "Mobilization",      color: C.orange },
  { id: "P3", name: "Vascular Control",  color: C.wine },
  { id: "P4", name: "Resection",         color: C.pink },
  { id: "P5", name: "Anastomosis",       color: C.teal },
];

const STEPS_BY_PHASE: Record<string, string[]> = {
  P0: ["Patient Positioning", "Trocar Placement", "Pneumoperitoneum"],
  P1: ["Greater Omentum", "Splenic Flexure", "Hepatic Flexure"],
  P2: ["Lateral Mobilization", "Medial-to-Lateral", "TME Plane"],
  P3: ["IMA Identification", "IMA Ligation", "IMV Division"],
  P4: ["Mesentery Division", "Bowel Transection", "Specimen Extraction"],
  P5: ["Anvil Insertion", "Stapled Anastomosis", "Leak Test"],
};

// 4-axis radar mock — values in 0..1
const RADAR = [
  { axis: "Anatomy",     value: 0.78, target: 1.0 },
  { axis: "Instrument",  value: 0.42, target: 1.0 },
  { axis: "Interaction", value: 0.65, target: 1.0 },
  { axis: "Decision",    value: 0.31, target: 1.0 },
];

const COVERAGE = [
  { label: "Tumor location", count: 42, total: 60 },
  { label: "Resection type", count: 38, total: 60 },
  { label: "Stoma type",     count: 18, total: 60 },
  { label: "Approach",       count: 55, total: 60 },
  { label: "Neoadjuvant",    count: 24, total: 60 },
  { label: "Lateral LN",     count: 9,  total: 60 },
];

const DIFF_TYPES = [
  { id: "anatomy",     label: "Anatomy",     icon: Microscope, color: C.teal,
    hint: "Compare anatomical variants and resulting decision change." },
  { id: "instrument",  label: "Instrument",  icon: Beaker,     color: C.orange,
    hint: "Why a specific tool/energy device was chosen." },
  { id: "interaction", label: "Interaction", icon: Activity,   color: C.cyan,
    hint: "How surgeon-tissue actions evolve during this step." },
  { id: "decision",    label: "Decision",    icon: Brain,      color: C.wine,
    hint: "Clinical reasoning that triggered a pivot in plan." },
];

// ───────────────────────────── helpers ────────────────────────────────
function Card({ title, icon: Icon, accent, children, right }: any) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <header className="px-5 py-3 flex items-center justify-between border-b border-slate-100"
              style={{ background: `linear-gradient(90deg, ${accent}14, transparent)` }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
               style={{ background: `${accent}1f`, color: accent }}>
            {Icon && <Icon className="w-4 h-4" />}
          </div>
          <h3 className="text-[11px] font-black tracking-widest uppercase text-slate-800">{title}</h3>
        </div>
        {right}
      </header>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function Pill({ label, color, active, onClick }: any) {
  return (
    <button onClick={onClick}
      className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all border"
      style={{
        background: active ? color : `${color}12`,
        color: active ? "#fff" : color,
        borderColor: active ? color : `${color}33`,
      }}>
      {label}
    </button>
  );
}

// ─────────────────────── Radar chart (SVG) ────────────────────────────
function RadarChart() {
  const size = 240, cx = size/2, cy = size/2, R = 95;
  const N = RADAR.length;
  const angle = (i: number) => -Math.PI/2 + (i * 2*Math.PI / N);
  const point = (i: number, v: number) => [cx + R*v*Math.cos(angle(i)), cy + R*v*Math.sin(angle(i))];
  const dataPath = RADAR.map((d, i) => point(i, d.value).join(",")).join(" ");

  return (
    <div className="flex items-center justify-center">
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="radar-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor={C.teal}   stopOpacity="0.55"/>
            <stop offset="100%" stopColor={C.cyan}  stopOpacity="0.25"/>
          </linearGradient>
        </defs>
        {/* grid rings */}
        {[0.25, 0.5, 0.75, 1].map((r, i) => (
          <polygon key={i}
            points={RADAR.map((_, j) => point(j, r).join(",")).join(" ")}
            fill="none" stroke="#cbd5e1" strokeOpacity={0.5} strokeDasharray="3 3"/>
        ))}
        {/* spokes */}
        {RADAR.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#cbd5e1" strokeOpacity={0.5}/>;
        })}
        {/* data area */}
        <polygon points={dataPath} fill="url(#radar-grad)" stroke={C.teal} strokeWidth={2}/>
        {/* data dots */}
        {RADAR.map((d, i) => {
          const [x, y] = point(i, d.value);
          return <circle key={i} cx={x} cy={y} r={4} fill={C.orange} stroke="#fff" strokeWidth={1.5}/>;
        })}
        {/* labels */}
        {RADAR.map((d, i) => {
          const [x, y] = point(i, 1.18);
          return (
            <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                  fontSize="11" fontWeight="700" fill="#334155">
              {d.axis}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────── Bar chart for coverage (SVG) ─────────────────────
function CoverageBars() {
  const max = Math.max(...COVERAGE.map(c => c.total));
  return (
    <div className="space-y-2.5">
      {COVERAGE.map((c) => {
        const pct = c.count / max;
        const rare = c.count / c.total < 0.25;
        return (
          <div key={c.label}>
            <div className="flex items-center justify-between text-[10px] font-bold mb-1">
              <span className="text-slate-700 uppercase tracking-wider">{c.label}</span>
              <span className="text-slate-500">{c.count}/{c.total}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden relative">
              <div className="h-full rounded-full transition-all"
                   style={{
                     width: `${pct*100}%`,
                     background: rare
                       ? `linear-gradient(90deg, ${C.wine}, ${C.orange})`
                       : `linear-gradient(90deg, ${C.teal}, ${C.cyan})`,
                   }}/>
            </div>
            {rare && (
              <p className="text-[9px] mt-1 font-bold uppercase tracking-wider"
                 style={{color: C.wine}}>
                Rare → robustness candidate
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── the page ────────────────────────────────
export default function SeedDesigner() {
  const [phase, setPhase]       = useState("P3");
  const [step, setStep]         = useState(STEPS_BY_PHASE.P3[0]);
  const [diffType, setDiffType] = useState("anatomy");
  const [annotation, setAnnotation] = useState({
    anatomy: "", instrument: "", interaction: "", findings: "",
  });
  const [logic, setLogic] = useState({
    compare: "", reasoning: "", evidence: "",
  });
  const [emr, setEmr] = useState({ required: "ASA, T-stage, neoadjuvant", scope: "Pre-op + day-7", signals: "" });
  const [retrieval, setRetrieval] = useState({ db: "patient", strategy: "semantic", filter: "" });
  const [video, setVideo] = useState({ relevance: "high", ordering: "before", mapping: "" });
  const [aiOut, setAiOut] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const steps = useMemo(() => STEPS_BY_PHASE[phase] ?? [], [phase]);
  const currentDiff = DIFF_TYPES.find(d => d.id === diffType)!;

  function suggest() {
    setAiBusy(true);
    setTimeout(() => {
      setAiOut(
        `Seed Question (${phase} · ${currentDiff.label}):\n` +
        `In step "${step}", given that ${logic.compare || "[A vs B is being compared]"}, ` +
        `what reasoning links ${logic.reasoning || "[the chosen approach]"} ` +
        `with ${logic.evidence || "[supporting EMR/video evidence]"}? ` +
        `Provide a clinically defensible decision and cite the evidence anchor.`
      );
      setAiBusy(false);
    }, 700);
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Banner */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{color: C.teal}}/>
            Seed Question Designer
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Step b · Annotation  →  Step c · Seed Design  →  Logic Points
          </p>
        </div>
        <div className="flex items-center gap-2">
          {PHASES.map(p => (
            <Pill key={p.id} label={p.id} color={p.color}
                  active={phase === p.id}
                  onClick={() => { setPhase(p.id); setStep(STEPS_BY_PHASE[p.id][0]); }}/>
          ))}
        </div>
      </div>

      {/* 3-column main */}
      <div className="p-6 grid grid-cols-12 gap-6">
        {/* LEFT — Annotation */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card title="Phase / Step" icon={Workflow} accent={C.teal}>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Phase</label>
              <div className="mt-1 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-800 text-sm flex items-center justify-between">
                <span>{phase} · {PHASES.find(p => p.id === phase)?.name}</span>
                <span className="w-2 h-2 rounded-full" style={{background: PHASES.find(p => p.id === phase)?.color}}/>
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Step</label>
              <select value={step} onChange={e => setStep(e.target.value)}
                      className="mt-1 w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2"
                      style={{ outlineColor: C.teal }}>
                {steps.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </Card>

          <Card title="Video Player" icon={Video} accent={C.cyan}>
            <div className="aspect-video rounded-xl bg-slate-900 flex items-center justify-center text-slate-500 text-xs font-bold uppercase tracking-widest border border-slate-800">
              <div className="text-center">
                <Video className="w-8 h-8 mx-auto mb-2 opacity-40"/>
                Drop / link video for {phase} · {step}
              </div>
            </div>
          </Card>

          <Card title="Structured Annotation" icon={ClipboardList} accent={C.orange}>
            {[
              { k: "anatomy",     label: "Anatomy",     ph: "e.g. low rectum, redundant sigmoid" },
              { k: "instrument",  label: "Instrument",  ph: "e.g. Harmonic, EndoGIA 60mm purple" },
              { k: "interaction", label: "Interaction", ph: "e.g. retraction → counter-traction → score" },
              { k: "findings",    label: "Findings",    ph: "e.g. T4 invasion at 5cm AV" },
            ].map(({ k, label, ph }) => (
              <div key={k}>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</label>
                <input value={(annotation as any)[k]}
                       onChange={e => setAnnotation({...annotation, [k]: e.target.value})}
                       placeholder={ph}
                       className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2"
                       style={{ outlineColor: C.orange }}/>
              </div>
            ))}
          </Card>
        </div>

        {/* MIDDLE — Insight */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card title="Patient Difference Landscape" icon={TrendingUp} accent={C.teal}
                right={<span className="text-[9px] text-slate-400 font-bold uppercase">4-axis radar</span>}>
            <RadarChart/>
            <div className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
              <span className="font-bold text-slate-700">Tip · </span>
              Low axis = underrepresented → design more questions targeting that dimension.
            </div>
            <div className="grid grid-cols-2 gap-2">
              {RADAR.map(d => {
                const low = d.value < 0.5;
                return (
                  <div key={d.axis} className="rounded-lg border p-2 flex items-center justify-between"
                       style={{ borderColor: low ? `${C.wine}55` : "#e2e8f0",
                                background:   low ? `${C.wine}0d` : "#fff" }}>
                    <span className="text-[10px] font-bold uppercase text-slate-700">{d.axis}</span>
                    <span className="text-xs font-black" style={{color: low ? C.wine : C.teal}}>
                      {(d.value*100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Clinical Variable Coverage" icon={Layers} accent={C.orange}
                right={<span className="text-[9px] text-slate-400 font-bold uppercase">Bar chart</span>}>
            <CoverageBars/>
            <div className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-100">
              <span className="font-bold text-slate-700">Tip · </span>
              Rare categories (highlighted) are robustness-test candidates.
            </div>
          </Card>
        </div>

        {/* RIGHT — Seed Design */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <Card title="Seed Template" icon={FileText} accent={C.wine}>
            <div className="rounded-xl p-4 text-white text-sm font-bold leading-relaxed"
                 style={{background: `linear-gradient(135deg, ${C.teal}, ${C.wine})`}}>
              Seed = (
                <span className="px-2 py-0.5 mx-1 rounded-md text-[11px] font-mono"
                      style={{background: "rgba(255,255,255,0.2)"}}>
                  {phase}
                </span>,
                <span className="px-2 py-0.5 mx-1 rounded-md text-[11px] font-mono"
                      style={{background: "rgba(255,255,255,0.2)"}}>
                  {currentDiff.label}
                </span>,
                <span className="px-2 py-0.5 mx-1 rounded-md text-[11px] font-mono"
                      style={{background: "rgba(255,255,255,0.2)"}}>
                  Clinical Logic
                </span>
              )
            </div>
          </Card>

          <Card title="Difference Type" icon={Filter} accent={C.cyan}>
            <div className="grid grid-cols-2 gap-2">
              {DIFF_TYPES.map(t => {
                const active = diffType === t.id;
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => setDiffType(t.id)}
                          className="rounded-xl border p-3 text-left transition-all"
                          style={{
                            background: active ? `${t.color}10` : "#fff",
                            borderColor: active ? t.color : "#e2e8f0",
                            boxShadow: active ? `0 0 0 2px ${t.color}33` : undefined,
                          }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4" style={{color: t.color}}/>
                      <span className="text-xs font-black uppercase" style={{color: t.color}}>{t.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug">{t.hint}</p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Clinical Logic Builder" icon={Brain} accent={C.orange}>
            {[
              { k: "compare",   label: "What is compared?",     ph: "e.g. low ligation vs high ligation" },
              { k: "reasoning", label: "What reasoning is required?", ph: "e.g. preserve LCA when..." },
              { k: "evidence",  label: "What evidence is needed?",    ph: "e.g. EMR T-stage + video step P3" },
            ].map(({k, label, ph}) => (
              <div key={k}>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</label>
                <textarea value={(logic as any)[k]}
                          onChange={e => setLogic({...logic, [k]: e.target.value})}
                          placeholder={ph}
                          rows={2}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2"
                          style={{ outlineColor: C.orange }}/>
              </div>
            ))}

            <button onClick={suggest} disabled={aiBusy}
                    className="w-full mt-2 py-3 rounded-xl text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-60"
                    style={{ background: `linear-gradient(90deg, ${C.teal}, ${C.cyan})` }}>
              {aiBusy
                ? <><Loader2 className="w-4 h-4 animate-spin"/> Generating…</>
                : <><Sparkles className="w-4 h-4"/> AI Suggest Seed Question</>}
            </button>

            {aiOut && (
              <div className="mt-3 rounded-xl p-4 border text-xs leading-relaxed text-slate-800 whitespace-pre-line"
                   style={{ background: `${C.pink}1a`, borderColor: `${C.pink}66` }}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5" style={{color: C.wine}}/>
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{color: C.wine}}>
                    AI Suggestion
                  </span>
                </div>
                {aiOut}
              </div>
            )}
          </Card>
        </div>

        {/* BOTTOM — Logic Points */}
        <div className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card title="EMR Constraints" icon={Stethoscope} accent={C.teal}>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Required fields</label>
              <input value={emr.required} onChange={e => setEmr({...emr, required: e.target.value})}
                     className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"/>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Temporal scope</label>
              <input value={emr.scope} onChange={e => setEmr({...emr, scope: e.target.value})}
                     className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"/>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Patient-specific signals</label>
              <input value={emr.signals} onChange={e => setEmr({...emr, signals: e.target.value})}
                     placeholder="e.g. low albumin, high CEA"
                     className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"/>
            </div>
          </Card>

          <Card title="Retrieval Control" icon={Database} accent={C.orange}>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Database</label>
              <div className="mt-1 flex gap-2">
                {[
                  { id: "patient", label: "Patient DB" },
                  { id: "medical", label: "Medical KB" },
                ].map(o => {
                  const active = retrieval.db === o.id;
                  return (
                    <button key={o.id} onClick={() => setRetrieval({...retrieval, db: o.id})}
                            className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all"
                            style={{
                              background: active ? C.orange : "#fff",
                              color:      active ? "#fff"   : "#475569",
                              borderColor: active ? C.orange : "#e2e8f0",
                            }}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Query strategy</label>
              <select value={retrieval.strategy}
                      onChange={e => setRetrieval({...retrieval, strategy: e.target.value})}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <option value="semantic">Semantic similarity</option>
                <option value="keyword">Keyword exact</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Field filtering</label>
              <input value={retrieval.filter} onChange={e => setRetrieval({...retrieval, filter: e.target.value})}
                     placeholder="e.g. T-stage ∈ {T3,T4} AND age ≥ 60"
                     className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"/>
            </div>
          </Card>

          <Card title="Video Logic" icon={Eye} accent={C.wine}>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Step relevance</label>
              <div className="mt-1 flex gap-2">
                {["high", "medium", "low"].map(v => {
                  const active = video.relevance === v;
                  return (
                    <button key={v} onClick={() => setVideo({...video, relevance: v})}
                            className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all"
                            style={{
                              background: active ? C.wine : "#fff",
                              color:      active ? "#fff"  : "#475569",
                              borderColor: active ? C.wine : "#e2e8f0",
                            }}>
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Temporal ordering</label>
              <select value={video.ordering}
                      onChange={e => setVideo({...video, ordering: e.target.value})}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <option value="before">Before this step</option>
                <option value="during">During this step</option>
                <option value="after">After this step</option>
                <option value="across">Across multiple steps</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Action–effect mapping</label>
              <input value={video.mapping} onChange={e => setVideo({...video, mapping: e.target.value})}
                     placeholder="e.g. clip → IMA stump → no bleeding"
                     className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"/>
            </div>
          </Card>
        </div>
      </div>

      {/* footer summary strip */}
      <div className="px-6 pb-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
                 style={{background: C.teal}}>
              <BookOpen className="w-4 h-4"/>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Seed Draft</p>
              <p className="text-sm font-bold text-slate-900">
                {phase} · {currentDiff.label} · {step}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5"/> Save Draft
            </button>
            <button className="px-4 py-2 rounded-lg text-white text-xs font-black uppercase tracking-widest flex items-center gap-2"
                    style={{background: C.orange}}>
              <Check className="w-3.5 h-3.5"/> Submit Seed
              <ChevronRight className="w-3.5 h-3.5"/>
            </button>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-3 uppercase tracking-widest font-bold flex items-center justify-center gap-2">
          <Target className="w-3 h-3"/> Designer mode · mock data shown
        </p>
      </div>
    </div>
  );
}
