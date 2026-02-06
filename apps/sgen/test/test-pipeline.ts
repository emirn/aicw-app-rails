#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:3001/api/v1';

// Article enhancement workflow - defines the order of actions to apply
const ARTICLE_WORKFLOW = [
  { action: 'fact_check', description: 'Fact-check and add citations', timeout: 60000 },
  { action: 'humanize_text', description: 'Make content more natural', timeout: 60000 },
  { action: 'improve_seo', description: 'Optimize for search engines', timeout: 60000 },
  { action: 'add_diagrams', description: 'Add relevant diagrams', timeout: 60000 },  
  { action: 'add_links', description: 'Add internal/external links', timeout: 60000 },
  { action: 'add_faq', description: 'Add FAQ section', timeout: 60000 },
  { action: 'validate_format', description: 'Final validation', timeout: 30000 }
];

// Skip these actions by default (can be enabled via command line)
const SKIP_ACTIONS = process.env.SKIP_ACTIONS ? process.env.SKIP_ACTIONS.split(',') : ['add_images', 'add_diagrams'];

interface TestConfig {
  website: string;
  outputDir: string;
  numArticles: number;
  articleWords: number[];
  enhanceArticles?: boolean;  // Whether to run enhancement workflow
}

interface CachedData {
  websiteInfo?: any;
  competitors?: any[];
  competitorsInfo?: any[];
  contentPlan?: any;
  articles?: any[];
}

// Color output for better visibility
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logAction(step: string) {
  log(`\n${'='.repeat(60)}`, colors.cyan);
  log(`  ${step}`, colors.bright + colors.cyan);
  log('='.repeat(60), colors.cyan);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, colors.green);
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logError(message: string) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, colors.blue);
}

// Parse command line arguments
function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: npm run test:pipeline <website> [options]

