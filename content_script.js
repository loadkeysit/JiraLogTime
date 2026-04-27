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

function extractFieldValue(valueEl) {
  if (!valueEl) {
    return "";
  }

  const issueLink = valueEl.querySelector("a.issue-link, a[href*='/browse/']");
  if (issueLink) {
    const parts = [issueLink.textContent.trim()];
    let node = issueLink.nextSibling;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          parts.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const text = node.innerText.trim();
        if (text) {
          parts.push(text);
        }
      }
      node = node.nextSibling;
    }
    return normalizeLabel(parts.join(" "));
  }

  const rawText = valueEl.innerText || "";
  return normalizeLabel(rawText.replace(/\b(Edit|Click to edit|Add link|Add a comment|Delete this link)\b.*$/i, ""));
}

function extractFieldLabel(row) {
  const labelEl = row.querySelector("strong.name label, strong.name, strong > label, .field-label, label");
  if (!labelEl) {
    return null;
  }
  return normalizeLabel(labelEl.textContent || "");
}

function extractFieldValueFromRow(row) {
  const valueEl = row.querySelector("[id$='-val'], .value, .field-value, .wrap, .value-container, .rlabs-value") || row;
  return extractFieldValue(valueEl);
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

  const customfieldRows = Array.from(document.querySelectorAll("[id^='rowForcustomfield_']"));
  if (customfieldRows.length) {
    customfieldRows.forEach((row) => {
      const key = extractFieldLabel(row);
      if (!key) {
        return;
      }
      const value = extractFieldValueFromRow(row);
      addField(key, value);
    });
    return fields;
  }

  const parseListItem = (item) => {
    const labelEl = item.querySelector("strong.name label, strong.name, strong > label, .field-label, label");
    const valueEl = item.querySelector("[id$='-val'], .value, .field-value, .wrap, .value-container") || item;
    if (!labelEl) {
      return;
    }
    addField(labelEl.textContent, extractFieldValue(valueEl));
  };

  const customfieldItems = Array.from(document.querySelectorAll("[id^='customfield-panel-'] li.item, [id^='customfield-panel-'] li.list-item"));
  if (customfieldItems.length) {
    customfieldItems.forEach(parseListItem);
    return fields;
  }

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

function extractAssignee() {
  const assigneeEl = document.querySelector("#assignee-val");
  if (assigneeEl) {
    const userSpan = assigneeEl.querySelector(".user-hover");
    if (userSpan) {
      return userSpan.textContent.trim();
    }
  }
  return null;
}

function extractReporter() {
  const reporterEl = document.querySelector("#reporter-val");
  if (reporterEl) {
    const userSpan = reporterEl.querySelector(".user-hover");
    if (userSpan) {
      return userSpan.textContent.trim();
    }
  }
  return null;
}

function extractCurrentUser() {
  const userMeta = document.querySelector('meta[name="ajs-remote-user"]');
  if (userMeta && userMeta.content) {
    return userMeta.content.trim();
  }

  const userFullMeta = document.querySelector('meta[name="ajs-remote-user-fullname"]');
  if (userFullMeta && userFullMeta.content) {
    return userFullMeta.content.trim();
  }

  return null;
}

function buildIssueData() {
  const url = window.location.href;
  const key = extractIssueFromUrl(url);
  const summary = extractSummary();
  if (!key || !summary) {
    return null;
  }

  const fields = extractIssueFields();
  const assignee = extractAssignee();
  const reporter = extractReporter();
  const currentUser = extractCurrentUser();
  return { key, summary, url, fields, assignee, reporter, currentUser };
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

  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === "getCurrentIssue") {
      const currentIssue = buildIssueData();
      if (currentIssue) {
        browser.storage.local.set({ currentIssue });
      }
      return Promise.resolve(currentIssue || null);
    }
    return false;
  });
}

initialize();
