/**
 * Social Image Generator (Server Version)
 *
 * Generates OG/social preview images using Satori + Resvg.
 * This is a local, template-based approach (no AI, no API costs).
 *
 * Key differences from CLI version:
 * - Returns Buffer directly (no file system writes)
 * - Config/template/font paths resolved relative to server templates directory
 * - No projectRoot parameter - uses server config paths
 */

import satori from 'satori';
import { html } from 'satori-html';
import { Resvg } from '@resvg/resvg-js';
import { promises as fs } from 'fs';
import path from 'path';
import { convertToWebp } from './webp-converter';

export interface SocialImageOptions {
  title: string;
  description?: string;
  badge?: string; // e.g., "BLOG", "GUIDE"
  brandName?: string; // e.g., "MyBlog.com"
  author?: string;
  published_at?: string;
  heroImageBase64?: string; // Base64-encoded hero image for background (data URL)
}

export interface SocialImageResult {
  buffer: Buffer;
  filename: string;
}

export interface SocialImageConfig {
  badge?: string;
  brand_name?: string;
  gradient?: [string, string, string];
  font?: string;
}

export class SocialImageGenerator {
  private fontBuffer: Buffer | null = null;
  private config: SocialImageConfig = {};
  private templateHtml: string | null = null;

  /**
   * Truncate text at word boundary to avoid cutting mid-word
   * Falls back to character truncation only if no space found
   */
  private truncateText(text: string, max: number): string {
    if (text.length <= max) return text;

    const ellipsis = '...';
    const cutPoint = max - ellipsis.length;

    // Find last space before cutPoint
    const lastSpace = text.lastIndexOf(' ', cutPoint);

    // If no space found (single long word), fall back to char truncation
    if (lastSpace <= 0) {
      return text.slice(0, cutPoint) + ellipsis;
    }

    return text.slice(0, lastSpace) + ellipsis;
  }

  /**
   * Load custom HTML template from project config (passed as string)
   */
  loadHtmlTemplate(template: string | undefined): string | null {
    if (template) {
      this.templateHtml = template;
    }
    return this.templateHtml;
  }

  /**
   * Load config (passed as object)
   */
  loadConfig(config: SocialImageConfig | undefined): SocialImageConfig {
    if (config) {
      this.config = config;
    }
    return this.config;
  }