Arguments:
  website       The website URL to test (e.g., https://ayodesk.com)

Options:
  --articles N  Number of articles to generate (default: 2)
  --words N,M   Word counts for articles (default: 1200,1000)
  --clean       Clean existing output before running
  --enhance     Run full enhancement workflow on articles

Examples:
  npm run test:pipeline https://ayodesk.com
  npm run test:pipeline https://example.com --articles 3 --words 1500,1200,1000
  npm run test:pipeline https://test.com --clean
  npm run test:pipeline https://ayodesk.com --enhance --articles 1
    `);
    process.exit(0);
  }

  const website = args[0];
  if (!website.startsWith('http://') && !website.startsWith('https://')) {
    logError('Website must start with http:// or https://');
    process.exit(1);
  }

  // Extract domain name for output directory
  const domain = new URL(website).hostname.replace(/^www\./, '');
  const outputDir = path.join(__dirname, 'output', domain);

  // Parse options
  let numArticles = 2;
  let articleWords = [1200, 1000];
  let shouldClean = false;
  let enhanceArticles = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--articles' && args[i + 1]) {
      numArticles = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--words' && args[i + 1]) {
      articleWords = args[i + 1].split(',').map(w => parseInt(w, 10));
      i++;
    } else if (args[i] === '--clean') {
      shouldClean = true;
    } else if (args[i] === '--enhance') {
      enhanceArticles = true;
    }
  }

  // Adjust articleWords array to match numArticles
  while (articleWords.length < numArticles) {
    articleWords.push(1000); // Default word count
  }
  articleWords = articleWords.slice(0, numArticles);

  // Clean output directory if requested
  if (shouldClean && fs.existsSync(outputDir)) {
    logWarning(`Cleaning output directory: ${outputDir}`);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  return { website, outputDir, numArticles, articleWords, enhanceArticles };
}

// Ensure output directory exists
function ensureOutputDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logInfo(`Created output directory: ${dir}`);
  }
}

// Load cached data
function loadCachedData(outputDir: string): CachedData {
  const cached: CachedData = {};
  
  const websiteInfoPath = path.join(outputDir, 'website-info.json');
  if (fs.existsSync(websiteInfoPath)) {
    cached.websiteInfo = JSON.parse(fs.readFileSync(websiteInfoPath, 'utf8'));
    logInfo('Found cached website info');
  }

  const competitorsPath = path.join(outputDir, 'competitors.json');
  if (fs.existsSync(competitorsPath)) {
    cached.competitors = JSON.parse(fs.readFileSync(competitorsPath, 'utf8'));
    logInfo('Found cached competitors list');
  }

  const competitorsInfoPath = path.join(outputDir, 'competitors-info.json');
  if (fs.existsSync(competitorsInfoPath)) {
    cached.competitorsInfo = JSON.parse(fs.readFileSync(competitorsInfoPath, 'utf8'));
    logInfo('Found cached competitors info');
  }

  const contentPlanPath = path.join(outputDir, 'content-plan.json');
  if (fs.existsSync(contentPlanPath)) {
    cached.contentPlan = JSON.parse(fs.readFileSync(contentPlanPath, 'utf8'));
    logInfo('Found cached content plan');
  }

  cached.articles = [];
  for (let i = 1; i <= 10; i++) {
    const articlePath = path.join(outputDir, `article-${i}.json`);
    if (fs.existsSync(articlePath)) {
      cached.articles.push(JSON.parse(fs.readFileSync(articlePath, 'utf8')));
      logInfo(`Found cached article ${i}`);
    }
  }

  return cached;
}

// Save data to file
function saveToFile(filePath: string, data: any) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  logSuccess(`Saved: ${path.basename(filePath)}`);
  
  // If data has article.content property, save it as a separate markdown file
  if (data?.article?.content && typeof data.article.content === 'string' && data.article.content.trim()) {
    const mdFilePath = filePath.replace('.json', '.article.content.md');
    fs.writeFileSync(mdFilePath, data.article.content);
    logInfo(`Saved content as: ${path.basename(mdFilePath)}`);
  }
}

// API call helper with timeout
async function apiCall(endpoint: string, method: string = 'GET', body?: any, timeoutMs: number = 120000): Promise<any> {
  const url = `${API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  const options: any = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json() as any;
    
    if (!response.ok) {
      throw new Error(data.error || `API call failed: ${response.status}`);
    }
    
    return data;
  } catch (error: any) {
    logError(`API call failed: ${error.message}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Action 1: Scan website
async function scanWebsite(config: TestConfig, cached: CachedData, isCompetitor: boolean = false): Promise<any> {
  if (!isCompetitor && cached.websiteInfo) {
    logWarning('Using cached website info (delete file to rescan)');
    return cached.websiteInfo;
  }

  const stepName = isCompetitor ? 'Scanning Competitor' : 'Action 1: Scanning Main Website';
  if (!isCompetitor) {
    logAction(stepName);
  }
  log(`URL: ${config.website}`);
  
  // Use different page limits for main site vs competitors
  const maxPages = isCompetitor ? 20 : 50;  // 50 for main site (reasonable for testing), 20 for competitors
  
  // Use the article/update endpoint with mode=website_info
  const scanRequest = {
    article: {
      id: 'scan-1',
      slug: '',
      title: 'Website Scan',
      description: 'Scan website',
      keywords: '',
      content: ''
    },
    mode: 'website_info',
    context: {
      url: config.website,
      max_pages: maxPages
    }
  };
  
  // Increase timeout for website scanning (especially main site)
  const scanTimeout = isCompetitor ? 60000 : 180000;  // 3 minutes for main, 1 minute for competitors
  const result = await apiCall('/article/update', 'POST', scanRequest, scanTimeout);
  
  if (result.success === false) {
    throw new Error(result.error || 'Website scan failed');
  }

  // Parse the website info from the response
  const websiteInfo = JSON.parse(result.article.content);
  
  // Enhance website info with focus keywords and instructions
  if (!websiteInfo.focus_keywords) {
    websiteInfo.focus_keywords = 'customer support, AI, automation, chatbot, help desk';
  }
  
  if (!websiteInfo.focus_instruction) {
    websiteInfo.focus_instruction = 'Write for B2B SaaS buyers and support team leaders. Focus on ROI, implementation, and practical use cases.';
  }
  
  if (!websiteInfo.example_article) {
    websiteInfo.example_article = websiteInfo.main_pages?.[0]?.content?.slice(0, 500) || 
      'Write in a professional, informative tone that builds trust and demonstrates expertise. Use data and examples to support claims.';
  }

  if (!isCompetitor) {
    saveToFile(path.join(config.outputDir, 'website-info.json'), websiteInfo);
  }
  
  logSuccess(`Website scanned: ${websiteInfo.title}`);
  logInfo(`Pages found: ${websiteInfo.pages_published?.length || 0}`);
  
  return websiteInfo;
}

// Action 2: Get competitors
async function getCompetitors(config: TestConfig, websiteInfo: any, cached: CachedData): Promise<any[]> {
  if (cached.competitors) {
    logWarning('Using cached competitors list (delete file to regenerate)');
    return cached.competitors;
  }

  logAction('Action 2: Discovering Competitors');
  
  const competitorRequest = {
    article: {
      id: 'comp-1',
      slug: '',
      title: 'Get Competitors',
      description: 'Find competitors',
      keywords: '',
      content: ''
    },
    mode: 'get_competitors',
    context: {
      website_info: websiteInfo,
      target_competitors: 3  // Limit to 3 for efficiency
    }
  };

  const result = await apiCall('/article/update', 'POST', competitorRequest);
  
  if (!result.success) {
    throw new Error(result.error || 'Competitor discovery failed');
  }

  // Parse competitors from response - handle both JSON and markdown responses
  let competitorsContent = result.article.content;
  
  // Extract JSON from markdown if necessary
  if (competitorsContent.includes('```json')) {
    const jsonMatch = competitorsContent.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      competitorsContent = jsonMatch[1];
    }
  }
  
  const competitors = JSON.parse(competitorsContent);
  
  saveToFile(path.join(config.outputDir, 'competitors.json'), competitors);
  
  logSuccess(`Found ${competitors.length} competitors`);
  
  return competitors;
}

