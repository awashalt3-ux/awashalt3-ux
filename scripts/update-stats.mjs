import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const USERNAME = process.env.PROFILE_USER || "awashalt3-ux";
const PROFILE_REPO = USERNAME;
const TZ = "Europe/Paris";

const C = {
  bg: "#10110f",
  panel: "#171a15",
  border: "#2a2f25",
  accent: "#c5f36b",
  accent2: "#8ab43a",
  text: "#f0f1e9",
  muted: "#a2a99a",
  dim: "#6b7465",
  track: "#1b1f16",
};

const UI = "'Segoe UI', system-ui, -apple-system, Arial, sans-serif";
const MONO = "Consolas, 'SF Mono', 'Courier New', monospace";

const GQL_QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
      commitContributionsByRepository(maxRepositories: 100) {
        contributions { totalCount }
        repository { nameWithOwner }
      }
    }
    repositories(
      first: 100
      ownerAffiliations: OWNER
      isFork: false
      privacy: PUBLIC
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      totalCount
      nodes {
        name
        nameWithOwner
        description
        stargazerCount
        forkCount
        pushedAt
        primaryLanguage { name color }
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
        defaultBranchRef {
          target { ... on Commit { history { totalCount } } }
        }
      }
    }
  }
}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables, attempt = 1) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "User-Agent": "profile-stats-updater",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    if (attempt < 3) {
      await sleep(1500 * attempt);
      return gql(query, variables, attempt + 1);
    }
    throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(d, opts = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: TZ }).format(d);
}

function shortDate(d) {
  return formatDate(d, { day: "numeric", month: "short" });
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} ko`;
  return `${bytes} o`;
}

function panelSvg(width, height, label, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
  <defs>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#171a15"/>
      <stop offset="1" stop-color="#0d0f0b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c5f36b"/>
      <stop offset="1" stop-color="#8ab43a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#c5f36b" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#c5f36b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="18" fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.09"/>
${body}
</svg>
`;
}

function header(width, title, subtitle, y = 46) {
  return `  <text x="32" y="${y}" fill="${C.text}" font-family="${UI}" font-size="20" font-weight="700" letter-spacing="-0.3">${esc(title)}</text>
  <text x="${width - 32}" y="${y}" fill="${C.dim}" font-family="${MONO}" font-size="11" text-anchor="end" letter-spacing="0.6">${esc(subtitle)}</text>`;
}

function languagesCard(languages, stats) {
  const top = languages.slice(0, 6);
  const rowH = 36;
  const startY = 96;
  const height = startY + top.length * rowH + 20;
  const trackX = 208;
  const trackW = 800;
  const total = top.reduce((s, l) => s + l.size, 0) || 1;
  const all = languages.reduce((s, l) => s + l.size, 0) || 1;

  const rows = top.map((lang, i) => {
    const y = startY + i * rowH;
    const share = lang.size / all;
    const w = Math.max(4, Math.round((lang.size / total) * trackW));
    return `  <circle cx="40" cy="${y - 5}" r="5" fill="${esc(lang.color || C.accent)}"/>
  <text x="56" y="${y}" fill="${C.muted}" font-family="${MONO}" font-size="13">${esc(lang.name)}</text>
  <rect x="${trackX}" y="${y - 12}" width="${trackW}" height="10" rx="5" fill="${C.track}" stroke="#ffffff" stroke-opacity="0.05"/>
  <rect x="${trackX}" y="${y - 12}" width="${w}" height="10" rx="5" fill="url(#accent)" opacity="${(0.95 - i * 0.1).toFixed(2)}"/>
  <text x="${trackX + trackW + 24}" y="${y}" fill="${C.accent}" font-family="${MONO}" font-size="13" text-anchor="end">${(share * 100).toFixed(1)}%</text>
  <text x="${trackX + trackW + 30}" y="${y}" fill="${C.dim}" font-family="${MONO}" font-size="11">${esc(formatBytes(lang.size))}</text>`;
  });

  return panelSvg(
    1200,
    height,
    `Langages : ${top.map((l) => l.name).join(", ")}`,
    [
      header(1200, "Langages", `${stats.repos} dépôts · ${formatDate(stats.updatedAt)}`),
      `  <text x="32" y="${height - 8}" fill="${C.dim}" font-family="${MONO}" font-size="10" letter-spacing="1.2">POIDS DU CODE · ${esc(stats.languageCount)} LANGAGES DÉTECTÉS</text>`,
      ...rows,
    ].join("\n")
  );
}

