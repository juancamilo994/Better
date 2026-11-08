# Better demo site

Static page that shows real Better evaluations recorded from the live engine: screenshots, scores per criterion, top fixes and the generated agent prompt. Live at https://yitzybitzyspider.github.io/better-demo/ and, once Pages is enabled on this repo (Settings, Pages, Source: GitHub Actions), at https://juancamilo994.github.io/Better/.

- `index.html`: the page (no build step, no dependencies)
- `data/demo-data.json` and `data/*.jpg`: recorded evaluations

To refresh the data, run the harness with the live judge and record new runs; the recorder script is described in the PR that added this folder.
