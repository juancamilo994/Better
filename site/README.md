# Better demo site

Static page that shows real Better evaluations recorded from the live engine: screenshots, scores per criterion, top fixes and the generated agent prompt. Live at https://juancamilo994.github.io/Better/ (published by .github/workflows/pages.yml on every change to site/).

- `index.html`: the page (no build step, no dependencies)
- `data/demo-data.json` and `data/*.jpg`: recorded evaluations

To refresh the data, run the harness with the live judge and record new runs; the recorder script is described in the PR that added this folder.
