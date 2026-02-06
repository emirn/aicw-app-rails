/**
 * File asset types for seeding articles with local files
 */

export interface IFileAsset {
  // Identity & Deduplication
  id: string;                    // UUID for this usage instance
  hash: string;                  // MD5 hash of file content

  // Classification
  type: 'image' | 'screenshot' | 'pdf' | 'document';
  usage: 'asset' | 'reference';  // asset=in output, reference=context only

  // Original File Info
  filename: string;              // "brand-guide.pdf"
  filepath: string;              // "./docs/brand-guide.pdf"
  mime_type: string;             // "application/pdf"
  size_bytes: number;

  // Content (only when sending to API)
  url?: string;                  // "data:mime;base64,XXX" - omitted when saving

  // AI-Generated Summary
  summary: string;               // 2-3 paragraph overview
  key_points: string[];          // 5-10 bullet points
  important_citations: Array<{
    text: string;                // The quote
    context: string;             // Why it's important
    page?: number;               // For PDFs
  }>;

  // Asset-specific (usage='asset')
  alt_text?: string;             // For images in article
  caption?: string;
  placement_hint?: string;       // "in introduction", "after section 2"

  // Reference-specific (usage='reference')
  metadata?: {
    title?: string;
    author?: string;
    date?: string;
    page_count?: number;
  };

  // Processing metadata
  processed_at: string;          // ISO timestamp
  model_used: string;            // "gpt-4o-mini"
}
