# Write Draft Config

`custom.md` contains the default writing instructions for all articles.

## Section-Specific Overrides

To use different writing instructions for articles in a specific URL path,
create a subfolder matching the section name with its own `custom.md`:

    config/actions/write_draft/
      custom.md                    <- default for all articles
      checklist/
        custom.md                  <- used for articles in checklist/* path
      guides/
        custom.md                  <- used for articles in guides/* path

The section name is the first segment of the article path.
Example: article at `checklist/resume-review` uses section `checklist`.

If no section subfolder exists, the default `custom.md` is used.
