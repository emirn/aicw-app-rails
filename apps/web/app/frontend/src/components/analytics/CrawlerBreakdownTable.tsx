import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CrawlerBreakdownItem } from "@/hooks/use-crawler-breakdown";
import { Bug, Bot, Search, ArrowUpDown } from "lucide-react";
import { getBotSourceDisplay } from "@/lib/ai-sources";

interface CrawlerBreakdownTableProps {
  data: CrawlerBreakdownItem[];
  loading?: boolean;
  error?: Error | null;
}

type SortField = "visits" | "sessions" | "name";

// Bot display name mapping for common bots
const BOT_DISPLAY_NAMES: Record<string, string> = {
  gptbot: "GPTBot",
  oai_searchbot: "OpenAI SearchBot",
  claudebot: "ClaudeBot",
  claude_web: "Claude Web",
  claude_searchbot: "Claude SearchBot",
  anthropic_ai: "Anthropic AI",
  perplexitybot: "PerplexityBot",
  google_extended: "Google Extended",
  googleother: "GoogleOther",
  google_notebooklm: "NotebookLM",
  meta_externalagent: "Meta External Agent",
  facebookbot: "FacebookBot",
  facebookexternalhit: "Facebook External Hit",
  bingbot: "BingBot",
  bingpreview: "Bing Preview",
  msnbot: "MSNBot",
  deepseekbot: "DeepSeekBot",
  youbot: "You.com Bot",
  ccbot: "CCBot",
  cohere_crawler: "Cohere Crawler",
  bytespider: "ByteSpider",
  grokbot: "GrokBot",
};

function getBotDisplayName(refBot: string): string {
  // Try the bot sources library first
  const libName = getBotSourceDisplay(refBot);
  if (libName && libName !== refBot) {
    return libName;
  }
  // Fallback to our mapping or capitalize the bot name
  return BOT_DISPLAY_NAMES[refBot] || refBot.charAt(0).toUpperCase() + refBot.slice(1).replace(/_/g, ' ');
}

export function CrawlerBreakdownTable({
  data,
  loading,
  error,
}: CrawlerBreakdownTableProps) {
  const [sortField, setSortField] = useState<SortField>("visits");

  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-primary" />
            <CardTitle>Bot & Crawler Activity</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Bots and crawlers visiting your site
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-primary" />
            <CardTitle>Bot & Crawler Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load bot data. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-primary" />
            <CardTitle>Bot & Crawler Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
          <Bug className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <p className="text-sm text-muted-foreground">
            No bot activity detected for this time period.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    switch (sortField) {
      case "sessions":
        return b.unique_sessions - a.unique_sessions;
      case "name":
        return getBotDisplayName(a.ref_bot).localeCompare(getBotDisplayName(b.ref_bot));
      default:
        return b.visit_count - a.visit_count;
    }
  });

  // Calculate totals
  const totalVisits = data.reduce((sum, item) => sum + item.visit_count, 0);
  const aiCrawlerVisits = data
    .filter((item) => item.crawler_category === "AI Crawler")
    .reduce((sum, item) => sum + item.visit_count, 0);
  const genericBotVisits = totalVisits - aiCrawlerVisits;

  const handleSort = (field: SortField) => {
    setSortField(field);
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bug className="w-5 h-5 text-primary" />
              <CardTitle>Bot & Crawler Activity</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Bots and crawlers visiting your site (excluded from main analytics)
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Total Bot Visits</p>
              <p className="font-semibold">{totalVisits.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">AI Crawlers</p>
              <p className="font-semibold text-green-600">{aiCrawlerVisits.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Other Bots</p>
              <p className="font-semibold text-gray-600">{genericBotVisits.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border-2 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[50px] font-bold">#</TableHead>
                <TableHead
                  className="font-bold cursor-pointer hover:bg-muted"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Bot Name
                    {sortField === "name" && <ArrowUpDown className="w-3 h-3" />}
                  </div>
                </TableHead>
                <TableHead className="font-bold">Category</TableHead>
                <TableHead
                  className="text-right font-bold cursor-pointer hover:bg-muted"
                  onClick={() => handleSort("visits")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Visits
                    {sortField === "visits" && <ArrowUpDown className="w-3 h-3" />}
                  </div>
                </TableHead>
                <TableHead
                  className="text-right font-bold cursor-pointer hover:bg-muted"
                  onClick={() => handleSort("sessions")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Sessions
                    {sortField === "sessions" && <ArrowUpDown className="w-3 h-3" />}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((item, index) => {
                const isAICrawler = item.crawler_category === "AI Crawler";
                return (
                  <TableRow key={`${item.ref_bot}-${index}`}>
                    {/* Rank */}
                    <TableCell>
                      <div className="inline-flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs bg-muted">
                        {index + 1}
                      </div>
                    </TableCell>

                    {/* Bot Name */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isAICrawler ? (
                          <Bot className="w-4 h-4 text-green-600" />
                        ) : (
                          <Search className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="font-medium">
                          {getBotDisplayName(item.ref_bot)}
                        </span>
                      </div>
                    </TableCell>

                    {/* Category Badge */}
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          isAICrawler
                            ? "bg-green-100 text-green-700 hover:bg-green-100"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-100"
                        }
                      >
                        {item.crawler_category}
                      </Badge>
                    </TableCell>

                    {/* Visit Count */}
                    <TableCell className="text-right font-semibold">
                      {item.visit_count.toLocaleString()}
                    </TableCell>

                    {/* Session Count */}
                    <TableCell className="text-right text-muted-foreground">
                      {item.unique_sessions.toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Summary Footer */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg border text-center">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground">{sortedData.length}</span> bot types
            {" • "}
            <span className="text-green-600 font-medium">{data.filter(d => d.crawler_category === "AI Crawler").length} AI crawlers</span>
            {" • "}
            <span className="text-gray-600 font-medium">{data.filter(d => d.crawler_category === "Generic Bot").length} other bots</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
