/**
 * Base interfaces used across the system
 */

export interface IBaseObject {
  id: string;
}

export interface IPage extends IBaseObject {
  slug: string;
  title: string;
  description: string;
  keywords: string;
  content?: string;
}
