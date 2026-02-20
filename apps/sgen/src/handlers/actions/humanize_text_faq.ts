/**
 * humanize_text_faq action handler — humanize article FAQ field
 */

import { ActionHandlerFn } from './types';
import { humanizeField } from '../../utils/humanize-core';

export const handle: ActionHandlerFn = async (ctx) => {
  return humanizeField(ctx, 'faq', 'humanize_text_faq');
};
