import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Note, Flashcard } from '../types';

interface MiniGraphProps {
  notes: Note[];
  flashcards: Flashcard[];
  activeNoteId: string;
}

export default function MiniGraph({ notes, flashcards, activeNoteId }: MiniGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || notes.length === 0) return;

    const width = 300;
    const height = 300;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Filter notes to show only active note and its neighbors
    const activeNote = notes.find(n => n.id === activeNoteId);
    if (!activeNote) return;

    const neighborIds = new Set([activeNoteId, ...activeNote.relatedIds]);
    const filteredNotes = notes.filter(n => neighborIds.has(n.id));
    
    const nodes = filteredNotes.map(n => {
      const noteCards = flashcards.filter(f => f.noteId === n.id);
      const avgDifficulty = noteCards.length > 0 
        ? noteCards.reduce((acc, c) => acc + c.difficulty, 0) / noteCards.length 
        : 5;
      const dueCount = noteCards.filter(c => c.nextReview <= Date.now()).length;
      const score = Math.min(10, (avgDifficulty * (dueCount + 1)) / 2);
      return { ...n, score };
    });
    const links: any[] = [];
    
    filteredNotes.forEach(n => {
      n.relatedIds.forEach(rid => {
        if (neighborIds.has(rid)) {
          links.push({ source: n.id, target: rid });
        }
      });
    });

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(50))
      .force("charge", d3.forceManyBody().strength(-100))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
      .attr("stroke", "#ffffff10")
      .attr("stroke-width", 1)
      .selectAll("line")
      .data(links)
      .join("line");

    const colorScale = d3.scaleLinear<string>()
      .domain([0, 5, 10])
      .range(["#22c55e", "#eab308", "#ef4444"]);

    const node = svg.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d: any) => d.id === activeNoteId ? 6 : 4)
      .attr("fill", (d: any) => d.id === activeNoteId ? "#f97316" : colorScale(d.score))
      .attr("stroke", (d: any) => d.id === activeNoteId ? "#f9731640" : "none")
      .attr("stroke-width", 4);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);
    });

    return () => {
      simulation.stop();
    };
  }, [notes, activeNoteId]);

  return (
    <div className="w-[300px] h-[300px] opacity-40 pointer-events-none">
      <svg ref={svgRef} width="300" height="300" />
    </div>
  );
}