function activityCard(stats) {
  const weeks = stats.weeks;
  const cell = 13;
  const gap = 4;
  const gx = 118;
  const gy = 88;
  const width = 1200;
  const height = gy + 7 * (cell + gap) - gap + 32;
  const levels = ["#1b1f16", "#2f3a22", "#4d6128", "#7fa03a", "#c5f36b"];

  const levelFor = (n) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);

  const cells = [];
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day, row) => {
      const n = day.contributionCount;
      cells.push(
        `  <rect x="${gx + wi * (cell + gap)}" y="${gy + row * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${levels[levelFor(n)]}"${n ? "" : ' stroke="#ffffff" stroke-opacity="0.04"'}><title>${esc(day.date)} · ${n}</title></rect>`
      );
    });
  });

  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const first = week.contributionDays[0];
    if (!first) return;
    const month = new Date(`${first.date}T00:00:00Z`).getUTCMonth();
    if (month !== lastMonth && wi < weeks.length - 3) {
      lastMonth = month;
      const label = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" })
        .format(new Date(`${first.date}T00:00:00Z`))
        .replace(".", "");
      monthLabels.push(
        `  <text x="${gx + wi * (cell + gap)}" y="${gy - 10}" fill="${C.dim}" font-family="${MONO}" font-size="10">${esc(label)}</text>`
      );
    }
  });

  const dayLabels = [
    [1, "lun"],
    [3, "mer"],
    [5, "ven"],
  ].map(
    ([row, label]) =>
      `  <text x="${gx - 12}" y="${gy + row * (cell + gap) + cell - 3}" fill="${C.dim}" font-family="${MONO}" font-size="10" text-anchor="end">${label}</text>`
  );

  const summaryX = 1060;
  const summary = [
    `  <text x="${summaryX}" y="${gy + 30}" fill="${C.accent}" font-family="${UI}" font-size="30" font-weight="700">${stats.contributions}</text>`,
    `  <text x="${summaryX}" y="${gy + 50}" fill="${C.dim}" font-family="${MONO}" font-size="10" letter-spacing="1.1">CONTRIBUTIONS</text>`,
    `  <text x="${summaryX}" y="${gy + 82}" fill="${C.text}" font-family="${UI}" font-size="15" font-weight="600">${stats.commits} commits</text>`,
    `  <text x="${summaryX}" y="${gy + 102}" fill="${C.muted}" font-family="${MONO}" font-size="11">${stats.prs} PR · ${stats.issues} issues</text>`,
  ];

  return panelSvg(
    width,
    height,
    `Activité GitHub : ${stats.contributions} contributions sur l'année`,
    [
      header(width, "Activité", `${stats.contributions} contributions · ${stats.year}`),
      ...monthLabels,
      ...dayLabels,
      ...cells,
      ...summary,
    ].join("\n")
  );
}

function aboutInner(stats) {
  return `<sub>${stats.contributions} contributions · ${stats.commits} commits · ${stats.repos} dépôts publics · ${stats.stars} étoiles · langage principal ${stats.topLanguage} — année ${stats.year}.</sub>`;
}

function badgesInner(stats) {
  return [
    '<div align="center">',
    `  <img src="https://img.shields.io/badge/Contributions-${stats.contributions}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${stats.contributions} contributions" />`,
    `  <img src="https://img.shields.io/badge/Commits-${stats.commits}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${stats.commits} commits" />`,
    `  <img src="https://img.shields.io/badge/D%C3%A9p%C3%B4ts-${stats.repos}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${stats.repos} dépôts" />`,
    `  <img src="https://img.shields.io/badge/%C3%89toiles-${stats.stars}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${stats.stars} étoiles" />`,
    `  <img src="https://img.shields.io/badge/Pull%20requests-${stats.prs}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${stats.prs} pull requests" />`,
    `  <img src="https://img.shields.io/badge/Issues-${stats.issues}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="${stats.issues} issues" />`,
    `  <img src="https://img.shields.io/badge/Langage-${encodeURIComponent(stats.topLanguage)}-c5f36b?style=for-the-badge&amp;labelColor=171a15" alt="Langage principal : ${esc(stats.topLanguage)}" />`,
    "</div>",
    "",
    `<p align="center"><sub>Chiffres exacts — mise à jour le ${formatDate(new Date())}.</sub></p>`,
  ].join("\n");
}

