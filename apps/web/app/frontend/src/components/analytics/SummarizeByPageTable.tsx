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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileText, Filter, Sparkles } from "lucide-react";
import { SummarizeClickPageAggregated } from "@/hooks/use-summarize-clicks-by-page";
import { getPathLabel } from "@/lib/format";

interface SummarizeByPageTableProps {
  data: SummarizeClickPageAggregated[];
  loading?: boolean;
  error?: Error | null;
  onPageClick?: (pagePath: string) => void;
  domain: string;
}

// Colors for each AI service
const AI_SERVICE_COLORS: Record<string, string> = {
  chatgpt: "#10A37F",
  claude: "#D77E5C",
  perplexity: "#1FB8CD",
  gemini: "#4285F4",
  grok: "#000000",
};

// AI service to domain mapping for favicons
const AI_SERVICE_DOMAINS: Record<string, string> = {
  chatgpt: "chat.openai.com",
  claude: "claude.ai",
  perplexity: "perplexity.ai",
  gemini: "gemini.google.com",
  grok: "x.com",
};

function getServiceColor(serviceKey: string): string {
  return AI_SERVICE_COLORS[serviceKey?.toLowerCase()] || "#6B7280";
}

function getAIServiceFaviconUrl(serviceKey: string, size: number = 16): string {
  const domain = AI_SERVICE_DOMAINS[serviceKey?.toLowerCase()] || "aicw.io";
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

export function SummarizeByPageTable({
  data,
  loading,
  error,
  onPageClick,
  domain,
}: SummarizeByPageTableProps) {
  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle>Top Pages by Summarize Clicks</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
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
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle>Top Pages by Summarize Clicks</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load page data. Please try again.
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
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle>Top Pages by Summarize Clicks</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
          <Sparkles className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <p className="text-sm text-muted-foreground">
            No page data available for this time period.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-primary" />
              <CardTitle>Top Pages by Summarize Clicks</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Pages where visitors clicked "Summarize with AI" buttons
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border-2 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[50px] font-bold">#</TableHead>
                <TableHead className="font-bold">Page Path</TableHead>
                <TableHead className="text-right font-bold">Clicks</TableHead>
                <TableHead className="text-right font-bold">Sessions</TableHead>
                <TableHead className="text-center font-bold">Top AI Service</TableHead>
                <TableHead className="text-center font-bold">Breakdown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((page, index) => {
                const topServiceColor = getServiceColor(page.topAIService);
                return (
                  <TableRow
                    key={`${page.pagePath}-${index}`}
                    className="transition-colors hover:bg-accent/10 group"
                  >
                    {/* Rank */}
                    <TableCell>
                      <div
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm"
                        style={{
                          backgroundColor: `${topServiceColor}15`,
                          color: topServiceColor,
                        }}
                      >
                        {index + 1}
                      </div>
                    </TableCell>

                    {/* Page Path */}
                    <TableCell className="font-mono text-sm max-w-[400px]">
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://${domain}${page.pagePath}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium hover:underline hover:text-primary"
                          title={page.pagePath}
                        >
                          {page.pagePath || "/"}
                          {(() => {
                            const label = getPathLabel(page.pagePath);
                            return (
                              label && (
                                <span className="text-muted-foreground font-normal ml-1">
                                  ({label})
                                </span>
                              )
                            );
                          })()}
                        </a>
                        {onPageClick && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPageClick(page.pagePath);
                                }}
                                className="p-1 rounded hover:bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto"
                              >
                                <Filter className="w-4 h-4 text-muted-foreground" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Filter by this page</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>

                    {/* Total Clicks */}
                    <TableCell className="text-right">
                      <span
                        className="font-bold text-lg"
                        style={{ color: topServiceColor }}
                      >
                        {page.totalClicks.toLocaleString()}
                      </span>
                    </TableCell>

                    {/* Sessions */}
                    <TableCell className="text-right">
                      <span className="text-muted-foreground font-medium">
                        {page.totalSessions.toLocaleString()}
                      </span>
                    </TableCell>

                    {/* Top AI Service */}
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <img
                          src={getAIServiceFaviconUrl(page.topAIService, 16)}
                          alt={`${page.topAIServiceDisplayName} icon`}
                          className="w-4 h-4 rounded"
                          onError={(e) => {
                            // Fallback to colored dot on error
                            const target = e.currentTarget;
                            target.style.display = 'none';
                          }}
                        />
                        <span className="text-sm font-medium">
                          {page.topAIServiceDisplayName}
                        </span>
                      </div>
                    </TableCell>

                    {/* Breakdown badges */}
                    <TableCell>
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {page.breakdown.slice(0, 3).map((item) => (
                          <Badge
                            key={item.aiService}
                            variant="secondary"
                            className="text-xs flex items-center gap-1"
                            style={{
                              backgroundColor: `${getServiceColor(item.aiService)}20`,
                              color: getServiceColor(item.aiService),
                            }}
                          >
                            <img
                              src={getAIServiceFaviconUrl(item.aiService, 16)}
                              alt=""
                              className="w-3 h-3 rounded"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            {item.displayName}: {item.clickCount}
                          </Badge>
                        ))}
                        {page.breakdown.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{page.breakdown.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Summary Footer */}
        <div className="mt-4 p-4 bg-gradient-card rounded-lg border text-center">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground">{data.length}</span>{" "}
            pages • Total of{" "}
            <span className="font-bold text-primary">
              {data.reduce((sum, p) => sum + p.totalClicks, 0).toLocaleString()}
            </span>{" "}
            summarize clicks
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
