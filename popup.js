function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderIssueFields(fields) {
  const issueFields = document.getElementById("issueFields");
  if (!fields || Object.keys(fields).length === 0) {
    issueFields.innerHTML = "<div class='small'>Nessun campo Jira aggiuntivo rilevato.</div>";
    return;
  }

  const preferredOrder = [
    "Type",
    "Tipo",
    "Priority",
    "Priorità",
    "Resolution",
    "Component/s",
    "Components",
    "Labels",
    "Piattaforma",
    "Sotto Piattaforma",
    "Requested Service",
    "ASA",
    "Reparto del reporter",
    "Team del reporter",
    "Area Reparto",
    "Environment Type",
    "Dominio",
    "Server",
    "Casella",
    "Login (Servizio)"
  ];

  const ordered = [
    ...preferredOrder.filter((key) => key in fields),
    ...Object.keys(fields).filter((key) => !preferredOrder.includes(key))
  ].slice(0, 10);

  issueFields.innerHTML = ordered
    .map((key) => {
      const value = fields[key];
      return `<div><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value || "")}</div>`;
    })
    .join("");
}

function renderHistory(logs) {
  const history = document.getElementById("history");
  if (!logs || logs.length === 0) {
    history.innerHTML = "<p class='small'>Nessun log salvato ancora.</p>";
    return;
  }

  history.innerHTML = logs
    .slice(-5)
    .reverse()
    .map((entry) => `
      <div class="entry">
        <strong>${escapeHtml(entry.issueKey)} ${escapeHtml(entry.issueSummary)}</strong>
        <div>${escapeHtml(entry.timeSpent)} - ${escapeHtml(new Date(entry.createdAt).toLocaleString())}</div>
        <div>${escapeHtml(entry.notes || "Nessuna nota")}</div>
      </div>`)
    .join("");
}

async function getCurrentIssueFromTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      return null;
    }
    const issue = await browser.tabs.sendMessage(tabs[0].id, { type: "getCurrentIssue" });
    if (issue) {
      await browser.storage.local.set({ currentIssue: issue });
    }
    return issue;
  } catch (error) {
    return null;
  }
}

async function queryCurrentIssue(forceRefresh = false) {
  let issue = null;
  if (forceRefresh) {
    issue = await getCurrentIssueFromTab();
  }

  const data = await browser.storage.local.get(["currentIssue", "logs"]);
  issue = issue || data.currentIssue || null;
  const saveButton = document.getElementById("saveButton");
  const issueText = document.getElementById("issueText");

  if (!issue) {
    issueText.textContent = "Nessuna issue Jira rilevata sulla pagina corrente.";
    saveButton.disabled = true;
    document.getElementById("issueFields").innerHTML = "<div class='small'>Apri una pagina Jira compatibile e premi Aggiorna.</div>";
  } else {
    issueText.textContent = `${issue.key} - ${issue.summary}`;
    saveButton.disabled = false;
    renderIssueFields(issue.fields || {});
  }

  renderHistory(data.logs || []);
}

async function saveLog() {
  const data = await browser.storage.local.get("currentIssue");
  const issue = data.currentIssue;
  if (!issue) {
    return;
  }

  const timeSpent = document.getElementById("timeSpent").value.trim();
  const notes = document.getElementById("notes").value.trim();
  if (!timeSpent) {
    alert("Inserisci il tempo speso prima di salvare.");
    return;
  }

  const entry = {
    createdAt: new Date().toISOString(),
    issueKey: issue.key,
    issueSummary: issue.summary,
    issueUrl: issue.url,
    timeSpent,
    notes,
    assignee: issue.assignee || "",
    reporter: issue.reporter || "",
    currentUser: issue.currentUser || "",
    fields: issue.fields || {},
  };

  const stored = await browser.storage.local.get("logs");
  const logs = stored.logs || [];
  logs.push(entry);
  await browser.storage.local.set({ logs });

  document.getElementById("timeSpent").value = "";
  document.getElementById("notes").value = "";
  queryCurrentIssue();
}

async function exportLogs() {
  const stored = await browser.storage.local.get("logs");
  const logs = stored.logs || [];
  if (!logs.length) {
    alert("Nessun log disponibile da esportare.");
    return;
  }

  await downloadCsv(logs);
}

function sanitizeFilename(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9-_\.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function makeCsvLine(entry, fieldKeys) {
  const escapeValue = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const fixed = [
    escapeValue(entry.createdAt),
    escapeValue(entry.issueKey),
    escapeValue(entry.issueSummary),
    escapeValue(entry.timeSpent),
    escapeValue(entry.notes || ""),
    escapeValue(entry.assignee || ""),
    escapeValue(entry.reporter || ""),
    escapeValue(entry.issueUrl)
  ];
  const fieldValues = fieldKeys.map(key => escapeValue(entry.fields[key] || ""));
  return [...fixed, ...fieldValues].join(",");
}

async function downloadCsv(logs) {
  if (!logs || logs.length === 0) {
    return;
  }

  const allKeys = new Set();
  logs.forEach(log => {
    if (log.fields) {
      Object.keys(log.fields).forEach(key => allKeys.add(key));
    }
  });
  const fieldKeys = Array.from(allKeys).sort();

  const header = ["Timestamp", "Issue Key", "Summary", "Time Spent", "Notes", "Assignee", "Reporter", "Issue URL", ...fieldKeys].join(",") + "\n";
  const rows = logs.map(log => makeCsvLine(log, fieldKeys)).join("\n") + "\n";
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const firstLog = logs[0] || {};
  const userPart = sanitizeFilename(firstLog.currentUser || firstLog.assignee || firstLog.reporter || "user");
  const monthPart = new Date().toISOString().slice(0, 7);
  const filename = `jira-time-log-${userPart}-${monthPart}.csv`;

  try {
    // Method 1: Try standard link download (most reliable for popup)
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
    alert(`CSV scaricato: ${filename}`);
  } catch (error) {
    console.error("Link download failed:", error);
    try {
      // Method 2: Try browser.downloads API
      await browser.downloads.download({
        url,
        filename,
        conflictAction: "uniquify",
        saveAs: false
      });
      alert(`CSV scaricato: ${filename}`);
    } catch (error2) {
      console.error("browser.downloads also failed:", error2);
      alert(`Errore nel download. Verifica i permessi dell'estensione.`);
      URL.revokeObjectURL(url);
    }
  }
}

async function clearCache() {
  if (!confirm("Sei sicuro di voler svuotare la cache? Tutti i log salvati verranno eliminati.")) {
    return;
  }
  await browser.storage.local.remove("logs");
  queryCurrentIssue();
}

document.addEventListener("DOMContentLoaded", () => {
  queryCurrentIssue(true);
  document.getElementById("saveButton").addEventListener("click", saveLog);
  document.getElementById("exportButton").addEventListener("click", exportLogs);
  document.getElementById("clearCacheButton").addEventListener("click", clearCache);
  document.getElementById("refreshIssueButton").addEventListener("click", () => queryCurrentIssue(true));
});
