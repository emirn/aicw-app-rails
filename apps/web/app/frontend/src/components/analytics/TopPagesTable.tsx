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
import { TopPageData } from "@/hooks/use-top-pages-by-ai";
import { FileText, ExternalLink, TrendingUp } from "lucide-react";
import { getSourceIconUrl } from "@/lib/ai-sources";
import { getAISourceColor } from "@/lib/ai-colors";
import { formatPercent, getPathLabel } from "@/lib/format";

interface TopPagesTableProps {
  data: TopPageData[];
  loading?: boolean;
  error?: Error | null;
  onPageClick?: (pagePath: string) => void;
}

export function TopPagesTable({
  data,
  loading,
  error,
  onPageClick,
}: TopPagesTableProps) {
  if (loading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <CardTitle>Top Pages by AI Traffic</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Most visited pages by AI chatbots
          </p>
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
            <CardTitle>Top Pages by AI Traffic</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load top pages data. Please try again.
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
            <CardTitle>Top Pages by AI Traffic</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center h-[200px] text-center">
          <FileText className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
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
              <CardTitle>Top Pages by AI Traffic</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">
              Most visited pages by AI chatbots • Click to filter by page
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
                <TableHead className="text-right font-bold">Total Visits</TableHead>
                <TableHead className="text-right font-bold">AI Visits</TableHead>
                <TableHead className="text-center font-bold">AI %</TableHead>
                <TableHead className="text-center font-bold">Top AI Source</TableHead>
                <TableHead className="text-right font-bold">Sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((page, index) => {
                const aiSourceColor = getAISourceColor(page.topAiSource);
                return (
                  <TableRow
                    key={`${page.pagePath}-${index}`}
                    className={`transition-colors ${
                      onPageClick
                        ? "cursor-pointer hover:bg-accent/10"
                        : ""
                    }`}
                    onClick={() => onPageClick?.(page.pagePath)}
                  >
                    {/* Rank */}
                    <TableCell>
                      <div
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm"
                        style={{
                          backgroundColor: `${aiSourceColor}15`,
                          color: aiSourceColor,
                        }}
                      >
                        {index + 1}
                      </div>
                    </TableCell>

                    {/* Page Path */}
                    <TableCell className="font-mono text-sm max-w-[400px]">
                      <div className="flex items-center gap-2 group">
                        <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="truncate font-medium" title={page.pagePath}>
                          {page.pagePath || "/"}
                          {(() => {
                            const label = getPathLabel(page.pagePath);
                            return label && <span className="text-muted-foreground font-normal ml-1">({label})</span>;
                          })()}
                        </span>
                      </div>
                    </TableCell>

                    {/* Total Visits */}
                    <TableCell className="text-right">
                      <span className="font-semibold text-lg">
                        {page.totalPageviews.toLocaleString()}
                      </span>
                    </TableCell>

                    {/* AI Visits */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <TrendingUp className="w-4 h-4" style={{ color: aiSourceColor }} />
                        <span
                          className="font-bold text-lg"
                          style={{ color: aiSourceColor }}
                        >
                          {page.aiPageviews.toLocaleString()}
                        </span>
                      </div>
                    </TableCell>

                    {/* AI Percentage */}
                    <TableCell className="text-center">
                      <Badge
                        variant="secondary"
                        className="font-bold text-sm px-3 py-1"
                        style={{
                          backgroundColor: `${aiSourceColor}20`,
                          color: aiSourceColor,
                          borderColor: `${aiSourceColor}40`,
                        }}
                      >
                        {formatPercent(page.aiPercentage)}
                      </Badge>
                    </TableCell>

                    {/* Top AI Source */}
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <div
                          className="flex items-center justify-center w-8 h-8 rounded-lg"
                          style={{ backgroundColor: `${aiSourceColor}15` }}
                        >
                          <img
                            src={getSourceIconUrl(page.topAiSource, false, 32)}
                            alt={page.topAiSourceName}
                            className="w-5 h-5 object-contain"
                            title={page.topAiSourceName}
                          />
                        </div>
                        <span className="text-sm font-medium">
                          {page.topAiSourceName}
                        </span>
                      </div>
                    </TableCell>

                    {/* Sessions */}
                    <TableCell className="text-right">
                      <span className="text-muted-foreground font-medium">
                        {page.totalVisitors.toLocaleString()}
                      </span>
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
            Showing <span className="font-bold text-foreground">{data.length}</span> pages •{" "}
            Total of{" "}
            <span className="font-bold text-primary">
              {data.reduce((sum, p) => sum + p.aiPageviews, 0).toLocaleString()}
            </span>{" "}
            AI visits across all pages
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