// Action 3: Scan competitors
async function scanCompetitors(config: TestConfig, competitors: any[], cached: CachedData): Promise<any[]> {
  if (cached.competitorsInfo) {
    logWarning('Using cached competitors info (delete file to regenerate)');
    return cached.competitorsInfo;
  }

  logAction('Action 3: Scanning Top Competitors');
  
  const competitorsInfo = [];
  const maxCompetitors = Math.min(3, competitors.length);  // Limit to 3 for efficiency
  
  for (let i = 0; i < maxCompetitors; i++) {
    const competitor = competitors[i];
    log(`\n📊 Scanning competitor ${i + 1}/${maxCompetitors}: ${competitor.title || competitor.url}`);
    
    try {
      // Create a temporary config for competitor scanning
      const competitorConfig = { ...config, website: competitor.url };
      const scrapedInfo = await scanWebsite(competitorConfig, {}, true);
      
      // Merge AI-provided competitor data with scraped data
      const competitorInfo = {
        ...scrapedInfo,
        competitor_rating: competitor.competitor_rating,
        // Keep the AI's title and description if scraper didn't get good ones
        title: scrapedInfo.title || competitor.title,
        description: scrapedInfo.description || competitor.description
      };
      
      competitorsInfo.push(competitorInfo);
      logSuccess(`Scanned: ${competitorInfo.title} [Rating: ${competitor.competitor_rating}/10]`);
    } catch (error: any) {
      logWarning(`Failed to scan ${competitor.url}: ${error.message}`);
    }
  }
  
  saveToFile(path.join(config.outputDir, 'competitors-info.json'), competitorsInfo);
  
  logSuccess(`Scanned ${competitorsInfo.length} competitors successfully`);
  
  return competitorsInfo;
}

// Action 4: Generate content plan
async function generateContentPlan(config: TestConfig, websiteInfo: any, competitorsInfo: any[], cached: CachedData): Promise<any> {
  if (cached.contentPlan) {
    logWarning('Using cached content plan (delete file to regenerate)');
    return cached.contentPlan;
  }

  logAction('Action 4: Generating Content Plan');
  
  const planRequest = {
    article: {
      id: 'plan-1',
      slug: '',
      title: 'Content Plan',
      description: 'Generate content plan',
      keywords: '',
      content: ''
    },
    mode: 'make_plan',
    context: {
      website_info: websiteInfo,
      competitors_websites: competitorsInfo,
      target_articles: 15
    }
  };

  // Increase timeout for content plan generation with competitor data
  const result = await apiCall('/article/update', 'POST', planRequest, 180000);  // 3 minutes
  
  if (!result.success) {
    throw new Error(result.error || 'Content plan generation failed');
  }

  // Parse the content plan from the response
  let planContent;
  try {
    planContent = JSON.parse(result.article.content);
  } catch (error: any) {
    logError(`Failed to parse content plan JSON: ${error.message}`);
    logInfo(`Raw content: ${result.article.content.slice(0, 500)}...`);
    throw error;
  }
  const contentPlan = {
    ...result,
    parsedPlan: planContent
  };

  saveToFile(path.join(config.outputDir, 'content-plan.json'), contentPlan);
  
  logSuccess(`Content plan generated with ${planContent.total_articles} article ideas`);
  logInfo(`Tokens used: ${result.tokens_used || 'N/A'}`);
  
  return contentPlan;
}

