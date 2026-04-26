import jsPDF from "jspdf";
import type { DatasetProfile } from "./profiler";

export function exportReportPDF(opts: {
  profile: DatasetProfile;
  fileName: string;
  insights: { text: string; why?: string; confidence: number; tag: string }[];
  story?: string;
  narrative?: string;
}) {
  const { profile, fileName, insights, story, narrative } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;

  const stripMd = (s: string) => s.replace(/\*\*/g, "").replace(/`/g, "").replace(/^#+\s*/gm, "");

  const writeWrapped = (text: string, size = 11, gap = 4) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(stripMd(text), W - M * 2);
    for (const line of lines) {
      if (y > H - M) { doc.addPage(); y = M; }
      doc.text(line, M, y);
      y += size + gap;
    }
  };
  const heading = (text: string) => {
    y += 8;
    if (y > H - M - 30) { doc.addPage(); y = M; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 184, 200);
    doc.text(text, M, y);
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    y += 16;
  };

  // Cover
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 110, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Dataset Intelligence Report", M, 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(fileName, M, 84);
  doc.setTextColor(20, 184, 200);
  doc.text(`Trust Score · ${profile.trustScore}/100`, W - M - 150, 84);
  doc.setTextColor(20, 20, 20);
  y = 140;

  heading("Overview");
  writeWrapped(`Rows: ${profile.rowCount}    Columns: ${profile.colCount}    Duplicates: ${profile.duplicateRows}    Missing: ${profile.missingPct.toFixed(1)}%`);

  if (narrative) { heading("Behavior Narrative"); writeWrapped(narrative); }

  heading("Key Insights");
  for (const i of insights) {
    writeWrapped(`• [${i.tag} · ${(i.confidence * 100).toFixed(0)}%] ${i.text}`);
    if (i.why) writeWrapped(`    Why this matters: ${i.why}`, 10, 3);
  }

  if (profile.risks.length) { heading("Risks"); for (const r of profile.risks) writeWrapped(`• ${r}`); }
  if (profile.contradictions.length) { heading("Contradictions"); for (const r of profile.contradictions) writeWrapped(`• ${r}`); }
  if (profile.humanErrors.length) { heading("Human-Error Signals"); for (const r of profile.humanErrors) writeWrapped(`• ${r}`); }
  if (profile.recommendedActions.length) { heading("Recommended Actions"); for (const r of profile.recommendedActions) writeWrapped(`• ${r}`); }

  heading("Column Profile");
  for (const c of profile.columns.slice(0, 30)) {
    writeWrapped(`${c.name}  —  ${c.type}, missing ${c.missingPct.toFixed(1)}%, unique ${c.unique}`, 10, 2);
  }

  if (story) { heading("Data Story"); writeWrapped(story); }

  doc.save(`${fileName.replace(/\.[^.]+$/, "")}-intelligence-report.pdf`);
}
