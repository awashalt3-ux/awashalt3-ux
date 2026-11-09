import { readFileSync, writeFileSync } from "node:fs";

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const USERNAME = "awashalt3-ux";

const GQL_QUERY = `query($login:String!){user(login:$login){contributionsCollection{totalCommitContributions totalIssueContributions totalPullRequestContributions contributionCalendar{totalContributions}}}}`;

async function fetchContributions() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "User-Agent": "profile-stats-updater",
    },
    body: JSON.stringify({ query: GQL_QUERY, variables: { login: USERNAME } }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const c = json.data.user.contributionsCollection;
  return {
    contributions: c.contributionCalendar.totalContributions,
    commits: c.totalCommitContributions,
    prs: c.totalPullRequestContributions,
    issues: c.totalIssueContributions,
  };
}

async function fetchRepos() {
  // Public REST API: returns all public repos owned by the user (no auth required,
  // but a token raises rate limits). Paginate to be safe.
  const repos = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}&type=owner`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "profile-stats-updater",
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`GitHub REST ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  const owned = repos.filter((r) => !r.fork);
  const stars = owned.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  return { repos: owned.length, stars };
}

async function fetchStats() {
  const [contrib, repos] = await Promise.all([fetchContributions(), fetchRepos()]);
  return { ...contrib, ...repos };
}

function formatDate(d) {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function aboutInner(s) {
  return `<sub>${s.contributions} contributions · ${s.commits} commits · ${s.repos} dépôts publics · ${s.stars} étoiles — année ${new Date().getFullYear()}.</sub>`;
}

function badgesInner(s) {
  const date = formatDate(new Date());
  return [
    '<div align="center">',
    `  <img src="https://img.shields.io/badge/Contributions-${s.contributions}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${s.contributions} contributions" />`,
    `  <img src="https://img.shields.io/badge/Commits-${s.commits}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${s.commits} commits" />`,
    `  <img src="https://img.shields.io/badge/D%C3%A9p%C3%B4ts-${s.repos}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${s.repos} dépôts" />`,
    `  <img src="https://img.shields.io/badge/%C3%89toiles-${s.stars}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${s.stars} étoiles" />`,
    `  <img src="https://img.shields.io/badge/Pull%20requests-${s.prs}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${s.prs} pull requests" />`,
    `  <img src="https://img.shields.io/badge/Issues-${s.issues}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${s.issues} issues" />`,
    "</div>",
    "",
    `<p align="center"><sub>Chiffres exacts — mise à jour le ${date}.</sub></p>`,
  ].join("\n");
}

function replaceBlock(text, startMarker, endMarker, inner) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${esc(startMarker)})[\\s\\S]*?(${esc(endMarker)})`, "m");
  if (!re.test(text)) throw new Error(`Markers not found: ${startMarker} ... ${endMarker}`);
  return text.replace(re, `$1\n${inner}\n$2`);
}

async function main() {
  const stats = await fetchStats();
  console.log("Stats:", JSON.stringify(stats));

  let readme = readFileSync("README.md", "utf8");
  const original = readme;

  readme = replaceBlock(readme, "<!-- STATS_ABOUT:START -->", "<!-- STATS_ABOUT:END -->", aboutInner(stats));
  readme = replaceBlock(readme, "<!-- STATS_BADGES:START -->", "<!-- STATS_BADGES:END -->", badgesInner(stats));

  if (readme === original) {
    console.log("No changes.");
    return;
  }
  writeFileSync("README.md", readme);
  console.log("README updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
