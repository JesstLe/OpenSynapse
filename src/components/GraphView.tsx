import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Note, Flashcard } from '../types';
import { Network, X, ExternalLink, Brain, Search, Maximize, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GraphViewProps {
  key?: string;
  notes: Note[];
  flashcards: Flashcard[];
  onNodeClick?: (id: string) => void;
}

export default function GraphView({ notes, flashcards, onNodeClick }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [search, setSearch] = useState('');
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    if (!svgRef.current || notes.length === 0) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Filter nodes based on search
    const filteredNotes = notes.filter(n => 
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    );

    const nodes = filteredNotes.map(n => {
      const noteCards = flashcards.filter(f => f.noteId === n.id);
      const avgDifficulty = noteCards.length > 0 
        ? noteCards.reduce((acc, c) => acc + c.difficulty, 0) / noteCards.length 
        : 5;
      const dueCount = noteCards.filter(c => c.nextReview <= Date.now()).length;
      
      // Forgetting Score: (avgDifficulty * dueCount) / max possible
      // Higher score = more "red" (needs attention)
      const score = Math.min(10, (avgDifficulty * (dueCount + 1)) / 2);
      
      return { ...n, score };
    });
    const links: { source: string; target: string }[] = [];

    filteredNotes.forEach(note => {
      note.relatedIds.forEach(relatedId => {
        if (filteredNotes.find(n => n.id === relatedId)) {
          links.push({ source: note.id, target: relatedId });
        }
      });
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Container for zoom
    const g = svg.append("g");

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    zoomRef.current = zoom;
    svg.call(zoom);

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(60));

    const link = g.append("g")
      .attr("stroke", "rgba(255, 255, 255, 0.1)")
      .attr("stroke-width", 1.5)
      .selectAll("line")
      .data(links)
      .join("line");

    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "cursor-pointer")
      .on("click", (event, d: any) => {
        event.stopPropagation();
        setSelectedNote(d as Note);
      })
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any);

    const colorScale = d3.scaleLinear<string>()
      .domain([0, 5, 10])
      .range(["#22c55e", "#eab308", "#ef4444"]);

    node.append("circle")
      .attr("r", 10)
      .attr("fill", (d: any) => d.id === selectedNote?.id ? "#fff" : colorScale(d.score))
      .attr("stroke", (d: any) => d.id === selectedNote?.id ? "#f97316" : "rgba(255, 255, 255, 0.1)")
      .attr("stroke-width", (d: any) => d.id === selectedNote?.id ? 3 : 1.5)
      .attr("class", "transition-all duration-300 hover:r-12 shadow-lg");

    node.append("text")
      .text(d => d.title)
      .attr("x", 16)
      .attr("y", 4)
      .attr("fill", "rgba(255, 255, 255, 0.8)")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .attr("class", "pointer-events-none uppercase tracking-wider drop-shadow-md");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [notes, search, selectedNote?.id]);

  const resetZoom = () => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(750)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  };

  return (
    <div className="w-full h-full bg-[#0A0A0A] relative overflow-hidden" onClick={() => setSelectedNote(null)}>
      <div className="absolute top-8 left-8 z-10 flex flex-col gap-4">
        <div className="pointer-events-none">
          <h2 className="text-2xl font-bold tracking-tighter">知识图谱</h2>
          <p className="text-sm text-white/40">可视化你大脑中的语义连接。</p>
        </div>
        
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              type="text"
              placeholder="搜索节点..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:border-orange-500/50 transition-all w-48"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); resetZoom(); }}
            className="p-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
            title="重置缩放"
          >
            <Maximize size={16} className="text-white/40" />
          </button>
        </div>
      </div>
      
      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-white/20">
          <Network size={64} strokeWidth={1} className="mb-4 opacity-20" />
          <p className="text-sm font-medium uppercase tracking-widest">尚未发现任何连接</p>
        </div>
      ) : (
        <svg ref={svgRef} className="w-full h-full" />
      )}

      {/* Note Preview Panel */}
      <AnimatePresence>
        {selectedNote && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="absolute top-0 right-0 h-full w-80 bg-[#141414] border-l border-white/10 p-8 z-20 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-8">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Brain className="w-5 h-5 text-orange-500" />
              </div>
              <button 
                onClick={() => setSelectedNote(null)}
                className="p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <X size={20} className="text-white/40" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="text-xl font-bold mb-4 leading-tight">{selectedNote.title}</h3>
              <p className="text-sm text-white/60 mb-6 leading-relaxed">
                {selectedNote.summary}
              </p>

              <div className="space-y-6">
                <div>
                  <h4 className="text-[10px] uppercase tracking-widest font-black text-white/20 mb-3">标签</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedNote.tags.map(tag => (
                      <span key={tag} className="px-2 py-1 rounded-md bg-white/5 border border-white/5 text-[10px] text-white/40 font-bold">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedNote.relatedIds.length > 0 && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-widest font-black text-white/20 mb-3">相关连接</h4>
                    <div className="space-y-2">
                      {selectedNote.relatedIds.map(id => {
                        const related = notes.find(n => n.id === id);
                        if (!related) return null;
                        return (
                          <div key={id} className="text-xs text-white/40 flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-blue-500" />
                            {related.title}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => onNodeClick?.(selectedNote.id)}
              className="mt-8 w-full py-4 bg-orange-500 hover:bg-orange-600 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all group"
            >
              查看完整笔记
              <ExternalLink size={16} className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="absolute bottom-8 left-8 flex flex-col gap-4 pointer-events-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-white/40">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            记忆稳固
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-white/40">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            认知负荷
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-white/40">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            亟需复习
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-white/40">
          <div className="w-4 h-[1px] bg-white/20" />
          语义链接
        </div>
      </div>
    </div>
  );
}