// Action 5: Generate articles
async function generateArticles(config: TestConfig, websiteInfo: any, contentPlan: any, cached: CachedData): Promise<any[]> {
  logAction(`Action 5: Generating ${config.numArticles} Articles`);
  
  const articles = [];
  const planItems = contentPlan.parsedPlan.items;
  
  for (let i = 0; i < config.numArticles; i++) {
    const articleNum = i + 1;
    
    // Check if already cached
    if (cached.articles && cached.articles[i]) {
      logWarning(`Article ${articleNum} already cached (delete file to regenerate)`);
      articles.push(cached.articles[i]);
      continue;
    }
    
    const planItem = planItems[i];
    if (!planItem) {
      logError(`No plan item found for article ${articleNum}`);
      continue;
    }
    
    log(`\n📝 Generating Article ${articleNum}: ${planItem.title}`);
    logInfo(`Target words: ${config.articleWords[i]}`);
    
    const articleRequest = {
      description: `comprehensive article on ${planItem.title}. ${planItem.description}. Cover ${planItem.notes || 'all key aspects thoroughly'}.`,
      website_info: {
        ...websiteInfo,
        focus_keywords: planItem.target_keywords.join(', ')
      },
      target_words: config.articleWords[i]
    };

    try {
      let result = await apiCall('/article/generate', 'POST', articleRequest);
      
      if (!result.success) {
        throw new Error(result.error || 'Article generation failed');
      }
      
      // If enhancement is enabled, process through workflow
      if (config.enhanceArticles) {
        log(`\n🎯 Enhancing Article ${articleNum} through workflow...`);
        result = await enhanceArticle(result, config, websiteInfo, articleNum);
      }
      
      articles.push(result);
      saveToFile(path.join(config.outputDir, `article-${articleNum}.json`), result);
      
      logSuccess(`Article ${articleNum} ${config.enhanceArticles ? 'generated and enhanced' : 'generated'}: ${result.article.title}`);
      logInfo(`Word count: ${result.article.word_count} (target: ${config.articleWords[i]})`);
      logInfo(`Tokens used: ${result.tokens_used || 'N/A'}`);
      
    } catch (error: any) {
      logError(`Failed to generate article ${articleNum}: ${error.message}`);
    }
  }
  
  return articles;
}

// Process article through enhancement workflow
async function enhanceArticle(articleResult: any, config: TestConfig, websiteInfo: any, articleNum: number): Promise<any> {
  let currentResult = articleResult;
  let totalTokensUsed = articleResult.tokens_used || 0;
  
  for (const step of ARTICLE_WORKFLOW) {
    log(`\n  ⚡ ${step.description}...`);
    
    const updateRequest = {
      article: currentResult.article,
      mode: step.action,
      context: {
        website_info: websiteInfo,
        ...(step.action === 'add_links' ? { 
          related_articles: websiteInfo.pages_published?.slice(0, 5) 
        } : {}),
        ...(step.action === 'improve_seo' ? { 
          target_keywords: websiteInfo.focus_keywords?.split(',').map((k: string) => k.trim())
        } : {})
      }
    };
    
    try {
      const enhancedResult = await apiCall('/article/update', 'POST', updateRequest, step.timeout);
      
      if (!enhancedResult.success) {
        logWarning(`    Failed: ${enhancedResult.error || 'Unknown error'}`);
        continue; // Skip this enhancement but continue with others
      }
      
      // Update the article with enhanced version
      currentResult.article = enhancedResult.article;
      totalTokensUsed += enhancedResult.tokens_used || 0;
      
      // Save intermediate result for this enhancement step
      const stepFilePath = path.join(config.outputDir, `article-${articleNum}-${step.action}.json`);
      saveToFile(stepFilePath, enhancedResult);
      
      logSuccess(`    ✓ ${step.description} completed`);
      
    } catch (error: any) {
      logWarning(`    Failed ${step.action}: ${error.message}`);
      // Continue with next enhancement even if this one fails
    }
  }
  
  // Update total tokens used
  currentResult.tokens_used = totalTokensUsed;
  
  return currentResult;
}