function reposInner(stats) {
  const rows = stats.repoRows
    .map((r) => {
      const lang = r.language ? r.language : "—";
      return `| [**${r.name}**](https://github.com/${r.nameWithOwner}) | ${lang} | ${r.commits} | ${r.stars} | ${shortDate(r.pushedAt)} |`;
    })
    .join("\n");

  return [
    "| Dépôt | Langage | Commits (an) | Étoiles | Dernière MAJ |",
    "| :-- | :-- | --: | --: | --: |",
    rows,
  ].join("\n");
}

function replaceBlock(text, startMarker, endMarker, inner) {
  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escRe(startMarker)})[\\s\\S]*?(${escRe(endMarker)})`, "m");
  if (!re.test(text)) throw new Error(`Markers not found: ${startMarker} ... ${endMarker}`);
  return text.replace(re, `$1\n${inner}\n$2`);
}

async function fetchStats() {
  const data = await gql(GQL_QUERY, { login: USERNAME });
  const user = data.user;
  const contrib = user.contributionsCollection;

  const commitByRepo = new Map(
    contrib.commitContributionsByRepository.map((c) => [c.repository.nameWithOwner, c.contributions.totalCount])
  );

  const repos = user.repositories.nodes;
  const langMap = new Map();
  for (const repo of repos) {
    for (const edge of repo.languages.edges) {
      const cur = langMap.get(edge.node.name) || { name: edge.node.name, color: edge.node.color, size: 0 };
      cur.size += edge.size;
      langMap.set(edge.node.name, cur);
    }
  }
  const languages = [...langMap.values()].sort((a, b) => b.size - a.size);

  const repoRows = repos
    .filter((r) => r.name !== PROFILE_REPO)
    .map((r) => ({
      name: r.name,
      nameWithOwner: r.nameWithOwner,
      language: r.primaryLanguage?.name ?? null,
      commits: commitByRepo.get(r.nameWithOwner) ?? 0,
      stars: r.stargazerCount,
      pushedAt: new Date(r.pushedAt),
    }));

  const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);
  const forks = repos.reduce((s, r) => s + r.forkCount, 0);

  return {
    contributions: contrib.contributionCalendar.totalContributions,
    commits: contrib.totalCommitContributions,
    prs: contrib.totalPullRequestContributions,
    issues: contrib.totalIssueContributions,
    reviews: contrib.totalPullRequestReviewContributions,
    repos: user.repositories.totalCount,
    stars,
    forks,
    languages,
    topLanguage: languages[0]?.name ?? "—",
    languageCount: languages.length,
    weeks: contrib.contributionCalendar.weeks,
    repoRows,
    year: new Date().getUTCFullYear(),
    updatedAt: new Date(),
  };
}

async function main() {
  const stats = await fetchStats();
  console.log("Stats:", JSON.stringify({ ...stats, weeks: undefined, languages: stats.languages.slice(0, 5), repoRows: undefined }));

  mkdirSync("assets/cards", { recursive: true });
  writeFileSync("assets/cards/languages.svg", languagesCard(stats.languages, stats));
  writeFileSync("assets/cards/activity.svg", activityCard(stats));

  let readme = readFileSync("README.md", "utf8");
  const original = readme;

  readme = replaceBlock(readme, "<!-- STATS_ABOUT:START -->", "<!-- STATS_ABOUT:END -->", aboutInner(stats));
  readme = replaceBlock(readme, "<!-- STATS_BADGES:START -->", "<!-- STATS_BADGES:END -->", badgesInner(stats));
  readme = replaceBlock(readme, "<!-- STATS_REPOS:START -->", "<!-- STATS_REPOS:END -->", reposInner(stats));

  if (readme === original) {
    console.log("No README changes.");
  } else {
    writeFileSync("README.md", readme);
    console.log("README updated.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
