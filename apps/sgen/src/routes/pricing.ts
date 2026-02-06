import { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

interface PricingConfig {
  models: Record<string, {
    input_per_million: number;
    output_per_million: number;
    description: string;
  }>;
  default_input_output_ratio: number;
  updated_at: string;
}

let pricingCache: PricingConfig | null = null;
let pricingMtime: number = 0;

function loadPricingConfig(): PricingConfig {
  const configPath = path.join(__dirname, '../../config/pricing.json');
  const stat = fs.statSync(configPath);

  // Return cached version if file hasn't changed
  if (pricingCache && stat.mtimeMs === pricingMtime) {
    return pricingCache;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  pricingCache = JSON.parse(content);
  pricingMtime = stat.mtimeMs;
  return pricingCache!;
}

export default async function pricingRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    const pricing = loadPricingConfig();
    return { success: true, pricing };
  });
}
