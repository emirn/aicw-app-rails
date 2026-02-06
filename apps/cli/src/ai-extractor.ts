import axios from 'axios';
import * as path from 'path';

/**
 * Extraction result from AI processing
 */
export interface ExtractionResult {
  summary: string;
  key_points: string[];
  important_citations: Array<{
    text: string;
    context: string;
    page?: number;
  }>;
  metadata?: {
    title?: string;
    author?: string;
    date?: string;
    page_count?: number;
  };
}

/**
 * AI-powered file extractor using GPT-4o-mini
 * - Extracts summaries, key points, and citations from PDFs and images
 * - Uses pdf-to-image-generator for PDF conversion
 * - Calls OpenRouter vision API for analysis
 */
export class AIExtractor {
  private openRouterApiKey: string;
  private openRouterBaseUrl: string;
  private model: string;

  constructor(
    openRouterApiKey: string,
    openRouterBaseUrl: string = 'https://openrouter.ai/api/v1',
    model: string = 'openai/gpt-4o-mini'
  ) {
    this.openRouterApiKey = openRouterApiKey;
    this.openRouterBaseUrl = openRouterBaseUrl;
    this.model = model;
  }

  /**
   * Extract summary from PDF (first 5 pages only)
   */
  async extractFromPDF(buffer: Buffer, filename: string): Promise<ExtractionResult> {
    // Convert PDF to images (first 5 pages)
    const tempPath = path.join('/tmp', `${Date.now()}-${filename}`);
    const tempDir = path.join('/tmp', `pdf-images-${Date.now()}`);
    const fs = require('fs');
    fs.writeFileSync(tempPath, buffer);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Dynamic import for pdf-to-image-generator
      const { PDFToImage } = await import('pdf-to-image-generator');

      // Load PDF
      const pdf = await new PDFToImage().load(tempPath);

      // Get total pages
      const totalPages = pdf.document.numPages;
      const pagesToProcess = Math.min(5, totalPages);

      // Convert first 5 pages to disk
      const result = await pdf.convert({
        pages: Array.from({ length: pagesToProcess }, (_, i) => i + 1),
        outputFolderName: tempDir,
        type: 'png',
      });

      if (!result || result.length === 0) {
        throw new Error('Failed to convert PDF to images');
      }

      // Read images and analyze with vision API
      const pageResults = await Promise.all(
        result.map(async (page: any, idx: number) => {
          const imagePath = page.path;
          const imageBuffer = fs.readFileSync(imagePath);
          const base64Image = imageBuffer.toString('base64');
          return this.analyzeImage(base64Image, 'pdf', idx + 1);
        })
      );

      // Clean up temp files
      fs.unlinkSync(tempPath);
      // Remove all images
      for (const page of result) {
        if (fs.existsSync(page.path)) {
          fs.unlinkSync(page.path);
        }
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }

      // Combine results
      return this.combinePageResults(pageResults, totalPages);
    } catch (error: any) {
      // Clean up temp files on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract summary from image or screenshot
   */
  async extractFromImage(
    buffer: Buffer,
    type: 'image' | 'screenshot'
  ): Promise<ExtractionResult> {
    const base64 = buffer.toString('base64');
    return this.analyzeImage(base64, type);
  }

  /**
   * Analyze single image with GPT-4o-mini vision
   */
  private async analyzeImage(
    base64Image: string,
    type: 'image' | 'screenshot' | 'pdf',
    pageNumber?: number
  ): Promise<ExtractionResult> {
    const prompt = this.buildExtractionPrompt(type, pageNumber);

    try {
      const response = await axios.post(
        `${this.openRouterBaseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from AI');
      }

      // Parse JSON response
      return this.parseExtractionResponse(content, pageNumber);
    } catch (error: any) {
      throw new Error(`AI extraction failed: ${error.message}`);
    }
  }

  /**
   * Build prompt for extraction based on file type
   */
  private buildExtractionPrompt(
    type: 'image' | 'screenshot' | 'pdf',
    pageNumber?: number
  ): string {
    const basePrompt = `Analyze this ${type}${pageNumber ? ` (page ${pageNumber})` : ''} and extract key information.

Respond with valid JSON in this exact format:
{
  "summary": "2-3 paragraph overview of the content",
  "key_points": ["bullet point 1", "bullet point 2", ...],
  "important_citations": [
    {
      "text": "exact quote or key statement",
      "context": "why this is important"
    }
  ],
  "metadata": {
    "title": "document title if visible",
    "author": "author if visible",
    "date": "date if visible"
  }
}

Guidelines:
- Summary: 2-3 paragraphs capturing main content
- Key points: 5-10 most important takeaways
- Citations: 3-5 important quotes or facts with context
- Metadata: Extract any visible document metadata
- For screenshots: Focus on UI elements and workflow
- For images: Describe visual content and context
- Return ONLY valid JSON, no markdown code blocks`;

    return basePrompt;
  }

  /**
   * Parse AI response into ExtractionResult
   */
  private parseExtractionResponse(
    content: string,
    pageNumber?: number
  ): ExtractionResult {
    try {
      // Strip markdown code blocks if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        const firstNewline = cleaned.indexOf('\n');
        const lastBackticks = cleaned.lastIndexOf('```');
        if (firstNewline !== -1 && lastBackticks > firstNewline) {
          cleaned = cleaned.substring(firstNewline + 1, lastBackticks).trim();
        }
      }

      const parsed = JSON.parse(cleaned);

      // Add page numbers to citations if provided
      if (pageNumber && parsed.important_citations) {
        parsed.important_citations = parsed.important_citations.map((cit: any) => ({
          ...cit,
          page: pageNumber,
        }));
      }

      return {
        summary: parsed.summary || '',
        key_points: parsed.key_points || [],
        important_citations: parsed.important_citations || [],
        metadata: parsed.metadata,
      };
    } catch (error: any) {
      throw new Error(`Failed to parse extraction response: ${error.message}`);
    }
  }

  /**
   * Combine multiple page results into single result
   */
  private combinePageResults(
    results: ExtractionResult[],
    totalPages: number
  ): ExtractionResult {
    // Combine summaries
    const summaries = results.map((r) => r.summary).filter(Boolean);
    const combinedSummary = `This document contains ${totalPages} pages. Analysis based on first ${results.length} pages:\n\n${summaries.join('\n\n')}`;

    // Combine key points (deduplicate)
    const allKeyPoints = results.flatMap((r) => r.key_points);
    const uniqueKeyPoints = Array.from(new Set(allKeyPoints));

    // Combine citations
    const allCitations = results.flatMap((r) => r.important_citations);

    // Use metadata from first page
    const metadata = results[0]?.metadata || {};
    if (totalPages) {
      metadata.page_count = totalPages;
    }

    return {
      summary: combinedSummary,
      key_points: uniqueKeyPoints.slice(0, 10), // Limit to 10
      important_citations: allCitations.slice(0, 5), // Limit to 5
      metadata,
    };
  }
}
