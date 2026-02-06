/**
 * WidgetTab - Container for widget-related analytics with subtabs
 *
 * Organizes Summarize Clicks, Share Clicks, and Widget Configuration into a single tabbed interface.
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Share2, Eye, TrendingUp, Settings, Copy, Shield } from "lucide-react";
import { DateRange } from "react-day-picker";
// useToast not yet ported — using simple clipboard feedback


import { SummarizeStatsGrid } from "./SummarizeStatsGrid";
import { SummarizeServiceChart } from "./SummarizeServiceChart";
import { SummarizeTrendChart } from "./SummarizeTrendChart";
import { SummarizeByPageTable } from "./SummarizeByPageTable";
import { ShareStatsGrid } from "./ShareStatsGrid";
import { ShareServiceChart } from "./ShareServiceChart";
import { ShareTrendChart } from "./ShareTrendChart";
import { ShareByPageTable } from "./ShareByPageTable";
// WidgetConfig component and generate-tracking-script not yet ported
type WidgetConfigType = Record<string, any>;
const WidgetConfig = (_props: any) => null;

interface WidgetTabProps {
  // Summarize data
  summarizeOverviewData: any;
  summarizeTrendData: any;
  summarizeByPageData: any;
  summarizeTotalClicks: number;
  summarizeTotalSessions: number;
  summarizeTotalOpens: number;
  summarizeClickThroughRate: number;
  summarizeOverviewLoading: boolean;
  summarizeTrendLoading: boolean;
  summarizeByPageLoading: boolean;

  // Share data
  shareOverviewData: any;
  shareTrendData: any;
  shareByPageData: any;
  shareTotalClicks: number;
  shareTotalSessions: number;
  shareOverviewLoading: boolean;
  shareTrendLoading: boolean;
  shareByPageLoading: boolean;

  // Other
  dateRange: DateRange | undefined;
  onPageClick: (pagePath: string) => void;
  domain: string;

  // Widget configuration (optional - only needed when Configure tab is shown)
  widgetConfig?: WidgetConfigType;
  onWidgetConfigChange?: (config: WidgetConfigType) => void;
  trackingId?: string;
  projectDomain?: string;
  trackingScript?: string;
}

export function WidgetTab({
  summarizeOverviewData,
  summarizeTrendData,
  summarizeByPageData,
  summarizeTotalClicks,
  summarizeTotalSessions,
  summarizeTotalOpens,
  summarizeClickThroughRate,
  summarizeOverviewLoading,
  summarizeTrendLoading,
  summarizeByPageLoading,
  shareOverviewData,
  shareTrendData,
  shareByPageData,
  shareTotalClicks,
  shareTotalSessions,
  shareOverviewLoading,
  shareTrendLoading,
  shareByPageLoading,
  dateRange,
  onPageClick,
  domain,
  widgetConfig,
  onWidgetConfigChange,
  trackingId,
  projectDomain,
  trackingScript,
}: WidgetTabProps) {
  const copyToClipboard = (text: string, _message: string) => {
    navigator.clipboard.writeText(text);
  };

  // Check if Configure tab should be shown (only when config props are provided)
  const showConfigureTab = widgetConfig && onWidgetConfigChange && trackingId && projectDomain;

  return (
    <Tabs defaultValue="summarize" className="space-y-6">
      <TabsList>
        <TabsTrigger value="summarize" className="gap-1 sm:gap-2 px-2 sm:px-3">
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">Summarize</span>
        </TabsTrigger>
        <TabsTrigger value="share" className="gap-1 sm:gap-2 px-2 sm:px-3">
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </TabsTrigger>
        {showConfigureTab && (
          <TabsTrigger value="configure" className="gap-1 sm:gap-2 px-2 sm:px-3">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Configure</span>
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="summarize" className="space-y-6">
        {/* Summarize Clicks Stats Grid */}
        <SummarizeStatsGrid
          data={summarizeOverviewData}
          totalClicks={summarizeTotalClicks}
          totalSessions={summarizeTotalSessions}
          loading={summarizeOverviewLoading}
          timeframe={dateRange ? "Selected period" : "All time"}
        />

        {/* Trend Chart and Service Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SummarizeTrendChart
            data={summarizeTrendData}
            loading={summarizeTrendLoading}
          />
          <SummarizeServiceChart
            data={summarizeOverviewData}
            loading={summarizeOverviewLoading}
          />
        </div>

        {/* Pages Table */}
        <SummarizeByPageTable
          data={summarizeByPageData}
          loading={summarizeByPageLoading}
          domain={domain}
          onPageClick={onPageClick}
        />

        {/* Secondary Metrics */}
        {!summarizeOverviewLoading && (
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              {summarizeTotalOpens.toLocaleString()} popup opens
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" />
              {summarizeClickThroughRate.toFixed(1)}% click-through rate
            </span>
          </div>
        )}
      </TabsContent>

      <TabsContent value="share" className="space-y-6">
        {/* Share Clicks Stats Grid */}
        <ShareStatsGrid
          data={shareOverviewData}
          totalClicks={shareTotalClicks}
          totalSessions={shareTotalSessions}
          loading={shareOverviewLoading}
          timeframe={dateRange ? "Selected period" : "All time"}
        />

        {/* Trend Chart and Service Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ShareTrendChart
            data={shareTrendData}
            loading={shareTrendLoading}
          />
          <ShareServiceChart
            data={shareOverviewData}
            loading={shareOverviewLoading}
          />
        </div>

        {/* Pages Table */}
        <ShareByPageTable
          data={shareByPageData}
          loading={shareByPageLoading}
          domain={domain}
          onPageClick={onPageClick}
        />
      </TabsContent>

      {showConfigureTab && (
        <TabsContent value="configure" className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle>Add code to website</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Widget Configuration */}
              <WidgetConfig
                config={widgetConfig}
                onChange={onWidgetConfigChange}
              />

              {/* Installation Instructions with Tabs */}
              <Tabs defaultValue="html" className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-9">
                  <TabsTrigger value="html" className="text-xs">HTML</TabsTrigger>
                  <TabsTrigger value="gtm" className="text-xs">Google Tag Manager</TabsTrigger>
                  <TabsTrigger value="react" className="text-xs">React / Next.js</TabsTrigger>
                </TabsList>

                <TabsContent value="html" className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Add before the closing <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> tag on every page
                  </p>
                  <div className="relative">
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                      <code>{trackingScript}</code>
                    </pre>
                    <Button
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(trackingScript || "", "Code copied to clipboard")}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="gtm" className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Create a <strong>Custom HTML</strong> tag and set trigger to <strong>All Pages</strong>
                  </p>
                  <div className="relative">
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                      <code>{trackingScript}</code>
                    </pre>
                    <Button
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(trackingScript || "", "Code copied to clipboard")}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="react" className="mt-3 space-y-4">
                  {/* Next.js */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Next.js</p>
                    <p className="text-xs text-muted-foreground">
                      Add to <code className="bg-muted px-1 rounded">app/layout.tsx</code> or <code className="bg-muted px-1 rounded">pages/_app.tsx</code>
                    </p>
                    <div className="relative">
                      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                        <code>{`import Script from 'next/script'

export default function Layout({ children }) {
  return (
    <>
      {children}
      <Script
        src="https://t.aicw.io/aicw-view.min.js"
        data-key="${trackingId}"
        data-domain="${projectDomain}"
        strategy="afterInteractive"
      />
    </>
  )
}`}</code>
                      </pre>
                      <Button
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard(`import Script from 'next/script'

export default function Layout({ children }) {
  return (
    <>
      {children}
      <Script
        src="https://t.aicw.io/aicw-view.min.js"
        data-key="${trackingId}"
        data-domain="${projectDomain}"
        strategy="afterInteractive"
      />
    </>
  )
}`, "Next.js code copied")}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                  </div>

                  {/* React (CRA, Vite) */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium">React (Create React App, Vite)</p>
                    <p className="text-xs text-muted-foreground">
                      Add component to <code className="bg-muted px-1 rounded">App.jsx</code> or root component
                    </p>
                    <div className="relative">
                      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                        <code>{`import { useEffect } from 'react'

function AICWWidget() {
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://t.aicw.io/aicw-view.min.js'
    script.defer = true
    script.setAttribute('data-key', '${trackingId}')
    script.setAttribute('data-domain', '${projectDomain}')
    document.body.appendChild(script)
    return () => script.remove()
  }, [])
  return null
}

// Use: <AICWWidget /> in your root component`}</code>
                      </pre>
                      <Button
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard(`import { useEffect } from 'react'

function AICWWidget() {
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://t.aicw.io/aicw-view.min.js'
    script.defer = true
    script.setAttribute('data-key', '${trackingId}')
    script.setAttribute('data-domain', '${projectDomain}')
    document.body.appendChild(script)
    return () => script.remove()
  }, [])
  return null
}

// Use: <AICWWidget /> in your root component`, "React code copied")}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Privacy Badge */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                <Shield className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                <span>No cookies · No IP tracking · No consent banner required</span>
                <a
                  href="https://aicw.io/security/?utm_source=settings_page"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  More information
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  );
}
