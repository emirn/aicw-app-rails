# CLI Extraction - Implementation Status

## Completed ✅

### 1. Project Structure
- ✅ Created `apps/cli/blogpostgen/` directory
- ✅ Created `src/` and `bin/` subdirectories
- ✅ Set up proper directory hierarchy

### 2. Configuration Files
- ✅ `package.json` - Dependencies and scripts configured
- ✅ `tsconfig.json` - TypeScript compilation settings
- ✅ `.gitignore` - Ignore patterns for node_modules, dist, logs
- ✅ `.env.example` - Example environment variables
- ✅ `bin/blogpostgen` - Executable wrapper (chmod +x applied)

### 3. Core Modules
- ✅ `src/types.ts` - Complete type definitions (CLIOptions, Article, ContentPlan, etc.)
- ✅ `src/args.ts` - Argument parsing with env var fallbacks
- ✅ `src/url-utils.ts` - URL hostname extraction
- ✅ `src/logger.ts` - Logger class with console + file output

### 4. Documentation
- ✅ `README.md` - Comprehensive usage guide
  - Installation instructions
  - All CLI flags documented
  - Environment variables documented
  - Example workflows
  - Troubleshooting section
  - Migration guide from old sgen CLI

## Remaining Work 🚧

### 5. HTTP Client Module
**File**: `src/http-client.ts`

**Required**: SgenClient class with:
- `post<T>(path, body, timeout)` method
- `get<T>(path, timeout)` method
- Error handling and retries
- Timeout implementation

**Reference**: Lines 67-123 of `apps/sgen/src/cli/cli-run.ts`

### 6. File Utilities
**File**: `src/file-utils.ts`

**Required**:
- `save(filename, data)` function
- Directory creation helpers
- Path resolution utilities

**Reference**: Lines 60-65 of cli-run.ts

### 7. Pipeline Orchestrator
**File**: `src/pipeline.ts`

**Required**: ArticlePipeline class with:
- Website scanning step
- Competitor analysis step
- Content plan generation step
- Article generation loop
- 8 enhancement actions per article
- Caching logic for website info and plans

**Reference**: Lines 125-288 of cli-run.ts (main orchestration logic)

### 8. Main Entry Point
**File**: `src/index.ts`

**Required**:
- Import and initialize all components
- Parse arguments
- Create logger and HTTP client
- Run pipeline
- Error handling
- Save logs on completion/error

**Reference**: Wrapper logic around existing cli-run.ts

### 9. Cleanup Sgen Service
**Actions needed**:
- Delete `apps/sgen/src/cli/` directory
- Remove `"cli:run"` script from `apps/sgen/package.json`
- Verify sgen builds and runs without CLI code

### 10. Update Root Documentation
**File**: `/Users/mine/projects/blogpostgen/CLAUDE.md`

**Add section**:
```markdown
## CLI Tool

Standalone CLI for batch article generation.

**Location**: `apps/cli/blogpostgen/`

**Documentation**: See [apps/cli/blogpostgen/README.md](apps/cli/blogpostgen/README.md)

**Quick Start**:
# Terminal 1: Start API
cd apps/sgen && npm run dev

# Terminal 2: Run CLI
cd apps/cli/blogpostgen
npm install && npm run build
npm run start -- --url https://example.com --articles 5
```

## Next Steps

1. **Complete remaining source files** (3-4 hours):
   - Create `src/http-client.ts`
   - Create `src/file-utils.ts`
   - Create `src/pipeline.ts`
   - Create `src/index.ts`

2. **Test the CLI** (1-2 hours):
   - `npm install`
   - `npm run build`
   - Start sgen API: `cd ../../services/sgen && npm run dev`
   - Run CLI: `npm run start -- --url https://stripe.com/blog --articles 1`
   - Verify output in `test/output/stripe.com/articles/`

3. **Clean up sgen** (30 min):
   - Remove `src/cli/` directory
   - Update package.json
   - Rebuild and test sgen service

4. **Update documentation** (30 min):
   - Add CLI section to root CLAUDE.md
   - Create migration guide
   - Update any references to old CLI location

## Implementation Notes

### Key Decisions Made

1. **No shared code**: CLI uses only HTTP API calls, no imports from sgen
2. **Proper TypeScript**: Full type safety with interfaces
3. **Modular design**: Each concern in separate file
4. **Environment-aware**: Supports both CLI flags and env vars
5. **Backward compatible**: Same functionality as old CLI

### File Mapping from Old CLI

| Old Location | New Location | Lines | Status |
|--------------|--------------|-------|--------|
| cli-run.ts:5-7 | src/types.ts | Full interfaces | ✅ Done |
| cli-run.ts:9-35 | src/args.ts | Argument parsing | ✅ Done |
| cli-run.ts:37-45 | src/url-utils.ts | URL helpers | ✅ Done |
| cli-run.ts:52-58 | src/logger.ts | Logger class | ✅ Done |
| cli-run.ts:60-65 | src/file-utils.ts | File I/O | 🚧 TODO |
| cli-run.ts:67-123 | src/http-client.ts | API client | 🚧 TODO |
| cli-run.ts:125-288 | src/pipeline.ts | Orchestration | 🚧 TODO |
| New | src/index.ts | Entry point | 🚧 TODO |

### Testing Checklist

- [ ] CLI builds successfully
- [ ] Executable has correct permissions
- [ ] Connects to API
- [ ] Generates website info
- [ ] Generates content plan
- [ ] Generates articles
- [ ] Applies all 8 enhancement actions
- [ ] Saves output files correctly
- [ ] Caches website info
- [ ] Logs to correct location
- [ ] Handles errors gracefully

## Estimated Remaining Time

- **Complete source files**: 3-4 hours
- **Testing & debugging**: 1-2 hours
- **Cleanup & documentation**: 1 hour
- **Total**: 5-7 hours

## Success Criteria

✅ CLI runs independently from sgen codebase
✅ CLI calls API via HTTP only
✅ CLI generates articles successfully
✅ CLI saves output to local files
✅ Sgen service works without CLI code
✅ Documentation is complete and accurate
