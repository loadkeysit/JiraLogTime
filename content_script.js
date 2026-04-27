const DEFAULT_HOST_PATTERNS = [
  "*://*.atlassian.net/*",
  "*://*.jira.com/*",
  "*://*jira*/*"
];

let lastSavedIssueKey = null;
let lastSavedIssueSummary = null;

function wildcardToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + escaped.replace(/\*/g, ".*") + "$", "i");
}

function urlMatchesPattern(url, pattern) {
  if (pattern === "<all_urls>") {
    return true;
  }
  try {
    const normalized = pattern.trim();
    return wildcardToRegExp(normalized).test(url);
  } catch (error) {
    return false;
  }
}

async function loadHostConfig() {
  try {
    const configUrl = browser.runtime.getURL("hosts.json");
    const response = await fetch(configUrl);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    return null;
  }
}

function isAllowedUrl(url, patterns) {
  if (!patterns || patterns.length === 0) {
    return /jira|atlassian/i.test(new URL(url).hostname);
  }
  return patterns.some((pattern) => urlMatchesPattern(url, pattern));
}

function extractIssueFromUrl(url) {
  const match = url.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  return match ? match[1] : null;
}

function extractSummary() {
  const selectors = [
    "#summary-val",
    ".issue-header-content h1",
    ".js-issue-header h1",
    ".issue-title .title",
    "#issue-header h1",
    ".css-1b1vyz7 h1"
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }

  if (document.title) {
    return document.title.replace(/\s*-\s*Jira.*$/i, "").trim();
  }

  return null;
}

function normalizeLabel(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/[\u200b\u200e\u200f]/g, "")
    .replace(/[:]*$/g, "")
    .trim();
}

function extractIssueFields() {
  const fields = {};
  const addField = (key, value) => {
    const normalizedKey = normalizeLabel(key);
    const normalizedValue = normalizeLabel(value);
    if (normalizedKey && normalizedValue) {
      fields[normalizedKey] = normalizedValue;
    }
  };

  document.querySelectorAll("dt").forEach((dt) => {
    const dd = dt.nextElementSibling;
    if (dd && dd.tagName === "DD") {
      addField(dt.textContent, dd.textContent);
    }
  });

  document.querySelectorAll("table tr").forEach((tr) => {
    const th = tr.querySelector("th");
    const td = tr.querySelector("td");
    if (th && td) {
      addField(th.textContent, td.textContent);
    }
  });

  document.querySelectorAll(".issue-data-block .field-group").forEach((group) => {
    const label = group.querySelector(".field-label, .name");
    const value = group.querySelector(".field-value, .value");
    if (label && value) {
      addField(label.textContent, value.textContent);
    }
  });

  return fields;
}

function buildIssueData() {
  const url = window.location.href;
  const key = extractIssueFromUrl(url);
  const summary = extractSummary();
  if (!key || !summary) {
    return null;
  }

  const fields = extractIssueFields();
  return { key, summary, url, fields };
}

async function saveCurrentIssue() {
  const issue = buildIssueData();
  if (!issue) {
    return;
  }

  if (issue.key === lastSavedIssueKey && issue.summary === lastSavedIssueSummary) {
    return;
  }

  lastSavedIssueKey = issue.key;
  lastSavedIssueSummary = issue.summary;
  await browser.storage.local.set({ currentIssue: issue });
}

function debounce(fn, wait = 300) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, wait);
  };
}

async function initialize() {
  const config = await loadHostConfig();
  const hostPatterns = (config && config.host_permissions) || DEFAULT_HOST_PATTERNS;
  if (!isAllowedUrl(window.location.href, hostPatterns)) {
    return;
  }

  saveCurrentIssue();

  const observer = new MutationObserver(debounce(saveCurrentIssue, 400));
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("popstate", () => saveCurrentIssue());
  window.addEventListener("hashchange", () => saveCurrentIssue());
}

initialize();
