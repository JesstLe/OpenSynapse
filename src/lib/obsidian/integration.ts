import * as fs from 'fs/promises';
import * as path from 'path';

export interface ObsidianNote {
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class ObsidianIntegration {
  private vaultPath: string;

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath;
  }

  async saveNote(note: ObsidianNote): Promise<void> {
    const filename = `${this.sanitizeFilename(note.title)}.md`;
    const filepath = path.join(this.vaultPath, filename);

    const frontmatter = this.generateFrontmatter(note);
    const content = `${frontmatter}\n\n${note.content}`;

    await fs.writeFile(filepath, content, 'utf-8');
  }

  async readNote(title: string): Promise<ObsidianNote | null> {
    const filename = `${this.sanitizeFilename(title)}.md`;
    const filepath = path.join(this.vaultPath, filename);

    try {
      const content = await fs.readFile(filepath, 'utf-8');
      return this.parseNote(content, title);
    } catch {
      return null;
    }
  }

  async listNotes(): Promise<string[]> {
    const files = await fs.readdir(this.vaultPath);
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''));
  }

  async syncFromOpenSynapse(notes: ObsidianNote[]): Promise<void> {
    for (const note of notes) {
      await this.saveNote(note);
    }
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_');
  }

  private generateFrontmatter(note: ObsidianNote): string {
    const tags = note.tags.map((t) => `"${t}"`).join(', ');
    return `---\ntitle: "${note.title}"\ndate: ${note.createdAt.toISOString()}\ntags: [${tags}]\nsource: opensynapse\n---`;
  }

  private parseNote(content: string, title: string): ObsidianNote {
    const lines = content.split('\n');
    let inFrontmatter = false;
    let frontmatterEnd = 0;
    let tags: string[] = [];
    let createdAt = new Date();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true;
        } else {
          frontmatterEnd = i;
          break;
        }
      }
      if (line.startsWith('tags:')) {
        const tagsMatch = line.match(/\[(.*?)\]/);
        if (tagsMatch) {
          tags = tagsMatch[1].split(',').map((t) => t.trim().replace(/"/g, ''));
        }
      }
      if (line.startsWith('date:')) {
        const dateStr = line.replace('date:', '').trim();
        createdAt = new Date(dateStr);
      }
    }

    const bodyContent = lines.slice(frontmatterEnd + 1).join('\n').trim();

    return {
      title,
      content: bodyContent,
      tags,
      createdAt,
      updatedAt: new Date(),
    };
  }
}
