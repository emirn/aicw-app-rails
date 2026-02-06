import { useState, useEffect } from "react";

interface PublicProjectState {
  projectId: string | null;
  projectName: string | null;
  domain: string | null;
  isPublicEnabled: boolean;
  loading: boolean;
  error: Error | null;
}

interface ProjectLookupResult {
  project_id: string;
  name: string;
  domain: string;
}

/**
 * Hook to fetch project data for public analytics page
 * Only returns project data if enable_public_page = true
 * Calls the Rails public analytics API with lookup_project pipe
 * @param domain - The project domain to look up
 */
export function usePublicProject(domain: string | undefined) {
  const [state, setState] = useState<PublicProjectState>({
    projectId: null,
    projectName: null,
    domain: null,
    isPublicEnabled: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchProject() {
      if (!domain) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        // Call Rails public analytics API for project lookup
        const response = await fetch('/api/v1/analytics/public', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pipe: 'lookup_project', domain }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();

        if (result?.data && result.data.length > 0) {
          const project: ProjectLookupResult = result.data[0];
          setState({
            projectId: project.project_id,
            projectName: project.name,
            domain: project.domain,
            isPublicEnabled: true,
            loading: false,
            error: null,
          });
        } else {
          setState({
            projectId: null,
            projectName: null,
            domain: null,
            isPublicEnabled: false,
            loading: false,
            error: new Error("Project not found or public page not enabled"),
          });
        }
      } catch (err) {
        setState({
          projectId: null,
          projectName: null,
          domain: null,
          isPublicEnabled: false,
          loading: false,
          error: err as Error,
        });
      }
    }

    fetchProject();
  }, [domain]);

  return state;
}
