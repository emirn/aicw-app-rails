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
import { FileText, Filter, Share2 } from "lucide-react";
import { ShareClickPageAggregated } from "@/hooks/use-share-clicks-by-page";
import { getPathLabel } from "@/lib/format";
import { getShareServiceColor, getShareServiceFaviconUrl } from "@/lib/ai-service-icons";

interface ShareByPageTableProps {
  data: ShareClickPageAggregated[];
  loading?: boolean;
  error?: Error | null;
  onPageClick?: (pagePath: string) => void;
  domain: string;
}

export function ShareByPageTable({
  data,
  loading,
  error,
  onPageClick,
  domain,
}: ShareByPageTableProps) {
  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle>Top Pages by Share Clicks</CardTitle>
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
            <CardTitle>Top Pages by Share Clicks</CardTitle>
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
            <CardTitle>Top Pages by Share Clicks</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
          <Share2 className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
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
              <CardTitle>Top Pages by Share Clicks</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Pages where visitors clicked share buttons
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
                <TableHead className="text-right font-bold">Shares</TableHead>
                <TableHead className="text-right font-bold">Sessions</TableHead>
                <TableHead className="text-center font-bold">Top Service</TableHead>
                <TableHead className="text-center font-bold">Breakdown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((page, index) => {
                const topServiceColor = getShareServiceColor(page.topShareService);
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

                    {/* Total Shares */}
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

                    {/* Top Share Service */}
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <img
                          src={getShareServiceFaviconUrl(page.topShareService, 16)}
                          alt={`${page.topShareServiceDisplayName} icon`}
                          className="w-4 h-4 rounded"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = 'none';
                          }}
                        />
                        <span className="text-sm font-medium">
                          {page.topShareServiceDisplayName}
                        </span>
                      </div>
                    </TableCell>

                    {/* Breakdown badges */}
                    <TableCell>
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {page.breakdown.slice(0, 3).map((item) => (
                          <Badge
                            key={item.shareService}
                            variant="secondary"
                            className="text-xs flex items-center gap-1"
                            style={{
                              backgroundColor: `${getShareServiceColor(item.shareService)}20`,
                              color: getShareServiceColor(item.shareService),
                            }}
                          >
                            <img
                              src={getShareServiceFaviconUrl(item.shareService, 16)}
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
            share clicks
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
