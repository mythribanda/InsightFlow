import { useCallback, useState } from "react";
import { CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";

export function FileDrop({ onFile, busy }: { onFile: (f: File) => void; busy?: boolean }) {
  const [hover, setHover] = useState(false);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setHover(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      className={cn(
        "relative w-full flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-300 cursor-pointer select-none",
        "bg-white/2 border-white/10 hover:border-primary/40 hover:bg-white/5",
        hover && "border-primary bg-primary/5 scale-[1.01] glow-sm",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <div className={cn(
        "relative flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-300 shadow-lg",
        hover ? "bg-primary/20 scale-110" : "bg-gradient-to-br from-[#8B5CF6] to-[#A855F7]",
      )}>
        {busy ? (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <CloudUpload className="h-6 w-6 text-white animate-pulse" />
        )}
      </div>
      <div className="relative">
        <p className="text-sm font-bold text-slate-200">
          {busy ? "Analyzing your dataset…" : "Drag & drop your file here"}
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          {busy ? "Profiling columns and computing scores..." : "or click to browse"}
        </p>
      </div>
      <input
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls"
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