  /**
   * Replace placeholders in HTML template with actual values
   */
  private replaceHtmlPlaceholders(template: string, options: SocialImageOptions): string {
    const escapeHtml = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const replacements: Record<string, string> = {
      '{{title}}': escapeHtml(this.truncateText(options.title || '', 80)),
      '{{description}}': escapeHtml(this.truncateText(options.description || '', 140)),
      '{{badge}}': escapeHtml(options.badge || ''),
      '{{brandName}}': escapeHtml(options.brandName || ''),
      '{{author}}': escapeHtml(options.author || ''),
      '{{published_at}}': escapeHtml(options.published_at || ''),
    };

    let result = template;
    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }
    return result;
  }

  /**
   * Load font from bundled templates directory
   */
  async loadFont(): Promise<Buffer> {
    if (this.fontBuffer) return this.fontBuffer;

    const fontName = this.config.font || 'Inter-Bold.ttf';
    const bundledFontPath = path.join(__dirname, '../../templates/fonts', fontName);
    this.fontBuffer = await fs.readFile(bundledFontPath);
    return this.fontBuffer;
  }

  /**
   * Generate social preview image
   */
  async generate(options: SocialImageOptions): Promise<SocialImageResult> {
    const font = await this.loadFont();

    let svg: string;

    if (this.templateHtml) {
      // Path A: Custom HTML template via satori-html
      const mergedOptions = {
        ...options,
        badge: options.badge || this.config.badge,
        brandName: options.brandName || this.config.brand_name,
      };
      const filledHtml = this.replaceHtmlPlaceholders(this.templateHtml, mergedOptions);
      const satoriElement = html(filledHtml);

      svg = await satori(satoriElement as any, {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Inter',
            data: font,
            weight: 700,
            style: 'normal',
          },
        ],
      });
    } else {
      // Path B: Built-in JSX template (existing code)
      const mergedOptions = {
        ...options,
        badge: options.badge || this.config.badge,
        brandName: options.brandName || this.config.brand_name,
      };
      const template = this.buildTemplate(mergedOptions);
      this.validateTemplate(template);

      svg = await satori(template, {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Inter',
            data: font,
            weight: 700,
            style: 'normal',
          },
        ],
      });
    }

    // Convert SVG to PNG, then to WebP for better compression
    const resvg = new Resvg(svg, {
      background: 'rgba(0, 0, 0, 0)',
      fitTo: { mode: 'width', value: 1200 },
    });

    const pngBuffer = Buffer.from(resvg.render().asPng());
    const webpBuffer = await convertToWebp(pngBuffer);

    return { buffer: webpBuffer, filename: 'og.webp' };
  }

  /**
   * Validate JSX template for Satori compatibility
   * Satori requires explicit display property on children of flex containers
   */
  private validateTemplate(node: any, path: string = 'root'): void {
    if (!node || typeof node !== 'object') return;

    const style = node.props?.style || {};
    const children = node.props?.children;

    // Check: flex container with multiple children
    if (style.display === 'flex' && Array.isArray(children) && children.length > 1) {
      children.forEach((child: any, i: number) => {
        if (child && typeof child === 'object' && child.type === 'div') {
          const childDisplay = child.props?.style?.display;
          if (!childDisplay) {
            throw new Error(
              `Satori validation failed: ${path} > child[${i}] (div) is missing 'display' property. ` +
              `Parent has display:flex with multiple children - each child needs explicit display.`
            );
          }
        }
      });
    }

    // Recurse into children
    if (Array.isArray(children)) {
      children.forEach((child: any, i: number) => {
        this.validateTemplate(child, `${path} > child[${i}]`);
      });
    } else if (children && typeof children === 'object') {
      this.validateTemplate(children, `${path} > child`);
    }
  }

  /**
   * Build JSX template for OG image
   * Uses hero image as background if available, otherwise gradient
   */
  private buildTemplate(options: SocialImageOptions): any {
    const { title, description, badge, brandName, author, published_at, heroImageBase64 } = options;

    // Truncate text at word boundaries
    const truncTitle = this.truncateText(title, 80);
    const truncDesc = description ? this.truncateText(description, 140) : '';

    // Build gradient from config or use default
    const gradient = this.config.gradient || ['#1e3a5f', '#4a2c6a', '#6b2d5c'];
    const bgGradient = `linear-gradient(135deg, ${gradient[0]} 0%, ${gradient[1]} 50%, ${gradient[2]} 100%)`;

    // Build footer text
    const footerParts = [author, published_at].filter(Boolean);
    const footerText = footerParts.join(' • ');

    // Build content layer (badge, title/desc, footer)
    const contentLayer = {
      type: 'div',
      props: {
        style: {
          position: 'relative' as const,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column' as const,
          justifyContent: 'space-between',
          padding: '60px',
        },
        children: [
          // Badge
          badge
            ? {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    background: 'rgba(255, 255, 255, 0.2)',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '18px',
                    fontWeight: 700,
                    alignSelf: 'flex-start',
                  },
                  children: badge,
                },
              }
            : null,
          // Title + Description
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'column' as const,
                gap: '20px',
                flex: 1,
                justifyContent: 'center',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      color: 'white',
                      fontSize: '52px',
                      fontWeight: 700,
                      lineHeight: 1.2,
                    },
                    children: truncTitle,
                  },
                },
                truncDesc
                  ? {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          color: 'rgba(255, 255, 255, 0.8)',
                          fontSize: '24px',
                          lineHeight: 1.4,
                        },
                        children: truncDesc,
                      },
                    }
                  : null,
              ].filter(Boolean),
            },
          },
          // Footer: author/date + branding
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: 'white',
                fontSize: '20px',
              },
              children: [
                footerText
                  ? {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          color: 'rgba(255, 255, 255, 0.8)',
                        },
                        children: footerText,
                      },
                    }
                  : null,
                brandName
                  ? {
                      type: 'div',
                      props: {
                        style: { display: 'flex', fontSize: '24px', fontWeight: 700 },
                        children: brandName,
                      },
                    }
                  : null,
              ].filter(Boolean),
            },
          },
        ].filter(Boolean),
      },
    };

    // Build layers array
    const children: any[] = [];

    if (heroImageBase64) {
      // Layer 1: Hero image background
      children.push({
        type: 'img',
        props: {
          src: heroImageBase64,
          style: {
            position: 'absolute' as const,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover' as const,
          },
        },
      });

      // Layer 2: Dark overlay for text readability
      children.push({
        type: 'div',
        props: {
          style: {
            display: 'flex',
            position: 'absolute' as const,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.7)',
          },
        },
      });
    }

    // Layer 3: Content
    children.push(contentLayer);

    return {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          position: 'relative' as const,
          width: '100%',
          height: '100%',
          background: heroImageBase64 ? 'transparent' : bgGradient,
          overflow: 'hidden',
        },
        children,
      },
    };
  }
}
