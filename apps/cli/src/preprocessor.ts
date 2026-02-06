import { FileInput, IFileAsset } from './types';
import { AssetStore } from './asset-store';
import { AIExtractor } from './ai-extractor';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * File preprocessor for asset and reference files
 * - Handles deduplication via MD5 hashing
 * - Extracts summaries with GPT-4o-mini
 * - Stores processed files to ./assets/
 * - Attaches base64 URL for API transmission
 */
export class FilePreprocessor {
  private assetStore: AssetStore;
  private aiExtractor: AIExtractor;

  constructor(
    openRouterApiKey: string,
    assetsDir: string = './assets',
    openRouterBaseUrl?: string,
    aiModel?: string
  ) {
    this.assetStore = new AssetStore(assetsDir);
    this.aiExtractor = new AIExtractor(
      openRouterApiKey,
      openRouterBaseUrl,
      aiModel
    );
  }

  /**
   * Process multiple file inputs
   */
  async processFiles(files: FileInput[]): Promise<IFileAsset[]> {
    const results: IFileAsset[] = [];

    for (const file of files) {
      try {
        const asset = await this.processFile(file);
        results.push(asset);
      } catch (error: any) {
        console.error(`Failed to process file ${file.path}:`, error.message);
        throw error;
      }
    }

    return results;
  }

  /**
   * Process single file with deduplication
   */
  async processFile(file: FileInput): Promise<IFileAsset> {
    // Read file
    const buffer = fs.readFileSync(file.path);
    const hash = AssetStore.calculateHash(buffer);

    // Check if already processed
    const existing = this.assetStore.load(hash);
    if (existing) {
      console.log(`Using cached asset: ${file.path}`);
      // Attach base64 URL and return
      return this.attachBase64Url(existing, buffer, file);
    }

    // New file - extract content
    console.log(`Processing new file: ${file.path}`);
    const fileInfo = this.getFileInfo(file.path, buffer);
    const extraction = await this.extractContent(buffer, fileInfo.type, fileInfo.filename);

    // Build IFileAsset
    const asset: IFileAsset = {
      id: uuidv4(),
      hash,
      type: fileInfo.type,
      usage: file.usage,
      filename: fileInfo.filename,
      filepath: file.path,
      mime_type: fileInfo.mime_type,
      size_bytes: buffer.length,
      url: this.buildDataUrl(buffer, fileInfo.mime_type),
      summary: extraction.summary,
      key_points: extraction.key_points,
      important_citations: extraction.important_citations,
      alt_text: file.alt_text,
      caption: file.caption,
      placement_hint: file.placement_hint,
      metadata: extraction.metadata,
      processed_at: new Date().toISOString(),
      model_used: 'openai/gpt-4o-mini',
    };

    // Save to store (without URL)
    this.assetStore.save(asset);

    return asset;
  }

  /**
   * Attach base64 URL to existing asset (for API transmission)
   */
  private attachBase64Url(
    asset: IFileAsset,
    buffer: Buffer,
    file: FileInput
  ): IFileAsset {
    return {
      ...asset,
      url: this.buildDataUrl(buffer, asset.mime_type),
      // Update optional fields from file input
      alt_text: file.alt_text || asset.alt_text,
      caption: file.caption || asset.caption,
      placement_hint: file.placement_hint || asset.placement_hint,
    };
  }

  /**
   * Extract file info from path and buffer
   */
  private getFileInfo(
    filepath: string,
    buffer: Buffer
  ): {
    filename: string;
    type: 'image' | 'screenshot' | 'pdf' | 'document';
    mime_type: string;
  } {
    const filename = path.basename(filepath);
    const ext = path.extname(filepath).toLowerCase();

    // Determine type and mime
    let type: 'image' | 'screenshot' | 'pdf' | 'document';
    let mime_type: string;

    if (ext === '.pdf') {
      type = 'pdf';
      mime_type = 'application/pdf';
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      // Heuristic: if filename contains 'screenshot', 'screen', or 'capture'
      type = /screenshot|screen|capture/i.test(filename) ? 'screenshot' : 'image';
      mime_type = `image/${ext.substring(1)}`;
      if (ext === '.jpg') mime_type = 'image/jpeg';
    } else {
      type = 'document';
      mime_type = 'application/octet-stream';
    }

    return { filename, type, mime_type };
  }

  /**
   * Extract content using AI
   */
  private async extractContent(
    buffer: Buffer,
    type: 'image' | 'screenshot' | 'pdf' | 'document',
    filename: string
  ) {
    if (type === 'pdf') {
      return await this.aiExtractor.extractFromPDF(buffer, filename);
    } else if (type === 'image' || type === 'screenshot') {
      return await this.aiExtractor.extractFromImage(buffer, type);
    } else {
      // For documents, return basic info
      return {
        summary: `Document: ${filename}`,
        key_points: [`File size: ${buffer.length} bytes`],
        important_citations: [],
        metadata: { title: filename },
      };
    }
  }

  /**
   * Build data URL from buffer
   */
  private buildDataUrl(buffer: Buffer, mimeType: string): string {
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }
}
