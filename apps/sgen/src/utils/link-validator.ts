import fetch from 'node-fetch';

/**
 * Utility to validate and clean links in Markdown content
 */
export class LinkValidator {
    /**
     * Process content: find links, check them, and remove invalid ones (keeping text)
     */
    static async validateAndClean(content: string): Promise<{
        cleanedContent: string;
        removedLinks: string[];
        checkedCount: number;
    }> {
        // Regex to find markdown links: [text](url)
        // We use a simple regex that handles most common cases
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

        const matches = Array.from(content.matchAll(linkRegex));
        const uniqueUrls = new Set<string>();

        for (const match of matches) {
            uniqueUrls.add(match[2]);
        }

        const checkedCount = uniqueUrls.size;
        const invalidUrls = new Set<string>();

        // Check all unique URLs in parallel (with concurrency limit)
        const urls = Array.from(uniqueUrls);
        const batchSize = 5;

        for (let i = 0; i < urls.length; i += batchSize) {
            const batch = urls.slice(i, i + batchSize);
            await Promise.all(batch.map(async (url) => {
                const isValid = await this.checkUrl(url);
                if (!isValid) {
                    invalidUrls.add(url);
                }
            }));
        }

        // Replace invalid links with just their text
        let cleanedContent = content;
        const removedLinks: string[] = [];

        if (invalidUrls.size > 0) {
            cleanedContent = content.replace(linkRegex, (match, text, url) => {
                if (invalidUrls.has(url)) {
                    removedLinks.push(url);
                    return text; // Return just the anchor text
                }
                return match; // Return original link
            });
        }

        return {
            cleanedContent,
            removedLinks,
            checkedCount
        };
    }

    /**
     * Check if a URL is valid (returns 200-299 status)
     */
    private static async checkUrl(url: string): Promise<boolean> {
        // Skip internal links / anchors / mailto
        if (!url.startsWith('http')) return true;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            try {
                // Try HEAD first
                const response = await fetch(url, {
                    method: 'HEAD',
                    signal: controller.signal,
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlogPostGen/1.0)' }
                });

                clearTimeout(timeoutId);

                if (response.ok) return true;

                // If HEAD fails (some servers block it), try GET with range
                if (response.status === 405 || response.status === 403) {
                    // Fallback to GET below
                } else {
                    return false;
                }
            } catch (e) {
                clearTimeout(timeoutId);
                // Fallback to GET
            }

            // Fallback: GET request
            const controllerGet = new AbortController();
            const timeoutGet = setTimeout(() => controllerGet.abort(), 8000);

            const responseGet = await fetch(url, {
                method: 'GET',
                signal: controllerGet.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; BlogPostGen/1.0)',
                    'Range': 'bytes=0-100' // Only get first 100 bytes
                }
            });

            clearTimeout(timeoutGet);
            return responseGet.ok;

        } catch (error) {
            return false;
        }
    }
}