// Analyze results
function analyzeResults(config: TestConfig, articles: any[]) {
  logAction('Analysis Report');
  
  if (articles.length === 0) {
    logWarning('No articles to analyze');
    return;
  }
  
  // Word count analysis
  log('\n📊 Word Count Analysis:', colors.bright);
  let totalWords = 0;
  let totalTarget = 0;
  
  articles.forEach((result, i) => {
    const article = result.article;
    const target = config.articleWords[i];
    const actual = article.word_count || 0;
    const diff = actual - target;
    const pct = ((actual / target) * 100).toFixed(1);
    
    totalWords += actual;
    totalTarget += target;
    
    const status = Math.abs(diff) <= target * 0.1 ? '✅' : '⚠️';
    log(`  Article ${i + 1}: ${actual} / ${target} words (${pct}%) ${status}`);
  });
  
  const totalPct = ((totalWords / totalTarget) * 100).toFixed(1);
  log(`  Total: ${totalWords} / ${totalTarget} words (${totalPct}%)`);
  
  // SEO analysis
  log('\n🔍 SEO Analysis:', colors.bright);
  articles.forEach((result, i) => {
    const article = result.article;
    log(`  Article ${i + 1}: "${article.title}"`);
    log(`    - Title length: ${article.title.length} chars ${article.title.length <= 60 ? '✅' : '⚠️'}`);
    log(`    - Description length: ${article.description.length} chars ${article.description.length <= 155 ? '✅' : '⚠️'}`);
    log(`    - Slug: ${article.slug}`);
  });
  
  // Token usage
  log('\n💰 Token Usage:', colors.bright);
  const totalTokens = articles.reduce((sum, r) => sum + (r.tokens_used || 0), 0);
  log(`  Total tokens used: ${totalTokens.toLocaleString()}`);
  
  // Estimated cost (rough calculation)
  const costPerToken = 0.000002; // Approximate cost per token
  const estimatedCost = (totalTokens * costPerToken).toFixed(4);
  log(`  Estimated cost: $${estimatedCost}`);
  
  // Save analysis report
  const report = {
    timestamp: new Date().toISOString(),
    website: config.website,
    articlesGenerated: articles.length,
    wordCountAnalysis: {
      total: totalWords,
      target: totalTarget,
      percentage: totalPct
    },
    tokenUsage: totalTokens,
    estimatedCost: estimatedCost
  };
  
  saveToFile(path.join(config.outputDir, 'analysis-report.json'), report);
}

// Main execution
async function main() {
  try {
    const config = parseArgs();
    
    log('\n🚀 Starting Content Pipeline Test', colors.bright + colors.green);
    log(`Website: ${config.website}`);
    log(`Articles to generate: ${config.numArticles}`);
    log(`Word targets: ${config.articleWords.join(', ')}`);
    log(`Output directory: ${config.outputDir}`);
    
    // Ensure output directory exists
    ensureOutputDir(config.outputDir);
    
    // Load cached data
    const cached = loadCachedData(config.outputDir);
    
    // Execute pipeline steps
    const websiteInfo = await scanWebsite(config, cached);
    const competitors = await getCompetitors(config, websiteInfo, cached);
    const competitorsInfo = await scanCompetitors(config, competitors, cached);
    const contentPlan = await generateContentPlan(config, websiteInfo, competitorsInfo, cached);
    const articles = await generateArticles(config, websiteInfo, contentPlan, cached);
    
    // Analyze results
    analyzeResults(config, articles);
    
    logAction('✨ Pipeline Complete!');
    logSuccess(`All outputs saved to: ${config.outputDir}`);
    
  } catch (error: any) {
    logError(`Pipeline failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);