/**
 * Article types
 */

import { IPage } from './base';

/**
 * API-level article structure for sgen service requests/responses.
 * This is a simpler interface used in API contracts.
 */
export interface IApiArticle extends IPage {
  content: string;
}
