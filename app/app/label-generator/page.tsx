'use client';

export default function LabelGeneratorPage() {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900 h-[calc(100dvh-6.5rem)] min-h-[480px]">
      <iframe
        src="/label-generator/index.html"
        title="MGH Labelgenerator"
        className="w-full h-full border-0"
      />
    </div>
  );
}
