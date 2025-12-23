1. Commit the changes if any with your best knowledge of what the commit should be

If you're unsure what the changes are - run a git diff to see what's in the workbench

Use conventional commits, following:

"@semantic-release/commit-analyzer",
{
"preset": "conventionalcommits",
"releaseRules": [
{ "type": "feat", "release": "minor" },
{ "type": "fix", "release": "patch" },
{ "type": "perf", "release": "patch" },
{ "type": "refactor", "release": "patch" },
{ "type": "docs", "release": false },
{ "type": "style", "release": false },
{ "type": "chore", "release": false },
{ "type": "test", "release": false },
{ "type": "ci", "release": false },
{ "breaking": true, "release": "major" }
]
}
