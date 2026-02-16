# Pipeline Config

## Global Action Exclusions

To skip actions from a pipeline for ALL articles, create:

    config/pipelines/enhance_exclude.md

One action per line, `#` for comments:

    # Skip diagrams for this project
    add_diagrams
    render_diagrams

## Section-Specific Action Exclusions

To skip actions only for articles in a specific URL path,
create a subfolder matching the section name:

    config/pipelines/
      enhance_exclude.md           <- global (all articles)
      checklist/
        enhance_exclude.md         <- additional excludes for checklist/* articles

Section excludes are additive — they combine with global excludes.
